import { TENANT, type DomainHandler, type DemoRequest, type Scenario } from '../scenario'
import { uuid } from '../../src/services/decode'
import { createPages, createReceipts, error, ok, operation } from '../http'
import {
  alertRuleDefinition,
  range,
  type AlertRule,
  type Metrics,
  type Report,
} from '../../src/features/operations/clients/admin-model'
import type { createOperationsDemo } from './state'
const reply = (body: object, status = 200) =>
  ok({ contract: 'operations-v1', tenantId: TENANT, source: 'mock', ...body }, status)
export function createAdminDemo(
  now: () => number,
  operations: Pick<ReturnType<typeof createOperationsDemo>, 'record' | 'observeAlert'>,
  devices: (actor: string) => { id: string; platform: string; status: string }[],
) {
  const rules = new Map<string, AlertRule>(),
    reports = new Map<string, Report>(),
    pages = createPages(),
    receipts = createReceipts()
  const reportOwners = new Map<string, string>()
  let alertVersion = 0
  const pending = new Map<string, { scenario: Scenario; due: number }>()
  function stats(from: number, until: number, scenario: Scenario, actor: string): Metrics {
    const rows = scenario === 'empty' ? [] : devices(actor),
      partial = scenario === 'partial',
      asOf = now()
    // This is the authorized current projection, not historical whole-tenant counts.
    return {
      from,
      until,
      asOf,
      scope: 'authorized',
      complete: !partial,
      known: rows.length,
      unknown: partial ? null : 0,
      windows: partial ? null : rows.filter((v) => v.platform === 'windows').length,
      macos: partial ? null : rows.filter((v) => v.platform === 'macos').length,
      pending: partial ? null : rows.filter((v) => v.status === 'pending').length,
      trend:
        asOf >= from && asOf <= until
          ? [{ at: asOf, known: rows.length, unknown: partial ? null : 0 }]
          : [],
    }
  }
  function record(
    request: DemoRequest,
    id: string,
    kind: 'report' | 'alert_rule',
    op: string,
    revision: number,
    action: 'management_changed' | 'job_accepted' = 'management_changed',
  ) {
    operations.record({
      at: now(),
      actor: request.actor.principalId,
      action,
      target: { kind, id, device: null, revision },
      operation: op,
      outcome: 'accepted',
    })
  }
  function recordJob(job: Report, kind: 'report') {
    operations.record({
      at: now(),
      actor: null,
      action: 'job_observed',
      target: { kind, id: job.id, device: null, revision: job.revision },
      operation: job.operation,
      outcome: job.phase === 'failed' ? 'failed' : 'observed',
    })
  }
  function diagnosticFacts(actor: string, scenario: Scenario) {
    return {
      projectionBacklog: scenario === 'partial' ? 12 : 0,
      agents: devices(actor).map((v) => ({
        device: v.id,
        platform: v.platform === 'macos' ? ('macos' as const) : ('windows' as const),
        version: v.status === 'pending' ? null : '1.0.0',
        health: scenario === 'partial' ? ('offline' as const) : ('unknown' as const),
      })),
    }
  }
  function tick(scenario: Scenario) {
    for (const [id, p] of pending) {
      if (p.due > now()) continue
      pending.delete(id)
      const report = reports.get(id)
      if (report) {
        report.revision++
        report.phase = p.scenario === 'partial' ? 'failed' : 'completed'
        report.result =
          report.phase === 'completed'
            ? stats(report.range.from, report.range.until, p.scenario, reportOwners.get(id)!)
            : null
        recordJob(report, 'report')
      }
    }
    const facts = diagnosticFacts('22222222-2222-4222-8222-222222222222', scenario)
    for (const rule of rules.values()) {
      const value =
        rule.definition.signal === 'connector_failure'
          ? null
          : rule.definition.signal === 'projection_backlog'
            ? facts.projectionBacklog
            : facts.agents.some((d) => d.health === 'unknown')
              ? null
              : facts.agents.filter((d) => d.health === 'offline').length
      operations.observeAlert({
        code: rule.definition.signal,
        severity: 'medium',
        target: { kind: 'alert_rule', id: rule.id, device: null, revision: rule.revision },
        evidence: {
          id: rule.id,
          version: ++alertVersion,
          at: now(),
          state: !rule.definition.enabled
            ? 'cleared'
            : value === null
              ? 'unknown'
              : value > rule.definition.threshold
                ? 'active'
                : 'cleared',
        },
      })
    }
  }
  function list<T>(request: DemoRequest, scenario: Scenario, items: T[]) {
    const keys = [...request.query.keys()]
    if (keys.some((k) => !['cursor', 'limit'].includes(k)) || new Set(keys).size !== keys.length)
      throw new Error('Invalid list query')
    return reply(
      pages.page(
        JSON.stringify([request.actor.principalId, request.path]),
        scenario === 'empty' ? [] : items,
        request.query,
      ),
    )
  }
  function schedule(id: string, scenario: Scenario) {
    pending.set(id, { scenario, due: now() + 1 })
  }
  const handle: DomainHandler = (request, scenario) => {
    const path = request.path,
      root = '/api/v1/mdm-candidate/operations'
    if (
      (!path.startsWith(root) || /^.*\/(?:audit|alerts)(?:\/|$)/.test(path)) &&
      !path.startsWith('/api/v1/mdm-candidate/authorization/delegations')
    )
      return
    try {
      if (request.method === 'GET') {
        if (path === '/api/v1/mdm-candidate/authorization/delegations')
          return list(request, scenario, [
            {
              id: '88888888-8888-4888-8888-888888888888',
              principal: '33333333-3333-4333-8333-333333333333',
              department: 'it',
              matching: 'subtree',
              state: scenario === 'partial' ? 'unknown' : 'active',
              authority: 'candidate',
            },
          ])
        if (path === `${root}/metrics`) {
          const r = range({
            from: Number(request.query.get('from') ?? 0),
            until: Number(request.query.get('until') ?? now()),
          })
          return reply({ metrics: stats(r.from, r.until, scenario, request.actor.principalId) })
        }
        if (path === `${root}/reports`)
          return list(
            request,
            scenario,
            [...reports.values()]
              .filter((v) => reportOwners.get(v.id) === request.actor.principalId)
              .reverse(),
          )
        if (path === `${root}/alert-rules`) return list(request, scenario, [...rules.values()])
        const jobMatch = /^\/api\/v1\/mdm-candidate\/operations\/reports\/([^/]+)$/.exec(path)
        if (jobMatch) {
          const id = uuid(jobMatch[1]),
            value = reports.get(id)
          return value && reportOwners.get(id) === request.actor.principalId
            ? reply({ job: value })
            : error('operation_not_found', 404)
        }
        return
      }
      if (request.method !== 'POST') return
      const op = operation(request.body)
      if (path === `${root}/reports`) {
        const input = range(op.input)
        return receipts.write(request, op.operationId, () => {
          if (op.expectedRevision !== 0) return error('operation_conflict')
          const job: Report = {
            id: op.operationId,
            revision: 1,
            operation: op.operationId,
            phase: 'accepted',
            createdAt: now(),
            range: input,
            result: null,
          }
          reportOwners.set(job.id, request.actor.principalId)
          reports.set(job.id, job)
          schedule(job.id, scenario)
          record(request, job.id, 'report', op.operationId, 1, 'job_accepted')
          return reply({ job }, 202)
        })
      }
      const ruleMatch = /^\/api\/v1\/mdm-candidate\/operations\/alert-rules\/([^/]+)$/.exec(path)
      if (ruleMatch) {
        const id = uuid(ruleMatch[1]),
          definition = alertRuleDefinition(op.input)
        return receipts.write(request, op.operationId, () => {
          if ((rules.get(id)?.revision ?? 0) !== op.expectedRevision)
            return error('operation_conflict')
          const rule = {
            id,
            revision: op.expectedRevision + 1,
            operation: op.operationId,
            definition,
          }
          rules.set(id, rule)
          record(request, id, 'alert_rule', op.operationId, rule.revision)
          return reply({ rule })
        })
      }
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    tick,
    reset() {
      rules.clear()
      reports.clear()
      reportOwners.clear()
      alertVersion = 0
      pending.clear()
      pages.reset()
      receipts.reset()
    },
  }
}
