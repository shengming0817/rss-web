import { randomUUID } from 'node:crypto'
import { TENANT, type DomainHandler } from '../scenario'
import { closed, count, enumeration, identifier, uuid } from '../../src/services/decode'
import {
  auditEntry,
  alert,
  auditActions,
  alertStates,
  type AuditEntry,
  type Alert,
} from '../../src/features/operations/clients/model'
import { createPages, createReceipts, error, ok, operation } from '../http'
const candidate = (body: object) =>
  ok({ contract: 'operations-v1', tenantId: TENANT, source: 'mock', ...body })
/** One metadata-only operations owner. Domain owners alone publish evidence and resolve alerts. */
export function createOperationsDemo(now: () => number) {
  const audit = new Map<string, AuditEntry>(),
    alerts = new Map<string, Alert>(),
    pages = createPages(),
    receipts = createReceipts()
  function record(input: Omit<AuditEntry, 'id'>) {
    const value = auditEntry({ ...input, id: randomUUID() })
    audit.set(value.id, structuredClone(value))
    return value.id
  }
  function observeAlert(input: Pick<Alert, 'code' | 'severity' | 'target' | 'evidence'>) {
    const key = JSON.stringify([
        input.code,
        input.target.kind,
        input.target.id,
        input.target.device,
      ]),
      previous = alerts.get(key)
    if (previous && input.evidence.version <= previous.evidence.version) return
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
    const match =
      /^\/api\/mdm-candidate\/v1\/operations\/(audit|alerts)(?:\/([^/]+)(?:\/([^/]+))?)?$/.exec(
        request.path,
      )
    if (!match) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      const [, kind, id, action] = match
      if (request.method === 'GET') {
        if (action) return error('malformed_request', 400)
        if (id) {
          queryKeys(request.query, [])
          uuid(id)
          const value =
            kind === 'audit' ? audit.get(id) : [...alerts.values()].find((v) => v.id === id)
          return value
            ? candidate(kind === 'audit' ? { entry: value } : { alert: value })
            : error('operation_not_found', 404)
        }
        queryKeys(request.query, [
          'cursor',
          'limit',
          'device',
          ...(kind === 'audit' ? ['action', 'from', 'until'] : ['state']),
        ])
        const q = request.query,
          device = q.has('device') ? identifier(q.get('device')) : null,
          selectedAction = q.has('action') ? enumeration(q.get('action'), auditActions) : null,
          state = q.has('state') ? enumeration(q.get('state'), alertStates) : null,
          from = q.has('from') ? count(Number(q.get('from'))) : null,
          until = q.has('until') ? count(Number(q.get('until'))) : null,
          limit = q.has('limit') ? count(Number(q.get('limit'))) : 20
        if (!limit || limit > 100 || (from !== null && until !== null && from > until))
          throw new Error('Invalid page')
        const items =
          kind === 'audit'
            ? [...audit.values()]
                .reverse()
                .filter(
                  (v) =>
                    (!device || v.target.device === device) &&
                    (!selectedAction || v.action === selectedAction) &&
                    (from === null || v.at >= from) &&
                    (until === null || v.at <= until),
                )
            : [...alerts.values()]
                .reverse()
                .filter(
                  (v) => (!device || v.target.device === device) && (!state || v.state === state),
                )
        const key = JSON.stringify([
          request.actor.principalId,
          kind,
          device,
          selectedAction,
          state,
          from,
          until,
        ])
        return candidate(pages.page<AuditEntry | Alert>(key, scenario === 'empty' ? [] : items, q))
      }
      if (request.method !== 'POST' || kind !== 'alerts' || !id || action !== 'acknowledge')
        return error('malformed_request', 400)
      queryKeys(request.query, [])
      uuid(id)
      const op = operation(request.body)
      closed(op.input, [])
      return receipts.write(request, op.operationId, () => {
        const value = [...alerts.values()].find((v) => v.id === id)
        if (!value) return error('operation_not_found', 404)
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
    observeAlert,
    handle,
    reset() {
      audit.clear()
      alerts.clear()
      pages.reset()
      receipts.reset()
    },
  }
}
