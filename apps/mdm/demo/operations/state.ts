import { createAuditDemo, type AuditAuthority } from './audit'
import { randomUUID } from 'node:crypto'
import { TENANT, type DomainHandler } from '../scenario'
import { closed, count, enumeration, identifier, uuid } from '../../src/services/decode'
import { alert, alertStates, type Alert } from '../features/operations/clients/model'
import { createPages, createReceipts, error, ok, operation } from '../http'
const candidate = (body: object) =>
  ok({ contract: 'operations-v1', tenantId: TENANT, source: 'mock', ...body })
/** One metadata-only operations owner. Domain owners alone publish evidence and resolve alerts. */
export function createOperationsDemo(now: () => number, authority: AuditAuthority) {
  const audit = createAuditDemo(now, authority),
    record = audit.record
  const alerts = new Map<string, Alert>(),
    closures = new Map<
      string,
      {
        alert: string
        revision: number
        operation: string
        actor: string
        at: number
        note: string
      }
    >(),
    pages = createPages(),
    receipts = createReceipts()
  function observeAlert(input: Pick<Alert, 'code' | 'severity' | 'target' | 'evidence'>) {
    const key = JSON.stringify([
        input.code,
        input.target.kind,
        input.target.id,
        input.target.device,
      ]),
      previous = alerts.get(key)
    if (previous && input.evidence.version <= previous.evidence.version) return
    if (previous && input.evidence.state === 'active') closures.delete(previous.id)
    if (!previous && input.evidence.state !== 'active') return
    const at = Math.max(now(), input.evidence.at, previous?.updatedAt ?? 0),
      state =
        input.evidence.state === 'unknown'
          ? (previous?.state ?? 'open')
          : input.evidence.state === 'active'
            ? 'open'
            : 'resolved',
      reopened = state === 'open' && previous?.state === 'resolved'
    const value = alert({
      ...input,
      id: previous?.id ?? randomUUID(),
      revision: (previous?.revision ?? 0) + 1,
      state,
      openedAt: previous?.openedAt ?? at,
      updatedAt: at,
      resolvedAt: state === 'resolved' ? (previous?.resolvedAt ?? at) : null,
      acknowledgment: reopened ? null : (previous?.acknowledgment ?? null),
      operation: reopened ? null : (previous?.operation ?? null),
    })
    alerts.set(key, value)
    if (!previous || previous.state !== state)
      record({
        at,
        actor: null,
        action: state === 'open' ? 'alert_opened' : 'alert_resolved',
        target: value.target,
        operation: null,
        outcome: 'observed',
      })
  }
  function queryKeys(query: URLSearchParams, allowed: string[]) {
    const keys = [...query.keys()]
    if (keys.some((k) => !allowed.includes(k)) || new Set(keys).size !== keys.length)
      throw new Error('Invalid query')
  }
  const handle: DomainHandler = (request, scenario) => {
    const auditReply = audit.handle(request, scenario)
    if (auditReply) return auditReply
    const match =
      /^\/api\/v1\/mdm-candidate\/operations\/(alerts)(?:\/([^/]+)(?:\/([^/]+))?)?$/.exec(
        request.path,
      )
    if (!match) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      const [, kind, id, action] = match
      if (request.method === 'GET') {
        if (action === 'closure' && kind === 'alerts' && id) {
          uuid(id)
          return candidate({ closure: closures.get(id) ?? null })
        }
        if (action) return error('malformed_request', 400)
        if (id) {
          queryKeys(request.query, [])
          uuid(id)
          const value = [...alerts.values()].find((v) => v.id === id)
          return value ? candidate({ alert: value }) : error('operation_not_found', 404)
        }
        queryKeys(request.query, ['cursor', 'limit', 'device', 'state'])
        const device = request.query.has('device') ? identifier(request.query.get('device')) : null,
          state = request.query.has('state')
            ? enumeration(request.query.get('state'), alertStates)
            : null
        const items = [...alerts.values()]
          .reverse()
          .filter((v) => (!device || v.target.device === device) && (!state || v.state === state))
        const key = JSON.stringify([request.actor.principalId, 'alerts', device, state])
        return candidate(pages.page(key, scenario === 'empty' ? [] : items, request.query))
      }
      if (
        request.method !== 'POST' ||
        kind !== 'alerts' ||
        !id ||
        !['acknowledge', 'close'].includes(action ?? '')
      )
        return error('malformed_request', 400)
      queryKeys(request.query, [])
      uuid(id)
      const op = operation(request.body)
      const input = closed(op.input, action === 'close' ? ['note'] : [])
      const note = action === 'close' ? identifier(input['note']) : null
      return receipts.write(request, op.operationId, () => {
        const value = [...alerts.values()].find((v) => v.id === id)
        if (!value) return error('operation_not_found', 404)
        if (action === 'close') {
          if (op.expectedRevision !== value.revision || closures.has(id) || value.state !== 'open')
            return error('operation_conflict')
          value.revision++
          const closure = {
            alert: id,
            revision: value.revision,
            operation: op.operationId,
            actor: request.actor.principalId,
            at: Math.max(now(), value.updatedAt),
            note: note!,
          }
          closures.set(id, closure)
          record({
            at: closure.at,
            actor: closure.actor,
            action: 'alert_closed',
            target: value.target,
            operation: closure.operation,
            outcome: 'accepted',
          })
          return candidate({ closure })
        }
        if (
          op.expectedRevision !== value.revision ||
          value.state !== 'open' ||
          value.acknowledgment
        )
          return error('operation_conflict')
        const at = Math.max(now(), value.updatedAt)
        value.revision++
        value.updatedAt = at
        value.operation = op.operationId
        value.acknowledgment = { actor: request.actor.principalId, at }
        record({
          at,
          actor: request.actor.principalId,
          action: 'alert_acknowledged',
          target: value.target,
          operation: op.operationId,
          outcome: 'accepted',
        })
        return candidate({ alert: structuredClone(value) })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    record,
    observe: audit.observe,
    observeAlert,
    handle,
    reset() {
      audit.reset()
      alerts.clear()
      closures.clear()
      pages.reset()
      receipts.reset()
    },
  }
}
