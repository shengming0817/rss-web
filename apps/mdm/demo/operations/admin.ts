import { TENANT, type DomainHandler, type DemoRequest, type Scenario } from '../scenario'
import { closed, uuid } from '../../src/services/decode'
import { createPages, createReceipts, error, ok, operation } from '../http'
import {
  connectorDefinition,
  alertRuleDefinition,
  configurationValues,
  maintenanceInput,
  range,
  type Connector,
  type AlertRule,
  type Metrics,
  type Report,
  type Delivery,
  type Maintenance,
} from '../../src/features/operations/clients/admin-model'
import type { createOperationsDemo } from './state'
const reply = (body: object, status = 200) =>
  ok({ contract: 'operations-v1', tenantId: TENANT, source: 'mock', ...body }, status)
export function createAdminDemo(
  now: () => number,
  operations: Pick<ReturnType<typeof createOperationsDemo>, 'record' | 'observeAlert'>,
  devices: (actor: string) => { id: string; platform: string; status: string }[],
) {
  const connectors = new Map<string, Connector>(),
    rules = new Map<string, AlertRule>(),
    reports = new Map<string, Report>(),
    deliveries = new Map<string, Delivery>(),
    jobs = new Map<string, Maintenance>(),
    pages = createPages(),
    receipts = createReceipts()
  const reportOwners = new Map<string, string>()
  let alertVersion = 0
  const pending = new Map<string, { scenario: Scenario; due: number }>()
  const initial = () => ({
    revision: 1,
    operation: null as string | null,
    savedVersion: 1,
    activeVersion: 1,
    state: 'active' as 'saved' | 'active' | 'failed' | 'restart_required',
    values: {
      name: 'Enterprise management',
      publicOrigin: 'https://mdm.example.test',
      certificateRef: 'certificate-binding-1' as string | null,
      apnsRef: null as string | null,
    },
  })
  let configuration = initial()
  const backups = new Set<string>(['demo-backup-1'])
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
    kind: 'connector' | 'report' | 'settings' | 'job',
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
  function recordJob(job: Report | Maintenance) {
    operations.record({
      at: now(),
      actor: null,
      action: 'job_observed',
      target: { kind: 'job', id: job.id, device: null, revision: job.revision },
      operation: job.operation,
      outcome: job.phase === 'failed' ? 'failed' : 'observed',
    })
  }
  function tick() {
    if (configuration.state === 'restart_required') {
      configuration.activeVersion = configuration.savedVersion
      configuration.state = 'active'
      configuration.revision++
      operations.record({
        at: now(),
        actor: null,
        action: 'job_observed',
        target: {
          kind: 'settings',
          id: 'configuration',
          device: null,
          revision: configuration.revision,
        },
        operation: configuration.operation,
        outcome: 'observed',
      })
    }
    for (const [id, p] of pending) {
      if (p.due > now()) continue
      const report = reports.get(id),
        delivery = deliveries.get(id),
        job = jobs.get(id)
      if (job?.phase === 'paused') continue
      pending.delete(id)
      if (report) {
        report.revision++
        report.phase = p.scenario === 'partial' ? 'failed' : 'completed'
        report.result =
          report.phase === 'completed'
            ? stats(report.range.from, report.range.until, p.scenario, reportOwners.get(id)!)
            : null
        recordJob(report)
      }
      if (delivery) {
        delivery.revision++
        delivery.at = now()
        delivery.state =
          delivery.kind === 'test' ? 'passed' : delivery.attempt === 1 ? 'failed' : 'delivered'
        if (p.scenario === 'partial') delivery.state = 'unknown'
        delivery.reason =
          delivery.state === 'failed'
            ? 'connection_refused'
            : delivery.state === 'unknown'
              ? 'delivery_timeout'
              : null
        const connector = connectors.get(delivery.connector)
        if (connector)
          connector.health =
            delivery.state === 'failed'
              ? 'disconnected'
              : delivery.state === 'unknown'
                ? 'backlog'
                : 'healthy'
        operations.record({
          at: now(),
          actor: null,
          action: 'job_observed',
          target: {
            kind: 'connector',
            id: delivery.connector,
            device: null,
            revision: connector?.revision ?? null,
          },
          operation: delivery.operation,
          outcome:
            delivery.state === 'failed'
              ? 'failed'
              : delivery.state === 'unknown'
                ? 'unknown'
                : 'observed',
        })
      }
      if (job && job.phase === 'accepted') {
        job.revision++
        job.phase = p.scenario === 'partial' ? 'failed' : 'completed'
        job.effect = job.phase === 'failed' ? 'failed' : 'unverified'
        if (job.input.kind === 'agent_upgrade') {
          job.downloadBytes = job.input.method === 'delta' ? 4_000_000 : 24_000_000
          job.rebuild =
            job.input.method === 'delta'
              ? job.phase === 'failed'
                ? 'failed'
                : 'completed'
              : 'not_applicable'
          job.fallback =
            job.input.method === 'delta' && job.phase === 'failed' ? 'rebuild_failed' : null
        }
        if (job.input.kind === 'backup' && job.phase === 'completed') backups.add(job.input.target)
        recordJob(job)
      }
    }
    for (const rule of rules.values()) {
      const value =
        rule.definition.signal === 'connector_failure'
          ? [...connectors.values()].filter((c) => c.health === 'disconnected').length
          : rule.definition.signal === 'projection_backlog'
            ? pending.size
            : devices('22222222-2222-4222-8222-222222222222').filter((d) => d.status === 'pending')
                .length
      operations.observeAlert({
        code: rule.definition.signal,
        severity: 'medium',
        target: { kind: 'settings', id: rule.id, device: null, revision: rule.revision },
        evidence: {
          id: rule.id,
          version: ++alertVersion,
          at: now(),
          state:
            rule.definition.enabled && value > rule.definition.threshold ? 'active' : 'cleared',
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
      root = '/api/mdm-candidate/v1/operations'
    if (!path.startsWith(root) || /^.*\/(?:audit|alerts)(?:\/|$)/.test(path)) {
      if (
        !path.startsWith('/api/mdm-candidate/v1/integrations/') &&
        !path.startsWith('/api/mdm-candidate/v1/authorization/delegations')
      )
        return
    }
    try {
      if (request.method === 'GET') {
        if (path === '/api/mdm-candidate/v1/authorization/delegations')
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
        if (path === `${root}/settings`) return reply({ configuration })
        if (path === `${root}/diagnostics`)
          return reply({
            diagnostics: {
              asOf: now(),
              scope: 'authorized',
              complete: scenario !== 'partial',
              components: ['certificate', 'apns', 'identity_audit', 'database', 'broker'].map(
                (name) => ({
                  name,
                  state:
                    name === 'apns' ? 'unknown' : scenario === 'partial' ? 'failed' : 'healthy',
                  expiresAt: name === 'certificate' ? now() + 86400 : null,
                }),
              ),
              taskBacklog: scenario === 'partial' ? null : pending.size,
              projectionBacklog: scenario === 'partial' ? 12 : 0,
              agents: devices(request.actor.principalId).map((v) => ({
                device: v.id,
                platform: v.platform === 'macos' ? 'macos' : 'windows',
                version: v.status === 'pending' ? null : '1.0.0',
                health: scenario === 'partial' ? 'offline' : 'unknown',
              })),
              content: scenario === 'partial' ? 'backlog' : 'unknown',
              deployment: 'demo-deployment-1',
              backups: [...backups],
            },
          })
        if (path === `${root}/reports`)
          return list(
            request,
            scenario,
            [...reports.values()]
              .filter((v) => reportOwners.get(v.id) === request.actor.principalId)
              .reverse(),
          )
        if (path === `${root}/alert-rules`) return list(request, scenario, [...rules.values()])
        if (path === `${root}/maintenance`)
          return list(request, scenario, [...jobs.values()].reverse())
        const jobMatch =
          /^\/api\/mdm-candidate\/v1\/operations\/(reports|maintenance)\/([^/]+)$/.exec(path)
        if (jobMatch) {
          const value =
            jobMatch[1] === 'reports' ? reports.get(uuid(jobMatch[2])) : jobs.get(uuid(jobMatch[2]))
          if (
            jobMatch[1] === 'reports' &&
            reportOwners.get(jobMatch[2]!) !== request.actor.principalId
          )
            return error('operation_not_found', 404)
          return value ? reply({ job: value }) : error('operation_not_found', 404)
        }
        if (path === '/api/mdm-candidate/v1/integrations/connectors')
          return list(request, scenario, [...connectors.values()])
        const c =
          /^\/api\/mdm-candidate\/v1\/integrations\/connectors\/([^/]+)(?:\/(deliveries))?$/.exec(
            path,
          )
        if (c) {
          const connector = connectors.get(uuid(c[1]))
          if (!connector) return error('operation_not_found', 404)
          return c[2]
            ? list(
                request,
                scenario,
                [...deliveries.values()]
                  .reverse()
                  .filter((v) => v.connector === c[1] && v.kind === 'event'),
              )
            : reply({ connector })
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
      if (path === `${root}/settings`) {
        const input = configurationValues(op.input)
        return receipts.write(request, op.operationId, () => {
          if (op.expectedRevision !== configuration.revision) return error('operation_conflict')
          configuration = {
            ...configuration,
            revision: configuration.revision + 1,
            operation: op.operationId,
            savedVersion: configuration.savedVersion + 1,
            state: 'saved',
            values: input,
          }
          record(request, 'configuration', 'settings', op.operationId, configuration.revision)
          return reply({ configuration })
        })
      }
      if (path === `${root}/settings/activate`) {
        closed(op.input, [])
        return receipts.write(request, op.operationId, () => {
          if (op.expectedRevision !== configuration.revision || configuration.state !== 'saved')
            return error('operation_conflict')
          configuration = {
            ...configuration,
            revision: configuration.revision + 1,
            operation: op.operationId,
            state: scenario === 'partial' ? 'failed' : 'restart_required',
          }
          record(request, 'configuration', 'settings', op.operationId, configuration.revision)
          return reply({ configuration })
        })
      }
      if (path === `${root}/maintenance`) {
        const input = maintenanceInput(op.input)
        if (input.kind === 'restore' && !backups.has(input.target))
          return error('operation_not_found', 404)
        if (input.kind !== 'agent_upgrade' && input.method !== 'full')
          return error('malformed_request', 400)
        return receipts.write(request, op.operationId, () => {
          if (op.expectedRevision !== 0) return error('operation_conflict')
          const job: Maintenance = {
            id: op.operationId,
            revision: 1,
            operation: op.operationId,
            phase: 'accepted',
            createdAt: now(),
            input,
            effect: 'unknown',
            components: input.kind === 'agent_upgrade' ? ['service', 'collector'] : [],
            downloadBytes: null,
            rebuild: input.method === 'delta' ? 'pending' : 'not_applicable',
            fallback: null,
            health: 'unknown',
          }
          jobs.set(job.id, job)
          schedule(job.id, scenario)
          record(request, job.id, 'job', op.operationId, 1, 'job_accepted')
          return reply({ job }, 202)
        })
      }
      const changeJob =
        /^\/api\/mdm-candidate\/v1\/operations\/maintenance\/([^/]+)\/(pause|resume|cancel)$/.exec(
          path,
        )
      if (changeJob) {
        const id = uuid(changeJob[1])
        closed(op.input, [])
        return receipts.write(request, op.operationId, () => {
          const job = jobs.get(id)
          if (!job) return error('operation_not_found', 404)
          const action = changeJob[2]
          if (
            job.revision !== op.expectedRevision ||
            (action === 'resume' ? job.phase !== 'paused' : job.phase !== 'accepted')
          )
            return error('operation_conflict')
          job.revision++
          job.operation = op.operationId
          job.phase = action === 'resume' ? 'accepted' : action === 'pause' ? 'paused' : 'cancelled'
          if (action === 'resume') schedule(id, scenario)
          if (action === 'cancel') pending.delete(id)
          record(request, id, 'job', op.operationId, job.revision)
          return reply({ job })
        })
      }
      const ruleMatch = /^\/api\/mdm-candidate\/v1\/operations\/alert-rules\/([^/]+)$/.exec(path)
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
          record(request, id, 'settings', op.operationId, rule.revision)
          return reply({ rule })
        })
      }
      const c =
        /^\/api\/mdm-candidate\/v1\/integrations\/connectors\/([^/]+)(?:\/(test|deliver|deliveries\/([^/]+)\/retry))?$/.exec(
          path,
        )
      if (!c) return
      const id = uuid(c[1]),
        action = c[2]
      if (!action) {
        const definition = connectorDefinition(op.input)
        return receipts.write(request, op.operationId, () => {
          if ((connectors.get(id)?.revision ?? 0) !== op.expectedRevision)
            return error('operation_conflict')
          const connector: Connector = {
            id,
            revision: op.expectedRevision + 1,
            operation: op.operationId,
            definition,
            health: definition.enabled ? 'unknown' : 'disabled',
          }
          connectors.set(id, connector)
          record(request, id, 'connector', op.operationId, connector.revision)
          return reply({ connector })
        })
      }
      closed(op.input, [])
      return receipts.write(request, op.operationId, () => {
        const connector = connectors.get(id),
          previous = c[3] ? deliveries.get(uuid(c[3])) : undefined
        if (!connector) return error('operation_not_found', 404)
        if (
          !connector.definition.enabled ||
          (previous ? previous.revision : connector.revision) !== op.expectedRevision ||
          (c[3] && (!previous || previous.connector !== id || previous.state !== 'failed'))
        )
          return error('operation_conflict')
        const delivery: Delivery = {
          id: op.operationId,
          revision: 1,
          operation: op.operationId,
          connector: id,
          kind: action === 'test' ? 'test' : 'event',
          state: 'queued',
          attempt: previous ? previous.attempt + 1 : 1,
          previous: previous?.id ?? null,
          at: now(),
          reason: null,
        }
        deliveries.set(delivery.id, delivery)
        schedule(delivery.id, scenario)
        record(request, id, 'connector', op.operationId, connector.revision, 'job_accepted')
        return reply({ delivery }, 202)
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    tick,
    reset() {
      connectors.clear()
      rules.clear()
      reports.clear()
      reportOwners.clear()
      alertVersion = 0
      deliveries.clear()
      jobs.clear()
      pending.clear()
      pages.reset()
      receipts.reset()
      backups.clear()
      backups.add('demo-backup-1')
      configuration = initial()
    },
    rules: () => [...rules.values()],
  }
}
