import { directoryPage } from './directory'
/** Synthetic management rules use the same admitted DTO, CAS and idempotency contracts. */
import { MANAGEMENT_TENANT, type DomainHandler } from './scenario'
import { INSTANCE, ADMIN, REVIEWER } from './operations/authorization'
import { createReceipts, error, ok } from './http'
import { closed, count, uuid } from '../src/services/decode'
import {
  platformPermissions,
  ruleForRealm,
  type Rule,
  type Revision,
} from '../src/features/operations/clients/authorization'
const rootRule = '10101010-1010-4010-8010-101010101010',
  readerRule = '20202020-2020-4020-8020-202020202020'
export function createManagementAuthorizationDemo() {
  const rules = new Map<string, Revision<Rule>>(),
    receipts = createReceipts()
  function reset() {
    receipts.reset()
    rules.clear()
    for (const [id, principal, permissions] of [
      [rootRule, ADMIN, platformPermissions],
      [readerRule, REVIEWER, ['authorization_read']],
    ] as const)
      rules.set(id, {
        id,
        revision: 1,
        value: {
          subject: {
            kind: 'user',
            user: { instanceId: INSTANCE, tenantId: MANAGEMENT_TENANT, principalId: principal },
          },
          grants: permissions.map((operation) => ({ operation, scope: { kind: 'tenant' } })),
        },
      })
  }
  function effective(principal: string) {
    return [...rules.values()].flatMap((r) =>
      r.value?.subject.kind === 'user' && r.value.subject.user.principalId === principal
        ? r.value.grants.map((g) => ({
            ...g,
            ruleId: r.id,
            ruleRevision: r.revision,
            subject: r.value!.subject,
            observation: null,
          }))
        : [],
    )
  }
  const handle: DomainHandler = (r, scenario) => {
    const match =
      /^\/api\/v1\/tenant-administration\/authorization(?:\/rules(?:\/([^/]+))?)?$/.exec(r.path)
    if (!match) return
    if (r.actor.tenantId !== MANAGEMENT_TENANT || scenario === 'denied')
      return error('permission_denied', 403)
    const grants = effective(r.actor.principalId),
      can = (p: string) => grants.some((g) => g.operation === p)
    if (r.method === 'GET' && r.path.endsWith('/authorization'))
      return ok({
        instanceId: INSTANCE,
        tenantId: MANAGEMENT_TENANT,
        principalId: r.actor.principalId,
        grants,
      })
    if (r.method === 'GET' && r.path.endsWith('/rules')) {
      if (!can('authorization_read')) return error('permission_denied', 403)
      try {
        return ok(
          directoryPage(
            scenario === 'empty'
              ? []
              : [...rules.values()].map((v) => ({
                  ...v,
                  deleted: v.value === null,
                  subjectKind: v.value?.subject.kind ?? null,
                })),
            r,
            ['id'],
            {
              defaultLimit: 100,
              binding: JSON.stringify([...rules.values()].map((v) => [v.id, v.revision])),
            },
          ),
        )
      } catch {
        return error('malformed_request', 400)
      }
    }
    if (r.method === 'GET' && match[1]) {
      if (!can('authorization_read')) return error('permission_denied', 403)
      const value = rules.get(match[1])
      return value ? ok(value) : error('resource_not_found', 404)
    }
    if (r.method !== 'PUT' || !match[1]) return error('action_not_supported', 501)
    if (!can('authorization_write')) return error('permission_denied', 403)
    try {
      const target = uuid(match[1]),
        body = closed(r.body, ['operationId', 'expectedRevision', 'value']),
        operation = uuid(body['operationId']),
        expected = count(body['expectedRevision']),
        value =
          body['value'] === null ? null : ruleForRealm(body['value'], MANAGEMENT_TENANT, 'platform')
      if (value?.subject.kind === 'user' && value.subject.user.instanceId !== INSTANCE)
        return error('malformed_request', 400)
      return receipts.write(r, operation, () => {
        const old = rules.get(target)
        if (
          (old?.revision ?? 0) !== expected ||
          (!old && value === null) ||
          (old?.value === null && value === null)
        )
          return error('operation_conflict')
        const next = { id: target, revision: expected + 1, value }
        const prospective = [...rules.values()].filter((v) => v.id !== target).concat(next)
        if (
          !['authorization_read', 'authorization_write', 'identity_accounts_manage'].every(
            (permission) =>
              prospective.some(
                (v) =>
                  v.value?.subject.kind === 'user' &&
                  v.value.subject.user.principalId === ADMIN &&
                  v.value.grants.some((g) => g.operation === permission),
              ),
          )
        )
          return error('permission_denied', 403)
        rules.set(target, next)
        return ok({ id: target, revision: next.revision, deleted: value === null })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  reset()
  return { handle, reset }
}
