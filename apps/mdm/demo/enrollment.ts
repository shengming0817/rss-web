/** Explicit synthetic onboarding control plane; never imported by production. */
import { randomUUID } from 'node:crypto'
import { TENANT, type DomainHandler } from './scenario'
import { createReceipts, error, ok } from './http'
import { INSTANCE } from './operations/authorization'
import type { Permission } from '../src/features/operations/clients/authorization'
import { boolean, closed, count, uuid } from '../src/services/decode'
import {
  configuration,
  configurationFilename,
  quantity,
} from '../src/features/enrollment/clients/configurations'
import { entraPolicy } from '../src/features/enrollment/clients/entra'
import { setup } from '../src/features/enrollment/clients/apple'
export function createOnboardingDemo(can: (actor: string, permission: Permission) => boolean) {
  const receipts = createReceipts(),
    configurations = new Map<
      string,
      { value: ReturnType<typeof configuration>; state: 'available' | 'revoked'; actor: string }
    >(),
    configurationOperations = new Map<string, string>()
  let settings = {
    revision: 1,
    values: {
      grantSeconds: 300,
      configurationDefaultSeconds: 86400,
      platforms: ['windows', 'macos'],
    },
    grantMaxSeconds: 604800,
    configurationMaxSeconds: 31536000,
    configurationFilename,
  }
  let policy = {
    revision: 0,
    policy: entraPolicy({
      enabled: false,
      allUsers: false,
      users: [],
      termsVersion: '',
      termsText: '',
      allowBackground: false,
    }),
  }
  const organizations = new Map<
    string,
    {
      id: string
      accountEnrollment: {
        domain: string
        serverUuid: string
        signingKey: string
        enabled: boolean
        revision: number
        signingKeyConfigured: boolean
        accounts: {
          account: string
          principalId: string
          instanceId: string
          revision: number
          enabled: boolean
        }[]
        externalOrganizationVerification: string
      } | null
      ade: ReturnType<typeof ade> | null
    }
  >()
  const profiles = new Map<
      string,
      {
        id: string
        revision: number
        configuration: ReturnType<typeof setup>
        remoteUuid: string | null
      }[]
    >(),
    operations = new Map<
      string,
      { organization: string; operationId: string; kind: string; state: string; result: unknown }
    >()
  function ade(id: string, body: Record<string, unknown>, revision: number) {
    return {
      organizationId: id,
      revision,
      enabled: boolean(body['enabled']),
      serverUuid: uuid(body['serverUuid']),
      orgId: String(body['orgId']),
      keyId: randomUUID(),
      tokenRevision: 0,
      tokenExpiresAt: null as number | null,
      tokenState: 'missing',
      syncedAt: null as number | null,
      externalDeviceVerification: 'not_observed',
    }
  }
  function org(id: string) {
    let value = organizations.get(id)
    if (!value) {
      value = { id, accountEnrollment: null, ade: null }
      organizations.set(id, value)
    }
    return value
  }
  function read(item: NonNullable<ReturnType<typeof configurations.get>>) {
    return {
      configuration: item.value,
      state:
        item.state === 'revoked'
          ? 'revoked'
          : item.value.expiresAt <= Date.now() / 1000
            ? 'expired'
            : 'available',
      createdBy: item.actor,
      responsibleUser: null,
      reserved: 0,
      consumed: 0,
      remaining: item.value.quantity.kind === 'finite' ? item.value.quantity.count : null,
    }
  }
  const handle: DomainHandler = (request) => {
    const { path, method, body, actor } = request
    if (method === 'GET' && path === '/api/v1/agent/enroll/packages') return ok([])
    if (path === '/api/v1/windows/entra/terms/context' && method === 'GET')
      return ok({
        termsText: 'MOCK · 合成条款 / synthetic terms',
        termsVersion: 'demo-1',
        mode: null,
        canDecline: true,
        csrfToken: Buffer.alloc(32, 1).toString('base64url'),
        expiresAt: Math.floor(Date.now() / 1000) + 300,
      })
    if (
      !/^\/api\/v1\/(?:agent-(?:configurations|configuration-operations|enrollment-settings)|apple\/organizations|windows\/entra-policy)(?:\/|$)/.test(
        path,
      )
    )
      return
    const write = method !== 'GET',
      permission: Permission = path.startsWith('/api/v1/agent-')
        ? write
          ? 'agent_enrollment_write'
          : 'agent_enrollment_read'
        : write
          ? 'authorization_write'
          : 'authorization_read'
    if (!can(actor.principalId, permission)) return error('permission_denied', 403)
    if (path === '/api/v1/agent-enrollment-settings') {
      if (!write) return ok(settings)
      const v = closed(body, ['operationId', 'expectedRevision', 'values'])
      return receipts.write(request, uuid(v['operationId']), () => {
        if (v['expectedRevision'] !== settings.revision) return error('operation_conflict')
        settings = {
          ...settings,
          revision: settings.revision + 1,
          values: v['values'] as typeof settings.values,
        }
        return ok(settings)
      })
    }
    const configurationPath = /^\/api\/v1\/agent-configurations(?:\/([^/]+)(\/revoke)?)?$/.exec(
        path,
      ),
      operationPath = /^\/api\/v1\/agent-configuration-operations\/([^/]+)$/.exec(path)
    if (operationPath) {
      const item = configurations.get(configurationOperations.get(uuid(operationPath[1])) ?? '')
      return !item
        ? ok(null)
        : item.actor === actor.principalId
          ? ok(read(item))
          : error('permission_denied', 403)
    }
    if (configurationPath) {
      if (!configurationPath[1] && method === 'POST') {
        const v = closed(body, [
            'operationId',
            'secret',
            'lifetimeSeconds',
            'quantity',
            'targets',
            'channels',
          ]),
          operation = uuid(v['operationId'])
        if (configurationOperations.has(operation)) return error('operation_conflict')
        const value = configuration(
          {
            wireVersion: 1,
            configurationId: randomUUID(),
            tenantId: TENANT,
            origin: 'https://agent.example.test',
            targets: v['targets'],
            channels: v['channels'],
            quantity: quantity(v['quantity']),
            keyId: 'demo',
            expiresAt:
              Math.floor(Date.now() / 1000) +
              (v['lifetimeSeconds'] === null
                ? settings.values.configurationDefaultSeconds
                : count(v['lifetimeSeconds'])),
          },
          TENANT,
        )
        configurations.set(value.configurationId, {
          value,
          state: 'available',
          actor: actor.principalId,
        })
        configurationOperations.set(operation, value.configurationId)
        return {
          status: 200,
          body: new TextEncoder().encode(
            JSON.stringify({
              configuration: value,
              secret: v['secret'],
              signature: Buffer.alloc(64, 1).toString('base64url'),
            }),
          ).buffer,
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${configurationFilename}"`,
          },
        }
      }
      const item = configurations.get(uuid(configurationPath[1]))
      if (!item || item.actor !== actor.principalId) return error('permission_denied', 403)
      if (method === 'GET') return ok(read(item))
      if (configurationPath[2] && method === 'POST') {
        const v = closed(body, ['operationId'])
        return receipts.write(request, uuid(v['operationId']), () => {
          item.state = 'revoked'
          return { status: 204 }
        })
      }
    }
    if (path === '/api/v1/windows/entra-policy') {
      if (!write) return ok(policy)
      const v = closed(body, ['expectedRevision', 'operationId', 'policy'])
      return receipts.write(request, uuid(v['operationId']), () => {
        const next = entraPolicy(v['policy'])
        if (
          v['expectedRevision'] !== policy.revision ||
          (next.termsText !== policy.policy.termsText &&
            next.termsVersion === policy.policy.termsVersion)
        )
          return error('operation_conflict')
        policy = { revision: policy.revision + 1, policy: next }
        return ok({ revision: policy.revision })
      })
    }
    if (path === '/api/v1/apple/organizations') return ok({ items: [...organizations.values()] })
    const apple =
      /^\/api\/v1\/apple\/organizations\/([^/]+)\/(account-enrollment|accounts\/([^/]+)|ade(?:\/(configuration|public-key|operations(?:\/([^/]+))?|profiles|devices))?)$/.exec(
        path,
      )
    if (!apple) return error('malformed_request', 400)
    const id = uuid(apple[1]),
      organization = org(id),
      action = apple[2]!
    if (action === 'account-enrollment') {
      const v = closed(body, ['expectedRevision', 'domain', 'serverUuid', 'signingKey', 'enabled'])
      return receipts.write(request, uuid(request.headers['idempotency-key']), () => {
        const revision = organization.accountEnrollment?.revision ?? 0
        if (v['expectedRevision'] !== revision) return error('operation_conflict')
        organization.accountEnrollment = {
          domain: String(v['domain']),
          serverUuid: uuid(v['serverUuid']),
          signingKey: String(v['signingKey']),
          enabled: boolean(v['enabled']),
          revision: revision + 1,
          signingKeyConfigured: true,
          accounts: organization.accountEnrollment?.accounts ?? [],
          externalOrganizationVerification: 'not_observed',
        }
        return ok({ revision: revision + 1 })
      })
    }
    if (apple[3]) {
      if (!organization.accountEnrollment) return error('resource_not_found', 404)
      const name = decodeURIComponent(apple[3]),
        v = closed(body, ['expectedRevision', 'principalId', 'instanceId', 'enabled'])
      return receipts.write(request, uuid(request.headers['idempotency-key']), () => {
        const old = organization.accountEnrollment!.accounts.find((a) => a.account === name),
          revision = old?.revision ?? 0
        if (v['expectedRevision'] !== revision || v['instanceId'] !== INSTANCE)
          return error('operation_conflict')
        const value = {
          account: name,
          principalId: uuid(v['principalId']),
          instanceId: uuid(v['instanceId']),
          revision: revision + 1,
          enabled: boolean(v['enabled']),
        }
        organization.accountEnrollment!.accounts = organization
          .accountEnrollment!.accounts.filter((a) => a.account !== name)
          .concat(value)
        return ok({ revision: revision + 1 })
      })
    }
    if (action === 'ade/configuration') {
      const v = closed(body, ['expectedRevision', 'enabled', 'serverUuid', 'orgId', 'rotateKey']),
        op = uuid(request.headers['idempotency-key'])
      return receipts.write(request, op, () => {
        if (v['expectedRevision'] !== (organization.ade?.revision ?? 0))
          return error('operation_conflict')
        organization.ade = ade(id, v, (organization.ade?.revision ?? 0) + 1)
        const result = { operationId: op, state: 'succeeded', revision: organization.ade.revision }
        operations.set(op, {
          organization: id,
          operationId: op,
          kind: 'configuration',
          state: 'succeeded',
          result,
        })
        return ok(result)
      })
    }
    if (!organization.ade) return error('resource_not_found', 404)
    if (action === 'ade') return ok(organization.ade)
    if (action === 'ade/public-key') return error('action_not_supported', 501)
    if (action === 'ade/profiles') return ok({ items: profiles.get(id) ?? [] })
    if (action === 'ade/devices') return ok({ items: [], nextCursor: null })
    if (apple[5]) {
      const value = operations.get(uuid(apple[5]))
      if (!value || value.organization !== id) return error('operation_not_found', 404)
      return ok({
        operationId: value.operationId,
        kind: value.kind,
        state: value.state,
        result: value.result,
      })
    }
    if (action === 'ade/operations') {
      const v = body as Record<string, unknown>,
        op = uuid(request.headers['idempotency-key'])
      return receipts.write(request, op, () => {
        const kind = String(v['kind'])
        if (kind === 'token') {
          organization.ade!.tokenRevision++
          organization.ade!.tokenState = 'verified'
          organization.ade!.tokenExpiresAt = Math.floor(Date.now() / 1000) + 86400
        }
        if (kind === 'profile') {
          const values = profiles.get(id) ?? [],
            profile = values.find((p) => p.id === v['id'])
          if ((profile?.revision ?? 0) !== v['expectedRevision']) return error('operation_conflict')
          profiles.set(
            id,
            values
              .filter((p) => p.id !== v['id'])
              .concat({
                id: uuid(v['id']),
                revision: (profile?.revision ?? 0) + 1,
                configuration: setup(v['configuration']),
                remoteUuid: null,
              }),
          )
        }
        const state = kind === 'token' ? 'succeeded' : 'pending'
        operations.set(op, { organization: id, operationId: op, kind, state, result: null })
        return ok({ operationId: op, state })
      })
    }
    return error('malformed_request', 400)
  }
  return {
    handle,
    reset() {
      receipts.reset()
      configurations.clear()
      configurationOperations.clear()
      organizations.clear()
      profiles.clear()
      operations.clear()
      settings = { ...settings, revision: 1 }
      policy = {
        revision: 0,
        policy: entraPolicy({
          enabled: false,
          allUsers: false,
          users: [],
          termsVersion: '',
          termsText: '',
          allowBackground: false,
        }),
      }
    },
    tick() {
      for (const op of operations.values())
        if (op.state === 'pending') {
          if (op.kind === 'profile') {
            const profile = profiles.get(op.organization)?.find((p) => p.remoteUuid === null)
            if (profile) {
              profile.remoteUuid = randomUUID()
              op.result = { remoteProfile: profile.remoteUuid }
            }
          } else if (op.kind === 'sync') {
            organizations.get(op.organization)!.ade!.syncedAt = Math.floor(Date.now() / 1000)
            op.result = { pageDevices: 0, moreToFollow: false, registration: 'not_implied' }
          } else {
            op.state = 'unknown'
            op.result = { reason: 'external_outcome_unknown' }
            continue
          }
          op.state = 'succeeded'
        }
    },
  }
}
