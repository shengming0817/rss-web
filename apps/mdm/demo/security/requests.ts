import type { DomainHandler } from '../scenario'
import type { createOperationsDemo } from '../operations/state'
import { closed, enumeration, identifier, uuid } from '../../src/services/decode'
import {
  requestDefinition,
  requestStates,
  securityRequest,
  type SecurityRequest,
  type SecurityRequestTarget,
} from '../../src/features/security/clients/requests-model'
import { createReceipts, error, operation } from '../http'
import { candidate, createSecurityPages, queryKeys } from './http'
/** Closed security approvals, first consumed by compliance exceptions. No generic workflow registry. */
export function createSecurityRequests(
  now: () => number,
  valid: (target: SecurityRequestTarget) => boolean,
  operations: ReturnType<typeof createOperationsDemo>,
) {
  const requests = new Map<string, SecurityRequest>(),
    pages = createSecurityPages(now),
    receipts = createReceipts()
  function audit(
    value: SecurityRequest,
    action:
      | 'request_created'
      | 'request_approved'
      | 'request_denied'
      | 'request_revoked'
      | 'request_expired'
      | 'request_decision_denied',
    actor: string | null,
    op: string | null,
  ) {
    operations.record({
      at: now(),
      actor,
      action,
      target: {
        kind: 'security_request',
        id: value.id,
        revision: value.revision,
        device: value.target.device,
      },
      operation: op,
      outcome:
        action === 'request_denied' || action === 'request_decision_denied'
          ? 'denied'
          : action === 'request_expired'
            ? 'observed'
            : 'accepted',
    })
  }
  function settle() {
    const at = now()
    for (const value of requests.values())
      if (['pending', 'approved'].includes(value.state) && at >= value.validUntil) {
        value.state = 'expired'
        value.revision++
        audit(value, 'request_expired', null, null)
      }
  }
  const handle: DomainHandler = (request, scenario) => {
    const match =
      /^\/api\/mdm-candidate\/v1\/security\/requests(?:\/([^/]+)(?:\/(approve|deny|revoke))?)?$/.exec(
        request.path,
      )
    if (!match) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      settle()
      const id = match[1] ? uuid(match[1]) : null,
        action = match[2],
        existing = id ? requests.get(id) : undefined
      if (request.method === 'GET') {
        if (action) return error('malformed_request', 400)
        if (id) {
          queryKeys(request.query, [])
          return existing
            ? candidate({ request: structuredClone(existing), asOf: now() })
            : error('operation_not_found', 404)
        }
        queryKeys(request.query, ['device', 'state', 'cursor', 'limit'])
        const device = request.query.has('device') ? identifier(request.query.get('device')) : null,
          state = request.query.has('state')
            ? enumeration(request.query.get('state'), requestStates)
            : null,
          items = [...requests.values()]
            .reverse()
            .filter((v) => (!device || v.target.device === device) && (!state || v.state === state))
        return candidate(
          pages.page(
            JSON.stringify([request.actor.principalId, device, state]),
            scenario === 'empty' ? [] : items,
            request.query,
          ),
        )
      }
      if (request.method !== 'POST') return error('malformed_request', 400)
      queryKeys(request.query, [])
      const op = operation(request.body)
      return receipts.write(request, op.operationId, () => {
        if (!id) {
          const definition = requestDefinition(op.input),
            at = now()
          if (op.expectedRevision !== 0 || requests.has(op.operationId))
            return error('operation_conflict')
          if (definition.validUntil <= at || definition.validUntil > at + 30 * 86400)
            return error('malformed_request', 400)
          if (!valid(definition.target)) return error('operation_conflict')
          const value = securityRequest({
            ...definition,
            id: op.operationId,
            revision: 1,
            operation: op.operationId,
            requester: request.actor.principalId,
            createdAt: at,
            state: 'pending',
            decision: null,
            revocation: null,
          })
          requests.set(value.id, value)
          audit(value, 'request_created', request.actor.principalId, op.operationId)
          return candidate({ request: structuredClone(value), asOf: at })
        }
        closed(op.input, [])
        if (!existing) return error('operation_not_found', 404)
        if (
          existing.revision !== op.expectedRevision ||
          !['pending', 'approved'].includes(existing.state)
        )
          return error('operation_conflict')
        if (action === 'revoke') {
          if (![existing.requester, existing.decision?.by].includes(request.actor.principalId))
            return error('permission_denied', 403)
          existing.state = 'revoked'
          existing.revocation = { by: request.actor.principalId, at: now() }
        } else {
          if (action !== 'approve' && action !== 'deny') return error('malformed_request', 400)
          if (existing.requester === request.actor.principalId) {
            audit(existing, 'request_decision_denied', request.actor.principalId, op.operationId)
            return error('permission_denied', 403)
          }
          if (existing.state !== 'pending' || (action === 'approve' && !valid(existing.target)))
            return error('operation_conflict')
          existing.state = action === 'approve' ? 'approved' : 'denied'
          existing.decision = { by: request.actor.principalId, at: now(), value: existing.state }
        }
        existing.revision++
        existing.operation = op.operationId
        audit(
          existing,
          action === 'revoke'
            ? 'request_revoked'
            : action === 'approve'
              ? 'request_approved'
              : 'request_denied',
          request.actor.principalId,
          op.operationId,
        )
        return candidate({ request: structuredClone(existing), asOf: now() })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    settle,
    rows() {
      settle()
      return structuredClone([...requests.values()])
    },
    reset() {
      requests.clear()
      pages.reset()
      receipts.reset()
    },
  }
}
