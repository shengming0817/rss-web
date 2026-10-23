import { computed, reactive, readonly, shallowRef, watch } from 'vue'
import type { IdentitySession } from '@rss/auth'
import { isRssApiError } from '@rss/api/mdm'
import type { createAuthorizationClient } from '../features/operations/clients/authorization'
import {
  nativeChannel,
  type RegistrationChannel,
  type Admission,
  type ChannelStatus,
  type createRegistrationChannelsClient,
} from './registrationChannels'

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
    publicEndpoints = shallowRef<Awaited<ReturnType<typeof client.read>>['publicEndpoints']>(),
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
    publicEndpoints.value = undefined
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
    publicEndpoints.value = undefined
    writable.value = false
    const request = (async () => {
      try {
        const identity = await authorization.effective()
        if (identity.tenantId !== tenant || identity.principalId !== principal)
          throw new Error('Wrong registration actor')
        const values = await client.read(identity.instanceId)
        if (disposed || current !== generation || read !== reads) return
        statuses.value = values.channels
        publicEndpoints.value = values.publicEndpoints
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
    publicEndpoints: readonly(publicEndpoints),
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
