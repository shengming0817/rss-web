/** Mutable quota settings share the existing enrollment and device lifecycle owner. */
import { randomUUID } from 'node:crypto'
import { TENANT, type DomainHandler } from '../scenario'
import { ADMIN, INSTANCE } from '../operations/authorization'
import { createReceipts, error, ok } from '../http'
import { closed, count, enumeration, identifier, nullable, uuid } from '../../src/services/decode'
import { user } from '../../src/features/operations/clients/authorization'
import {
  channels,
  configuration,
  type Channel,
  type Limits,
} from '../../src/features/devices/clients/registration'
import type { Enrollment } from './enrollment'
import type { DemoDevice } from './fixtures'
interface Config {
  revision: number
  limits: Limits
}
export function createRegistrationDemo(
  enrollments: Map<string, Enrollment>,
  devices: () => Map<string, DemoDevice>,
  create: DomainHandler,
) {
  const settings = new Map<string, Config>(),
    responsibilities = new Map<string, { revision: number; user: ReturnType<typeof user> | null }>()
  const grants = new Map<
    string,
    {
      grantId: string
      state: 'available' | 'revoked'
      expiresAt: number
      platform: 'windows' | 'macos'
      actor: string
    }
  >()
  const receipts = createReceipts()
  const config = (target: string): Config =>
    settings.get(target) ?? {
      revision: 0,
      limits:
        target === 'tenant'
          ? { agent: 20, windows_mdm: 20, macos_mdm: 20 }
          : { agent: null, windows_mdm: null, macos_mdm: null },
    }
  function usage(actor: string) {
    const now = Math.floor(Date.now() / 1000),
      defaults = config('tenant'),
      overrides = config(actor)
    return {
      tenantId: TENANT,
      instanceId: INSTANCE,
      principalId: actor,
      asOf: now,
      channels: channels.map((channel) => {
        const source = channel === 'windows_mdm' ? 'mdm.windows' : 'mdm.apple'
        const owned = [...enrollments.values()].filter(
          (e) => e.selfService && e.actor === actor && e.source === source,
        )
        const active =
          channel === 'agent'
            ? 0
            : owned.filter(
                (e) =>
                  e.registrationId &&
                  devices()
                    .get(e.device)
                    ?.registrations.some(
                      (r) => r.registrationId === e.registrationId && r.status === 'active',
                    ),
              ).length
        const reserved =
          channel === 'agent'
            ? [...grants.values()].filter(
                (g) => g.actor === actor && g.state === 'available' && g.expiresAt > now,
              ).length
            : owned.filter((e) => e.status === 'pending' && !e.registrationId && e.expiresAt > now)
                .length
        const limit = overrides.limits[channel] ?? defaults.limits[channel] ?? 20,
          used = active + reserved
        return {
          channel,
          limit,
          active,
          reserved,
          used,
          overLimit: Math.max(0, used - limit),
          canEnroll: used < limit,
        }
      }),
    }
  }
  function admit(actor: string, channel: Channel) {
    return usage(actor).channels.find((c) => c.channel === channel)!.canEnroll
  }
  const handle: DomainHandler = (request, scenario) => {
    const { path, method, actor } = request
    const quota =
      /^\/api\/v1\/registration-quotas\/(me|defaults|users\/([^/]+)\/([^/]+)(\/usage)?)$/.exec(path)
    const responsibility = /^\/api\/v1\/devices\/([^/]+)\/registration-user$/.exec(path)
    const agent = /^\/api\/v1\/self-enrollments\/agent(?:\/([^/]+)\/cancel)?$/.exec(path)
    if (quota) {
      if (quota[1] === 'me')
        return method === 'GET' ? ok(usage(actor.principalId)) : error('malformed_request', 400)
      if (actor.principalId !== ADMIN) return error('permission_denied', 403)
      if (quota[2] && uuid(quota[2]) !== INSTANCE) return error('malformed_request', 400)
      const target = quota[3] ? uuid(quota[3]) : 'tenant'
      if (method === 'GET') return ok(quota[4] ? usage(target) : config(target))
      if (method !== 'PUT' || quota[4]) return error('malformed_request', 400)
      return receipts.write(request, uuid(request.headers['idempotency-key']), () => {
        const body = closed(request.body, ['expectedRevision', 'limits']),
          value = configuration({
            revision: count(body['expectedRevision']) + 1,
            limits: body['limits'],
          })
        if (config(target).revision !== body['expectedRevision']) return error('operation_conflict')
        if (target === 'tenant' && channels.some((c) => value.limits[c] === null))
          return error('malformed_request', 400)
        settings.set(target, value)
        return ok(value)
      })
    }
    if (responsibility) {
      if (actor.principalId !== ADMIN) return error('permission_denied', 403)
      const id = identifier(decodeURIComponent(responsibility[1]!))
      if (
        ![...enrollments.values()].some(
          (e) => e.device === id && !e.selfService && e.status !== 'cancelled',
        )
      )
        return error('resource_not_found', 404)
      const current = responsibilities.get(id) ?? { revision: 0, user: null }
      if (method === 'GET') return ok(current)
      if (method !== 'PUT') return error('malformed_request', 400)
      return receipts.write(request, uuid(request.headers['idempotency-key']), () => {
        const body = closed(request.body, ['expectedRevision', 'user'])
        if (body['expectedRevision'] !== current.revision) return error('operation_conflict')
        const value = {
          revision: current.revision + 1,
          user: nullable(body['user'], (v) => user(v, TENANT, INSTANCE)),
        }
        responsibilities.set(id, value)
        return ok(value)
      })
    }
    if (agent && method === 'POST') {
      const raw = closed(
        request.body,
        agent[1] ? ['operationId'] : ['wireVersion', 'operationId', 'secret', 'platform'],
      )
      return receipts.write(request, uuid(raw['operationId']), () => {
        let value
        if (agent[1]) {
          value = grants.get(uuid(agent[1]))
          if (!value || value.actor !== actor.principalId) return error('permission_denied', 403)
          value.state = 'revoked'
        } else {
          if (
            raw['wireVersion'] !== 1 ||
            typeof raw['secret'] !== 'string' ||
            !/^[A-Za-z0-9_-]{43}$/.test(raw['secret'])
          )
            return error('malformed_request', 400)
          if (!admit(actor.principalId, 'agent')) return error('registration_limit', 429)
          value = {
            grantId: randomUUID(),
            state: 'available' as const,
            expiresAt: Math.floor(Date.now() / 1000) + 300,
            platform: enumeration(raw['platform'], ['windows', 'macos'] as const),
            actor: actor.principalId,
          }
          grants.set(value.grantId, value)
        }
        const view = {
          grantId: value.grantId,
          state: value.state,
          expiresAt: value.expiresAt,
          platform: value.platform,
        }
        return ok({ wireVersion: 1, ...view })
      })
    }
    if (path !== '/api/v1/self-enrollments' || method !== 'POST') return
    const op = uuid(request.headers['idempotency-key'])
    return receipts.write(request, op, () => {
      const raw = closed(request.body, ['source', 'password'], ['windowsProfile']),
        source = enumeration(raw['source'], ['mdm.windows', 'mdm.apple'] as const)
      if (!admit(actor.principalId, source === 'mdm.windows' ? 'windows_mdm' : 'macos_mdm'))
        return error('registration_limit', 429)
      const deviceId = `self:${INSTANCE}:${actor.principalId}:${op}`
      const reply = create(
        { ...request, path: '/api/v1/enrollments', body: { ...raw, deviceId } },
        scenario,
      )
      if (!reply || reply.status !== 200) return reply ?? error('service_unavailable', 503)
      const body = reply.body as { enrollmentId: string }
      const e = enrollments.get(body.enrollmentId)!
      e.selfService = true
      e.actor = actor.principalId
      return ok({ ...(reply.body as object), deviceId })
    })
  }
  return {
    handle,
    admit,
    reset() {
      settings.clear()
      responsibilities.clear()
      grants.clear()
      receipts.reset()
    },
  }
}
