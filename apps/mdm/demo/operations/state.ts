import { randomUUID } from 'node:crypto'
import { TENANT, type DomainHandler, type DemoObservation } from '../scenario'
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
  const recorded = new Set<string>()
  function record(
    input: Omit<AuditEntry, 'id' | 'stream' | 'stage' | 'status'> &
      Partial<Pick<AuditEntry, 'stream' | 'stage' | 'status'>>,
  ) {
    const value = auditEntry({
      stream: 'mdm_business',
      stage: 'business',
      status: null,
      ...input,
      id: randomUUID(),
    })
    const key = JSON.stringify([
      value.actor,
      value.operation,
      value.action,
      value.target,
      value.stage,
      value.outcome,
      value.status,
    ])
    if (value.operation && recorded.has(key)) return value.id
    if (value.operation) recorded.add(key)
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
    const match =
      /^\/api\/mdm-candidate\/v1\/operations\/(audit|alerts)(?:\/([^/]+)(?:\/([^/]+))?)?$/.exec(
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
          ...(kind === 'audit'
            ? ['action', 'from', 'until', 'actor', 'object', 'operation', 'outcome', 'stream']
            : ['state']),
        ])
        const q = request.query,
          actor = q.has('actor') ? uuid(q.get('actor')) : null,
          object = q.has('object') ? identifier(q.get('object')) : null,
          operationId = q.has('operation') ? uuid(q.get('operation')) : null,
          outcome = q.has('outcome')
            ? enumeration(q.get('outcome'), [
                'accepted',
                'denied',
                'failed',
                'unknown',
                'observed',
              ] as const)
            : null,
          stream = q.has('stream')
            ? enumeration(q.get('stream'), ['mdm_business', 'identity_security'] as const)
            : null,
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
                    (!actor || v.actor === actor) &&
                    (!object || v.target?.id === object) &&
                    (!operationId || v.operation === operationId) &&
                    (!outcome || v.outcome === outcome) &&
                    (!stream || v.stream === stream) &&
                    (!device || v.target?.device === device) &&
                    (!selectedAction || v.action === selectedAction) &&
                    (from === null || v.at >= from) &&
                    (until === null || v.at <= until),
                )
            : [...alerts.values()]
                .reverse()
                .filter(
                  (v) => (!device || v.target?.device === device) && (!state || v.state === state),
                )
        const key = JSON.stringify([
          request.actor.principalId,
          kind,
          device,
          selectedAction,
          actor,
          object,
          operationId,
          outcome,
          stream,
          state,
          from,
          until,
        ])
        return candidate(pages.page<AuditEntry | Alert>(key, scenario === 'empty' ? [] : items, q))
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
    observe(event: DemoObservation) {
      if (event.method === 'GET' || event.path.includes('/operations/audit')) return
      record({
        at: event.at,
        actor: event.actor.principalId,
        action:
          event.stream === 'identity_security'
            ? 'identity_session_created'
            : event.status < 300
              ? 'request_succeeded'
              : 'request_failed',
        target: event.target,
        operation: event.operation,
        outcome: event.outcome,
        stream: event.stream,
        stage: 'request',
        status: event.status,
      })
    },
    observeAlert,
    handle,
    reset() {
      recorded.clear()
      audit.clear()
      alerts.clear()
      closures.clear()
      pages.reset()
      receipts.reset()
    },
  }
}
