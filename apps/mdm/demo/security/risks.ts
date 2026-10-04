import { randomUUID } from 'node:crypto'
import type { DomainHandler } from '../scenario'
import type { createDeviceDemo } from '../devices/state'
import type { createOperationsDemo } from '../operations/state'
import { closed, identifier, uuid } from '../../src/services/decode'
import {
  risk,
  riskAssessment,
  type RiskAssessment,
} from '../../src/features/security/clients/risks-model'
import type { SecuritySource } from '../../src/features/security/clients/source'
import type { SecurityRequestTarget } from '../../src/features/security/clients/requests-model'
import { createReceipts, error, operation } from '../http'
import { candidate, createSecurityPages, queryKeys } from './http'
import { hasSecuritySource } from './source'
export function createRisksDemo(
  now: () => number,
  devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts'>,
  operations: ReturnType<typeof createOperationsDemo>,
) {
  const definition = risk({
    id: '61111111-1111-4111-8111-111111111111',
    revision: 1,
    code: 'DEMO-RISK-2026-001',
    title: 'Synthetic browser patch assessment',
    severity: 'high',
    priority: 'high',
    provider: 'RSS synthetic risk feed v1',
    publishedAt: 1780000000,
    software: {
      id: 'browser',
      name: 'Enterprise Browser',
      affectedVersion: '128.0',
      fixedVersion: '129.0',
    },
  })
  const records = new Map<string, RiskAssessment[]>(),
    observations = new Map<
      string,
      { id: string; version: string; at: number; source: SecuritySource }
    >(),
    pages = createSecurityPages(now),
    receipts = createReceipts()
  let initialized = false
  function publish(value: RiskAssessment, op: string | null, actor: string | null) {
    const history = records.get(value.device) ?? []
    history.push(value)
    records.set(value.device, history)
    const target = {
      kind: 'risk' as const,
      id: value.risk,
      device: value.device,
      revision: value.version,
    }
    operations.record({
      at: value.evaluatedAt,
      actor,
      action: 'risk_assessed',
      target,
      operation: op,
      outcome: 'observed',
    })
    operations.observeAlert({
      code: 'risk_affected',
      severity: 'high',
      target,
      evidence: {
        id: value.id,
        version: value.version,
        at: value.evaluatedAt,
        state:
          value.state === 'affected' ? 'active' : value.state === 'clear' ? 'cleared' : 'unknown',
      },
    })
    return structuredClone(value)
  }
  function assess(device: string, unavailable = false) {
    const d = devices.facts().find((d) => d.summary.id === device),
      observation = observations.get(device),
      history = records.get(device),
      valid = observation && hasSecuritySource(d, observation.source),
      fixed = valid && observation.version === definition.software.fixedVersion
    return riskAssessment({
      id: randomUUID(),
      version: (history?.at(-1)?.version ?? 0) + 1,
      risk: definition.id,
      riskRevision: definition.revision,
      device,
      provider: definition.provider,
      evaluatedAt: now(),
      state: unavailable || !valid ? 'unknown' : fixed ? 'clear' : 'affected',
      reason: unavailable
        ? 'feed_unavailable'
        : !observation
          ? 'inventory_missing'
          : !valid
            ? 'source_changed'
            : fixed
              ? 'fixed_version_observed'
              : 'matched',
      software: {
        id: definition.software.id,
        version: valid && !unavailable ? observation.version : null,
      },
      patch: {
        state: unavailable ? 'unknown' : 'available',
        targetVersion: unavailable ? null : definition.software.fixedVersion,
      },
      evidence:
        valid && !unavailable
          ? { id: observation.id, observedAt: observation.at, source: observation.source }
          : null,
    })
  }
  function ensure() {
    if (initialized) return
    initialized = true
    for (const d of devices.facts()) {
      const active = d.registrations.filter((r) => r.status === 'active'),
        r = active.find((r) => r.source === 'agent.builtin') ?? active[0]
      // Explicit synthetic feed inputs, separate from browser-side inventory or install success.
      if (r && d.summary.inventoryAvailable)
        observations.set(d.summary.id, {
          id: randomUUID(),
          version: '128.0',
          at: now(),
          source: { registrationId: r.registrationId, generation: r.generation, source: r.source },
        })
      publish(assess(d.summary.id), null, null)
    }
  }
  function current(id: string, device: string) {
    ensure()
    if (id !== definition.id) return undefined
    let value = records.get(device)?.at(-1)
    if (
      value?.evidence &&
      !hasSecuritySource(
        devices.facts().find((d) => d.summary.id === device),
        value.evidence.source,
      )
    )
      value = publish(assess(device), null, null)
    return value ? structuredClone(value) : undefined
  }
  function valid(target: SecurityRequestTarget) {
    if (target.kind !== 'risk_remediation') return false
    const a = current(target.risk, target.device)
    return (
      a?.id === target.assessment &&
      a.version === target.assessmentVersion &&
      a.state === 'affected' &&
      a.patch.state === 'available' &&
      a.evidence?.id === observations.get(target.device)?.id
    )
  }
  const handle: DomainHandler = (request, scenario) => {
    const match =
      /^\/api\/v1\/mdm-candidate\/security\/risks(?:\/([^/]+)(?:\/devices(?:\/([^/]+)(?:\/(history|reassess))?)?)?)?$/.exec(
        request.path,
      )
    if (!match) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      ensure()
      const id = match[1] ? uuid(match[1]) : null,
        device = match[2] ? identifier(match[2]) : null,
        action = match[3]
      if (id && id !== definition.id) return error('resource_not_found', 404)
      if (request.method === 'GET') {
        if (!id) {
          queryKeys(request.query, ['limit', 'cursor'])
          return candidate(
            pages.page(
              `${request.actor.principalId}:risks`,
              scenario === 'empty' ? [] : [definition],
              request.query,
            ),
          )
        }
        if (!request.path.endsWith('/devices') && !device) {
          queryKeys(request.query, [])
          return candidate({ risk: definition, asOf: now() })
        }
        if (device) {
          const value = current(id, device)
          if (!value) return error('inventory_not_found', 404)
          if (action === 'history') {
            queryKeys(request.query, ['limit', 'cursor'])
            return candidate(
              pages.page(
                `${request.actor.principalId}:${id}:${device}:history`,
                [...records.get(device)!].reverse(),
                request.query,
              ),
            )
          }
          if (action) return error('malformed_request', 400)
          queryKeys(request.query, [])
          return candidate({ assessment: value, asOf: now() })
        }
        queryKeys(request.query, ['limit', 'cursor'])
        return candidate(
          pages.page(
            `${request.actor.principalId}:${id}:devices`,
            scenario === 'empty' ? [] : [...records.keys()].map((device) => current(id, device)!),
            request.query,
          ),
        )
      }
      if (request.method !== 'POST' || !id || !device || action !== 'reassess')
        return error('malformed_request', 400)
      queryKeys(request.query, [])
      const op = operation(request.body)
      closed(op.input, [])
      return receipts.write(request, op.operationId, () => {
        const previous = current(id, device)
        if (!previous) return error('inventory_not_found', 404)
        if (op.expectedRevision !== previous.version) return error('operation_conflict')
        return candidate({
          assessment: publish(
            assess(device, scenario === 'partial'),
            op.operationId,
            request.actor.principalId,
          ),
          operation: op.operationId,
          asOf: now(),
        })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    current,
    valid,
    observe(
      target: Extract<SecurityRequestTarget, { kind: 'risk_remediation' }>,
      source: SecuritySource,
      at: number,
    ) {
      ensure()
      if (
        target.risk !== definition.id ||
        !hasSecuritySource(
          devices.facts().find((d) => d.summary.id === target.device),
          source,
        )
      )
        return false
      const old = observations.get(target.device)
      if (old && at <= old.at) return false
      observations.set(target.device, {
        id: randomUUID(),
        version: definition.software.fixedVersion!,
        at,
        source: structuredClone(source),
      })
      return true
    },
    reset() {
      records.clear()
      observations.clear()
      pages.reset()
      receipts.reset()
      initialized = false
    },
  }
}
