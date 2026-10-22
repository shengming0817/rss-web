/** MOCK_SOURCE: one safe synthetic FactView projection for both formal query families. */
import { randomUUID } from 'node:crypto'
import type { DemoDevice } from '../devices/fixtures'
import type { DemoObservation, DomainHandler } from '../scenario'
import { TENANT } from '../scenario'
import {
  auditQuery,
  type AuditQuery,
  type AuditFact,
} from '../../src/features/operations/clients/audit'
import type { OperationsReference } from '../features/operations/clients/model'
import { createPages, error, ok } from '../http'
export interface AuditInput {
  at: number
  actor: string | null
  action: string
  target: OperationsReference | null
  operation: string | null
  outcome: 'accepted' | 'denied' | 'failed' | 'unknown' | 'observed'
  stream?: 'mdm_business' | 'identity_security'
  stage?: 'request' | 'business' | 'delivery'
  status?: number | null
  relatedOperationIds?: string[]
}
export interface AuditAuthority {
  can: (actor: string) => boolean
  binding: (actor: string) => string
  devices: () => DemoDevice[]
}
export function createAuditDemo(now: () => number, authority: AuditAuthority) {
  const facts = new Map<string, AuditFact>(),
    recorded = new Map<string, string>(),
    histories = new Set<string>(),
    pages = createPages()
  let position = 0
  function record(input: AuditInput) {
    const key = JSON.stringify([
      input.actor,
      input.operation,
      input.action,
      input.target,
      input.stage ?? 'business',
      input.outcome,
      input.status ?? null,
    ])
    if (input.operation && recorded.has(key)) return recorded.get(key)!
    const eventId = randomUUID(),
      target = input.target
    const fact: AuditFact = {
      source: input.stream === 'identity_security' ? 'identity.security' : 'mdm.business',
      eventId,
      position: ++position,
      recordedAt: input.at,
      observedAt: input.at,
      actorKind: input.actor ? 'user' : 'service',
      actor: input.actor ?? 'synthetic-service',
      action: input.action,
      target: { type: target?.kind ?? 'unidentified', id: target?.id ?? 'unidentified' },
      deviceId: target?.device ?? (target?.kind === 'device' ? target.id : null),
      operationId: input.operation,
      relatedOperationIds: input.relatedOperationIds ?? [],
      requestId: null,
      registrationId: null,
      registrationRequestId: null,
      instanceId: null,
      auditOutcome: ['accepted', 'observed'].includes(input.outcome) ? 'succeeded' : input.outcome,
      phase: input.stage ?? 'business',
      executionState: null,
      effect: 'unverified',
      requestWriteOutcome: input.outcome === 'unknown' ? 'unknown' : null,
      supported: target !== null,
    }
    facts.set(eventId, fact)
    if (input.operation) recorded.set(key, eventId)
    return eventId
  }
  function collectHistory() {
    for (const device of authority.devices())
      for (const event of device.history) {
        if (histories.has(event.id)) continue
        histories.add(event.id)
        record({
          at: event.at,
          actor: null,
          action: event.event,
          target: {
            kind: 'device',
            id: device.summary.id,
            device: device.summary.id,
            revision: null,
          },
          operation: event.operation,
          outcome: 'observed',
        })
      }
  }
  const handle: DomainHandler = (request, scenario) => {
    const devicePath = /^\/api\/v1\/devices\/([^/]+)\/timeline$/.exec(request.path)
    if (request.path !== '/api/v1/audit-events' && !devicePath) return
    if (request.method !== 'GET') return error('malformed_request', 400)
    if (
      request.actor.tenantId !== TENANT ||
      !authority.can(request.actor.principalId) ||
      scenario === 'denied'
    )
      return error('permission_denied', 403)
    let query: AuditQuery
    try {
      if (new Set(request.query.keys()).size !== [...request.query.keys()].length)
        throw new Error('Duplicate query')
      const values = Object.fromEntries(
        [...request.query.entries()].map(([key, value]) => [
          key,
          ['from', 'until', 'limit'].includes(key) ? Number(value) : value,
        ]),
      )
      query = auditQuery(values)
      if (devicePath) {
        if (query.device !== undefined) throw new Error('Duplicate device binding')
        query.device = decodeURIComponent(devicePath[1]!)
      }
    } catch {
      return error('malformed_request', 400)
    }
    collectHistory()
    const selected = [...facts.values()]
      .filter(
        (f) =>
          (!query.actor || f.actor === query.actor) &&
          (!query.action || f.action === query.action) &&
          (!query.targetId || f.target.id === query.targetId) &&
          (!query.targetType || f.target.type === query.targetType) &&
          (!query.device || f.deviceId === query.device) &&
          (!query.operationId ||
            f.operationId === query.operationId ||
            f.relatedOperationIds.includes(query.operationId)) &&
          (!query.outcome || f.auditOutcome === query.outcome) &&
          (query.from === undefined || f.recordedAt >= query.from) &&
          (query.until === undefined || f.recordedAt < query.until),
      )
      .sort((a, b) => b.recordedAt - a.recordedAt || b.position - a.position)
    const binding = { ...query }
    delete binding.cursor
    delete binding.limit
    const key = JSON.stringify([
      request.actor.tenantId,
      request.actor.principalId,
      authority.binding(request.actor.principalId),
      devicePath ? 'device' : 'audit',
      Object.entries(binding).sort(([a], [b]) => a.localeCompare(b)),
    ])
    try {
      const page = pages.page(
        key,
        scenario === 'empty' ? [] : selected,
        request.query,
        String(position),
      )
      return ok({
        items: page.items,
        nextCursor: page.nextCursor,
        coverage: {
          indexedThrough: Number(page.snapshot) || null,
          sourceThrough: position || null,
          complete: Number(page.snapshot) >= position,
        },
      })
    } catch {
      return error('operation_conflict', 409)
    }
  }
  return {
    record,
    handle,
    observe(event: DemoObservation) {
      if (event.method === 'GET') return
      const command =
        /^\/api\/v1\/devices\/[^/]+\/operations\/([0-9a-f-]{36})\/(cancel|reauthorize)$/.exec(
          event.path,
        )
      record({
        at: event.at ?? now(),
        actor: event.actor.principalId,
        action: command
          ? `command_${command[2]}`
          : event.stream === 'identity_security'
            ? 'identity_session_created'
            : 'management_write',
        target: event.target,
        operation: event.operation,
        outcome: event.outcome,
        stream: event.stream,
        stage: 'request',
        ...(command ? { relatedOperationIds: [command[1]!] } : {}),
        status: event.status,
      })
    },
    reset() {
      facts.clear()
      recorded.clear()
      histories.clear()
      pages.reset()
      position = 0
    },
  }
}
