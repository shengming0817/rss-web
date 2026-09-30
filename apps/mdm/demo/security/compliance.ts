import { randomUUID } from 'node:crypto'
import type { DomainHandler, Scenario } from '../scenario'
import type { createDeviceDemo } from '../devices/state'
import type { createOperationsDemo } from '../operations/state'
import { evaluate, referencedFields } from '../devices/criteria'
import { createPages, createReceipts, error, ok, operation } from '../http'
import { closed, count, identifier, uuid } from '../../src/services/decode'
import {
  complianceDefinition,
  currentCompliance,
  type ComplianceAssessment,
  type ComplianceDefinition,
  type ComplianceHistory,
  type ComplianceRule,
  type ComplianceTask,
} from '../../src/features/security/clients/compliance-model'

type DeviceOwner = Pick<ReturnType<typeof createDeviceDemo>, 'facts' | 'publishedGroup'>
interface RuleState {
  rule: ComplianceRule
  versions: Map<number, ComplianceRule>
  desired: string | null
  currentRun: string | null
}
/** Native-shape synthetic service. Evaluation only runs here, never in the browser. */
export function createComplianceDemo(
  devices: DeviceOwner,
  operations: Pick<ReturnType<typeof createOperationsDemo>, 'record' | 'observeAlert'>,
) {
  const rules = new Map<string, RuleState>(),
    receipts = createReceipts(),
    pages = createPages()
  const epochs = new Map<string, string>()
  let watermark = 0
  function capture(definition: ComplianceDefinition) {
    const facts = devices.facts(),
      selected = referencedFields(definition.criteria)
    const groups = (definition.target.kind === 'groups' ? definition.target.ids : []).map((id) => {
      const g = devices.publishedGroup(id)
      if (!g) throw new Error('Unknown group')
      return {
        id,
        revision: g.definitionVersion,
        memberSet: g.memberSet,
        memberVersion: g.memberVersion,
        assetWatermark: null,
        ready: g.ready,
        members: g.members,
      }
    })
    const fingerprint = JSON.stringify([
      facts.map((d) => [
        d.summary.id,
        d.registrations,
        selected.map((f) => d.inventory.fields[f] ?? null),
      ]),
      groups,
    ])
    return { facts, groups, fingerprint }
  }
  interface Job {
    view: ComplianceTask
    rule: ComplianceRule
    input: ReturnType<typeof capture>
    results: Map<string, ComplianceAssessment>
    reads: number
    evaluatedAt: number
  }
  const tasks = new Map<string, Job>()
  function fresh(job: Job) {
    try {
      return capture(job.rule.definition).fingerprint === job.input.fingerprint
    } catch {
      return false
    }
  }
  function enqueue(r: RuleState) {
    const task = randomUUID()
    tasks.set(task, {
      view: {
        task,
        ruleId: r.rule.id,
        ruleVersion: r.rule.revision,
        factWatermark: ++watermark,
        phase: 'queued',
        processed: 0,
        completed: false,
        failure: null,
        diagnostic: null,
      },
      rule: structuredClone(r.rule),
      input: capture(r.rule.definition),
      results: new Map(),
      reads: 0,
      evaluatedAt: Math.floor(Date.now() / 1000),
    })
    r.desired = task
    return task
  }
  function complete(job: Job, scenario: Scenario) {
    const d = job.rule.definition
    if (job.input.groups.some((g) => !g.ready)) {
      job.view.phase = 'superseded'
      job.view.completed = true
      job.view.failure = 'superseded'
      job.view.diagnostic = { reason: 'group_input_pending' }
      return
    }
    const facts =
      scenario === 'partial'
        ? job.input.facts.slice(0, Math.ceil(job.input.facts.length / 2))
        : job.input.facts
    for (const device of facts) {
      const sources = device.registrations
        .filter((r) => r.status === 'active')
        .map((r) => {
          const key = `${r.registrationId}:${r.generation}`
          if (!epochs.has(key)) epochs.set(key, randomUUID())
          return {
            source: r.source,
            registration: r.registrationId,
            generation: String(r.generation),
            epoch: epochs.get(key)!,
          }
        })
      const windows = sources.some((s) => s.source === 'mdm.windows'),
        macos = sources.some((s) => s.source === 'mdm.apple')
      const platformDecision =
        d.platform === 'all'
          ? 'match'
          : windows === macos
            ? 'unknown'
            : (d.platform === 'windows' ? windows : macos)
              ? 'match'
              : 'no_match'
      const groups = job.input.groups.map((g) => ({
        id: g.id,
        memberSet: g.memberSet,
        decision: g.members.includes(device.summary.id)
          ? ('match' as const)
          : ('no_match' as const),
      }))
      const groupDecision =
        !groups.length || groups.some((g) => g.decision === 'match') ? 'match' : 'no_match'
      const result = evaluate(d.criteria, device.inventory)
      const status =
        platformDecision === 'no_match' || groupDecision === 'no_match'
          ? 'not_applicable'
          : platformDecision === 'unknown' || result.decision === 'unknown'
            ? 'unknown'
            : result.decision === 'match'
              ? 'compliant'
              : 'non_compliant'
      const reason =
        status === 'not_applicable'
          ? platformDecision === 'no_match'
            ? 'platform_not_applicable'
            : 'group_not_applicable'
          : status === 'unknown'
            ? platformDecision === 'unknown'
              ? 'platform_unknown'
              : 'facts_unknown'
            : status === 'compliant'
              ? 'rule_satisfied'
              : 'rule_failed'
      job.results.set(device.summary.id, {
        ruleId: job.rule.id,
        ruleVersion: job.rule.revision,
        dictionaryVersion: 'assets-v1',
        factWatermark: job.view.factWatermark,
        evaluatedAt: job.evaluatedAt,
        groups: job.input.groups.map(({ members: _members, ...g }) => g),
        status,
        reason,
        condition: result.decision,
        applicability: { platform: d.platform, platformDecision, sources, groups },
        explanations: result.explanations,
        evidence: referencedFields(d.criteria).map((field) => ({
          field,
          sources: (device.inventory.fields[field]?.sources ?? []).map((s) =>
            structuredClone(s.evidence),
          ),
        })),
      })
    }
    const r = rules.get(job.rule.id)!
    const superseded = r.desired !== job.view.task || !fresh(job)
    job.view.phase = superseded ? 'superseded' : scenario === 'partial' ? 'failed' : 'published'
    job.view.completed = true
    job.view.failure = superseded
      ? 'superseded'
      : scenario === 'partial'
        ? 'synthetic_evaluation_failure'
        : null
    job.view.processed = job.results.size
    job.view.diagnostic = null
    if (job.view.phase === 'published') {
      r.currentRun = job.view.task
      for (const [device, assessment] of job.results) {
        const target = {
          kind: 'compliance_rule' as const,
          id: job.rule.id,
          device,
          revision: job.rule.revision,
        }
        operations.record({
          at: Math.floor(Date.now() / 1000),
          actor: null,
          action: 'compliance_evaluated',
          target,
          operation: null,
          outcome: 'observed',
        })
        operations.observeAlert({
          code: 'compliance_noncompliant',
          severity: d.severity,
          target,
          evidence: {
            id: job.view.task,
            version: job.view.factWatermark,
            at: job.evaluatedAt,
            state:
              assessment.status === 'non_compliant'
                ? 'active'
                : assessment.status === 'compliant'
                  ? 'cleared'
                  : 'unknown',
          },
        })
      }
    }
  }
  function current(device: string) {
    if (!devices.facts().some((d) => d.summary.id === device)) return
    const rows = [...rules.values()]
      .filter((r) => r.rule.definition.enabled)
      .map((r) => {
        const job = r.currentRun ? tasks.get(r.currentRun) : undefined
        const previous = job?.results.get(device) ?? null
        const assessment = job && r.currentRun === r.desired && fresh(job) ? previous : null
        return {
          ruleId: r.rule.id,
          ruleVersion: r.rule.revision,
          status: assessment?.status ?? 'pending',
          current: assessment,
          previous: assessment ? null : previous,
        }
      })
    const precedence = ['not_applicable', 'compliant', 'pending', 'unknown', 'non_compliant']
    const status = rows.length
      ? rows.reduce(
          (a, b) => (precedence.indexOf(a) >= precedence.indexOf(b.status) ? a : b.status),
          'not_applicable',
        )
      : 'unknown'
    return currentCompliance(
      structuredClone({ device, status, reason: rows.length ? null : 'no_rules', rules: rows }),
      device,
    )
  }
  function history(device: string): ComplianceHistory[] {
    return [...tasks.values()]
      .filter((t) => t.view.completed && t.results.has(device))
      .sort((a, b) => b.evaluatedAt - a.evaluatedAt || b.view.task.localeCompare(a.view.task))
      .map((t) => ({
        ...structuredClone(t.results.get(device)!),
        task: t.view.task,
        disposition:
          t.view.phase === 'published'
            ? 'published'
            : t.view.phase === 'superseded'
              ? 'superseded'
              : 'failed',
      }))
  }
  function queryKeys(query: URLSearchParams, allowed: string[]) {
    const keys = [...query.keys()]
    if (keys.some((k) => !allowed.includes(k)) || new Set(keys).size !== keys.length)
      throw new Error('Invalid query')
  }
  const handle: DomainHandler = (request, scenario) => {
    const ruleRoute =
      /^\/api\/v2\/compliance-rules(?:\/([^/]+)(?:\/(versions|recompute|tasks)(?:\/([^/]+))?)?)?$/.exec(
        request.path,
      )
    const deviceRoute = /^\/api\/v2\/devices\/([^/]+)\/compliance(\/history)?$/.exec(request.path)
    if (!ruleRoute && !deviceRoute) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      if (deviceRoute) {
        if (request.method !== 'GET') return error('malformed_request', 400)
        const device = identifier(decodeURIComponent(deviceRoute[1]!)),
          value = current(device)
        if (!value) return error('inventory_not_found', 404)
        if (!deviceRoute[2]) {
          queryKeys(request.query, [])
          return ok(value)
        }
        queryKeys(request.query, ['cursor', 'from', 'until', 'limit'])
        const number = (key: string) =>
          request.query.has(key) ? count(Number(request.query.get(key))) : undefined
        const from = number('from'),
          until = number('until'),
          limit = number('limit') ?? 50
        if (!limit || limit > 100 || (from !== undefined && until !== undefined && from > until))
          throw new Error('Invalid history window')
        const key = JSON.stringify([request.actor.principalId, device, from, until])
        const page = pages.page(
          key,
          history(device).filter(
            (h) =>
              (from === undefined || h.evaluatedAt >= from) &&
              (until === undefined || h.evaluatedAt <= until),
          ),
          new URLSearchParams({
            limit: String(limit),
            ...(request.query.has('cursor') ? { cursor: request.query.get('cursor')! } : {}),
          }),
        )
        return ok({ items: page.items, nextCursor: page.nextCursor })
      }
      if (!ruleRoute![1]) {
        if (request.method !== 'GET') return error('malformed_request', 400)
        queryKeys(request.query, ['after'])
        const after = request.query.has('after') ? uuid(request.query.get('after')) : null
        const all = [...rules.values()]
          .map((r) => r.rule)
          .filter((r) => !after || r.id > after)
          .sort((a, b) => a.id.localeCompare(b.id))
        return ok({
          items: structuredClone(all.slice(0, 50)),
          nextCursor: all.length > 50 ? all[49]!.id : null,
        })
      }
      queryKeys(request.query, [])
      const id = uuid(ruleRoute![1]),
        suffix = ruleRoute![2],
        tail = ruleRoute![3],
        r = rules.get(id)
      if (request.method === 'GET') {
        if (!r) return error('inventory_not_found', 404)
        if (!suffix) return ok(structuredClone(r.rule))
        if (suffix === 'versions') {
          const version = r.versions.get(count(Number(tail)))
          return version ? ok(structuredClone(version)) : error('inventory_not_found', 404)
        }
        if (suffix === 'tasks') {
          const task = tasks.get(uuid(tail))
          if (!task || task.rule.id !== id) return error('inventory_not_found', 404)
          if (!task.view.completed) {
            task.view.phase = 'evaluating'
            if (task.reads++ > 0) complete(task, scenario)
          }
          return ok(structuredClone(task.view))
        }
        return error('malformed_request', 400)
      }
      const op = operation(request.body)
      return receipts.write(request, op.operationId, () => {
        if (op.expectedRevision !== (r?.rule.revision ?? 0)) return error('operation_conflict')
        if (request.method === 'POST' && suffix === 'recompute' && !tail) {
          closed(op.input, [])
          if (!r?.rule.definition.enabled) return error('operation_conflict')
          const task = enqueue(r)
          operations.record({
            at: Math.floor(Date.now() / 1000),
            actor: request.actor.principalId,
            action: 'compliance_recomputed',
            target: { kind: 'compliance_rule', id, revision: r.rule.revision, device: null },
            operation: op.operationId,
            outcome: 'accepted',
          })
          return ok({ task })
        }
        if (request.method !== 'PUT' || suffix) return error('malformed_request', 400)
        const definition = complianceDefinition(op.input)
        capture(definition)
        // Validate predicate fields/operators even when the first evaluation is still queued.
        for (const device of devices.facts()) evaluate(definition.criteria, device.inventory)
        if (!r && rules.size >= 100) return error('malformed_request', 400)
        const rule = { id, revision: op.expectedRevision + 1, definition }
        const next: RuleState = {
          rule,
          versions: new Map(r?.versions),
          desired: null,
          currentRun: r?.currentRun ?? null,
        }
        next.versions.set(rule.revision, structuredClone(rule))
        rules.set(id, next)
        operations.record({
          at: Math.floor(Date.now() / 1000),
          actor: request.actor.principalId,
          action: 'compliance_saved',
          target: { kind: 'compliance_rule', id, revision: rule.revision, device: null },
          operation: op.operationId,
          outcome: 'accepted',
        })
        return ok({ id, revision: rule.revision, task: definition.enabled ? enqueue(next) : null })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    current,
    history,
    rule: (id: string, revision?: number) =>
      structuredClone(
        revision === undefined ? rules.get(id)?.rule : rules.get(id)?.versions.get(revision),
      ),
    reset() {
      rules.clear()
      tasks.clear()
      receipts.reset()
      pages.reset()
      epochs.clear()
      watermark = 0
    },
  }
}
