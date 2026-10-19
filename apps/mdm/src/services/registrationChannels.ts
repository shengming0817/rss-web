import { computed, reactive, readonly, shallowRef, watch } from 'vue'
import type { IdentitySession } from '@rss/auth'
import { isRssApiError, type HttpTransport } from '@rss/api/mdm'
import { array, closed, count, enumeration, nullable, unique, uuid } from './decode'
import type { createAuthorizationClient } from '../features/operations/clients/authorization'

export const registrationChannels = ['agent', 'windows_mdm', 'macos_mdm'] as const
export type RegistrationChannel = (typeof registrationChannels)[number]
export function nativeChannel(source: 'mdm.windows' | 'mdm.apple'): RegistrationChannel {
  return source === 'mdm.windows' ? 'windows_mdm' : 'macos_mdm'
}
export type Admission = 'allowed' | 'paused'
function setting(value: unknown) {
  const v = closed(value, ['channel', 'revision', 'admission'])
  return {
    channel: enumeration(v['channel'], registrationChannels),
    revision: count(v['revision']),
    admission: enumeration(v['admission'], ['allowed', 'paused'] as const),
  }
}
export function decodeChannels(value: unknown, tenant: string, instance: string) {
  const v = closed(value, ['tenantId', 'instanceId', 'channels'])
  if (uuid(v['tenantId']) !== tenant || uuid(v['instanceId']) !== instance)
    throw new Error('Wrong registration binding')
  const channels = unique(
    array(v['channels'], (item) => {
      const c = closed(item, ['channel', 'revision', 'admission', 'availability', 'reason'])
      const result = {
        ...setting({ channel: c['channel'], revision: c['revision'], admission: c['admission'] }),
        availability: enumeration(c['availability'], ['unconfigured', 'ready', 'fault'] as const),
        reason: nullable(c['reason'], (r) =>
          enumeration(r, [
            'not_configured',
            'certificate_unavailable',
            'push_unavailable',
            'clock_unavailable',
          ] as const),
        ),
      }
      if (
        (result.availability === 'ready' && result.reason !== null) ||
        (result.availability === 'unconfigured' && result.reason !== 'not_configured') ||
        (result.availability === 'fault' &&
          (result.reason === null || result.reason === 'not_configured'))
      )
        throw new Error('Invalid registration readiness')
      return result
    }),
    (c) => c.channel,
  )
  if (channels.length !== registrationChannels.length)
    throw new Error('Missing registration channel')
  return channels
}
export type ChannelStatus = ReturnType<typeof decodeChannels>[number]
export function createRegistrationChannelsClient(transport: HttpTransport, tenant: string) {
  return {
    read: (instance: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/registration-channels',
        successStatus: 200,
        decode: (v) => decodeChannels(v, tenant, instance),
      }),
    change: (
      channel: RegistrationChannel,
      operationId: string,
      expectedRevision: number,
      admission: Admission,
    ) =>
      transport.request({
        method: 'PUT',
        path: '/api/v1/registration-channels/{channel}/admission',
        pathParams: { channel: enumeration(channel, registrationChannels) },
        headers: { 'Idempotency-Key': uuid(operationId) },
        body: {
          expectedRevision: count(expectedRevision),
          admission: enumeration(admission, ['allowed', 'paused'] as const),
        },
        successStatus: 200,
        decode: (v) => {
          const result = setting(v)
          if (
            result.channel !== channel ||
            result.revision !== expectedRevision + 1 ||
            result.admission !== admission
          )
            throw new Error('Wrong admission receipt')
          return result
        },
      }),
  }
}
interface Command {
  operationId: string
  expectedRevision: number
  admission: Admission
  state: 'submitting' | 'unknown' | 'conflict'
  queried: boolean
}
/** Domain facts and non-secret intent only; the existing session/transport execute every request.
 * ref: vuejs/core v3.5.13 packages/runtime-core/src/apiWatch.ts.
 */
export function createRegistrationChannels(
  client: ReturnType<typeof createRegistrationChannelsClient>,
  session: IdentitySession,
  authorization: Pick<ReturnType<typeof createAuthorizationClient>, 'effective'>,
  tenant: string,
  enabled = true,
) {
  const statuses = shallowRef<ChannelStatus[]>([]),
    loading = shallowRef(false),
    failure = shallowRef(false),
    writable = shallowRef(false),
    commands = reactive(new Map<RegistrationChannel, Command>())
  const binding = () => {
    const s = session.state.value
    return enabled && s.status === 'authenticated' && s.tenant === tenant
      ? [s.tenant, s.identity?.principalId, s.session?.id].join('/')
      : null
  }
  let generation = 0,
    reads = 0,
    disposed = false,
    pending: Promise<void> | undefined
  function invalidate() {
    generation++
    reads++
    statuses.value = []
    loading.value = false
    failure.value = false
    writable.value = false
    pending = undefined
  }
  const stop = watch(
    binding,
    () => {
      invalidate()
      commands.clear()
    },
    { flush: 'sync' },
  )
  function refresh() {
    if (disposed || !binding() || [...commands.values()].some((c) => c.state === 'submitting'))
      return Promise.resolve()
    if (pending) return pending
    const current = generation,
      read = ++reads,
      principal = session.state.value.identity?.principalId
    loading.value = true
    failure.value = false
    // Failed refreshes cannot leave a stale permissive projection usable.
    statuses.value = []
    writable.value = false
    const request = (async () => {
      try {
        const identity = await authorization.effective()
        if (identity.tenantId !== tenant || identity.principalId !== principal)
          throw new Error('Wrong registration actor')
        const values = await client.read(identity.instanceId)
        if (disposed || current !== generation || read !== reads) return
        statuses.value = values
        writable.value = identity.grants.some(
          (g) => g.operation === 'registration_configuration_write' && g.scope.kind === 'tenant',
        )
        for (const command of commands.values())
          if (command.state !== 'submitting') command.queried = true
      } catch {
        if (!disposed && current === generation && read === reads) failure.value = true
      } finally {
        if (!disposed && current === generation && read === reads) {
          loading.value = false
          pending = undefined
        }
      }
    })()
    pending = request
    return request
  }
  function status(channel: RegistrationChannel) {
    return statuses.value.find((v) => v.channel === channel)
  }
  function blocked(channel: RegistrationChannel) {
    const value = status(channel)
    return !value
      ? 'unknown'
      : value.admission === 'paused'
        ? 'paused'
        : value.availability === 'ready'
          ? null
          : value.availability
  }
  async function change(channel: RegistrationChannel, admission: Admission, replay = false) {
    const value = status(channel),
      old = commands.get(channel)
    if (
      disposed ||
      !binding() ||
      !writable.value ||
      !value ||
      (replay ? old?.state !== 'unknown' || !old.queried : !!old)
    )
      throw new Error('Admission requires current facts and explicit resolution')
    const command = replay
      ? old!
      : {
          operationId: crypto.randomUUID(),
          expectedRevision: value.revision,
          admission,
          state: 'submitting' as const,
          queried: false,
        }
    command.state = 'submitting'
    command.queried = false
    commands.set(channel, command)
    // Invalidate in-flight reads before accepting any write receipt.
    const current = generation
    reads++
    pending = undefined
    loading.value = false
    try {
      await client.change(channel, command.operationId, command.expectedRevision, command.admission)
      if (disposed || current !== generation) throw new Error('Stale admission receipt')
      commands.delete(channel)
    } catch (error) {
      if (!disposed && current === generation) {
        if (isRssApiError(error) && error.status === 409) command.state = 'conflict'
        else if (
          !isRssApiError(error) ||
          ['network', 'timeout', 'aborted', 'protocol'].includes(error.cause) ||
          ['operation_unknown', 'operation_rollback_unconfirmed'].includes(error.code)
        )
          command.state = 'unknown'
        else commands.delete(channel)
        // Map values are reactive proxies; replace after mutating the original command.
        if (commands.has(channel)) commands.set(channel, { ...command })
      }
      throw error
    } finally {
      if (!disposed && current === generation) await refresh()
    }
  }
  return {
    statuses: readonly(statuses),
    commands: readonly(commands),
    loading: readonly(loading),
    failure: readonly(failure),
    canWrite: computed(() => writable.value),
    refresh,
    status,
    blocked,
    allowed: (channel: RegistrationChannel) => blocked(channel) === null,
    canContinue(
      value:
        | {
            source: 'mdm.windows' | 'mdm.apple'
            status: string
            registrationId: string | null
            progress: { firstAuthenticatedCheckIn: boolean }
          }
        | undefined,
    ) {
      if (!value || !['pending', 'bound'].includes(value.status)) return false
      const established =
        value.status === 'bound' &&
        value.registrationId !== null &&
        (value.source === 'mdm.apple' || value.progress.firstAuthenticatedCheckIn)
      return established || blocked(nativeChannel(value.source)) === null
    },
    change,
    acceptCurrent(channel: RegistrationChannel) {
      const command = commands.get(channel)
      if (command?.state === 'conflict' && command.queried) commands.delete(channel)
    },
    dispose() {
      disposed = true
      stop()
      invalidate()
      commands.clear()
    },
  }
}
