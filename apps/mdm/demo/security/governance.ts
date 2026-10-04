import type { DomainHandler } from '../scenario'
import type { createScopeDemo } from '../policies/scopes'
import type { createOperationsDemo } from '../operations/state'
import type { createComplianceDemo } from './compliance'
import type { createSecurityRequests } from './requests'
import { count, uuid } from '../../src/services/decode'
import {
  baselineDefinition,
  baselineDevice,
  type Baseline,
} from '../../src/features/security/clients/governance-model'
import type { SecurityRequestTarget } from '../../src/features/security/clients/requests-model'
import { createReceipts, error, operation } from '../http'
import { candidate, createSecurityPages, queryKeys } from './http'
type ScopeOwner = Pick<ReturnType<typeof createScopeDemo>, 'freeze'>
type FrozenScope = NonNullable<ReturnType<ScopeOwner['freeze']>>
export function createGovernanceDemo(
  now: () => number,
  scopes: ScopeOwner,
  compliance: ReturnType<typeof createComplianceDemo>,
  requests: Pick<ReturnType<typeof createSecurityRequests>, 'rows'>,
  operations: ReturnType<typeof createOperationsDemo>,
) {
  const records = new Map<string, { value: Baseline; scope: FrozenScope }>(),
    pages = createSecurityPages(now),
    receipts = createReceipts()
  function scopeState(record: { value: Baseline; scope: FrozenScope }) {
    const current = scopes.freeze(record.value.definition.scope)
    return !current
      ? ('scope_unavailable' as const)
      : JSON.stringify(current) !== JSON.stringify(record.scope)
        ? ('scope_changed' as const)
        : ('none' as const)
  }
  function valid(target: SecurityRequestTarget) {
    if (target.kind !== 'compliance_exception') return false
    const record = records.get(target.baseline),
      rule = compliance.rule(target.rule)
    return (
      !!record &&
      record.value.definition.enabled &&
      record.value.revision === target.baselineRevision &&
      record.scope.members.includes(target.device) &&
      scopeState(record) === 'none' &&
      record.value.definition.rules.some(
        (r) => r.id === target.rule && r.revision === target.ruleVersion,
      ) &&
      !!rule?.definition.enabled &&
      rule.revision === target.ruleVersion
    )
  }
  function devices(record: { value: Baseline; scope: FrozenScope }) {
    const at = now(),
      approved = requests
        .rows()
        .filter((v) => v.state === 'approved' && v.validFrom <= at && at < v.validUntil),
      scope = scopeState(record)
    return record.scope.members.flatMap((device) => {
      const native = compliance.current(device)
      if (!native) return []
      return [
        baselineDevice({
          device,
          native,
          rules: record.value.definition.rules.map((pin) => {
            const rule = compliance.rule(pin.id),
              row = native.rules.find((r) => r.ruleId === pin.id),
              nativeStatus = row?.status ?? 'unknown',
              drift = !record.value.definition.enabled
                ? 'baseline_disabled'
                : scope !== 'none'
                  ? scope
                  : !rule
                    ? 'missing_rule'
                    : !rule.definition.enabled
                      ? 'rule_disabled'
                      : rule.revision !== pin.revision
                        ? 'rule_changed'
                        : row?.status === 'pending' || !row
                          ? 'pending_assessment'
                          : 'none',
              exemption =
                drift === 'none' && nativeStatus === 'non_compliant'
                  ? approved.find(
                      (v) =>
                        v.target.kind === 'compliance_exception' &&
                        v.target.baseline === record.value.id &&
                        v.target.baselineRevision === record.value.revision &&
                        v.target.rule === pin.id &&
                        v.target.ruleVersion === pin.revision &&
                        v.target.device === device,
                    )
                  : undefined,
              governance =
                drift === 'baseline_disabled'
                  ? 'inactive'
                  : drift !== 'none'
                    ? 'unknown'
                    : nativeStatus === 'compliant'
                      ? 'not_needed'
                      : nativeStatus === 'not_applicable'
                        ? 'not_applicable'
                        : nativeStatus !== 'non_compliant'
                          ? 'unknown'
                          : exemption
                            ? 'exempt'
                            : record.value.definition.graceUntil !== null &&
                                at < record.value.definition.graceUntil
                              ? 'grace'
                              : 'action_required'
            return {
              ruleId: pin.id,
              ruleVersion: pin.revision,
              nativeStatus,
              drift,
              governance,
              request: exemption?.id ?? null,
            }
          }),
        }),
      ]
    })
  }
  const handle: DomainHandler = (request, scenario) => {
    const match = /^\/api\/v1\/mdm-candidate\/security\/baselines(?:\/([^/]+)(\/devices)?)?$/.exec(
      request.path,
    )
    if (!match) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      const id = match[1] ? uuid(match[1]) : null,
        record = id ? records.get(id) : undefined
      if (request.method === 'GET') {
        if (!id) {
          queryKeys(request.query, ['limit', 'cursor'])
          return candidate(
            pages.page(
              `${request.actor.principalId}:baselines`,
              scenario === 'empty' ? [] : [...records.values()].map((r) => r.value),
              request.query,
            ),
          )
        }
        if (!record) return error('operation_not_found', 404)
        if (match[2]) {
          queryKeys(request.query, ['limit', 'cursor', 'revision'])
          if (
            request.query.has('revision') &&
            count(Number(request.query.get('revision'))) !== record.value.revision
          )
            return error('operation_conflict')
          return candidate({
            baseline: id,
            revision: record.value.revision,
            ...pages.page(
              `${request.actor.principalId}:${id}:${record.value.revision}`,
              scenario === 'empty' ? [] : devices(record),
              request.query,
            ),
          })
        }
        queryKeys(request.query, [])
        return candidate({ baseline: structuredClone(record.value), asOf: now() })
      }
      if (request.method !== 'PUT' || !id || match[2]) return error('malformed_request', 400)
      queryKeys(request.query, [])
      const op = operation(request.body)
      return receipts.write(request, op.operationId, () => {
        if (op.expectedRevision !== (record?.value.revision ?? 0))
          return error('operation_conflict')
        const definition = baselineDefinition(op.input),
          scope = scopes.freeze(definition.scope),
          at = now()
        if (!scope || definition.rules.some((r) => !compliance.rule(r.id, r.revision)))
          return error('operation_conflict')
        if (definition.graceUntil !== null && definition.graceUntil > at + 30 * 86400)
          return error('malformed_request', 400)
        const value: Baseline = {
          id,
          revision: op.expectedRevision + 1,
          operation: op.operationId,
          createdAt: record?.value.createdAt ?? at,
          scopeRevision: scope.revision,
          definition,
        }
        records.set(id, { value, scope })
        operations.record({
          at,
          actor: request.actor.principalId,
          action: 'baseline_saved',
          target: { kind: 'baseline', id, revision: value.revision, device: null },
          operation: op.operationId,
          outcome: 'accepted',
        })
        return candidate({ baseline: structuredClone(value), asOf: at })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    valid,
    reset() {
      records.clear()
      pages.reset()
      receipts.reset()
    },
  }
}
