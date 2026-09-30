import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createScenario, TENANT } from '../scenario'
import { createDeviceDemo } from '../devices/state'
import { createAutomationDemo } from '../policies/state'
import type { DemoEvent } from '../policies/schedule'
import { createSecurityClients } from '../../src/features/security/client'
import { createOperationsClients } from '../../src/features/operations/client'
import { createPolicyClients } from '../../src/features/policies/client'
import { operation } from '../../src/services/useOperation'
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-30T00:00:00Z'))
})
afterEach(() => vi.useRealTimers())
async function setup() {
  const devices = createDeviceDemo(),
    automation = createAutomationDemo(devices),
    server = createScenario(
      [automation.handle, devices.handle],
      () => {
        devices.reset()
        automation.reset()
      },
      automation.tick,
      automation.observe,
    )
  let headers: Record<string, string> = {}
  async function login(login: 'demo' | 'reviewer') {
    const result = await server.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
      login,
      password: 'demo',
    })
    headers = {
      'x-csrf-token': (result.body as { csrfToken: string }).csrfToken,
      'x-identity-request': '1',
    }
  }
  await login('demo')
  const transport = {
      async request<T>(o: RequestOptions<T>) {
        const path = o.path.replace(/\{([^}]+)\}/g, (_, key: string) =>
            encodeURIComponent(o.pathParams?.[key] ?? ''),
          ),
          query = new URLSearchParams(
            Object.entries(o.query ?? {})
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, String(v)]),
          ),
          reply = await server.handle(o.method, `${path}?${query}`, o.body, {
            ...headers,
            ...Object.fromEntries(
              Object.entries(o.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
            ),
          })
        if (reply.status !== o.successStatus)
          throw Object.assign(new Error('HTTP request rejected'), { status: reply.status })
        return o.decode(reply.body)
      },
    } as unknown as HttpTransport,
    security = createSecurityClients(transport, TENANT, true),
    operations = createOperationsClients(transport, TENANT, true),
    policies = createPolicyClients(transport, TENANT, true)
  async function control(body: unknown) {
    expect(
      (await server.handle('POST', '/api/mdm-candidate/v1/workspace/scenario', body, headers))
        .status,
    ).toBe(204)
  }
  const event = (event: DemoEvent) => control({ event }),
    now = Math.floor(Date.now() / 1000)
  async function approve(id: string) {
    await login('reviewer')
    await security.requests.decide(id, 'approve', operation({}, 1))
    await login('demo')
  }
  return { server, security, operations, policies, login, control, event, now, approve }
}
it('keeps native compliance and exceptions distinct while risk remediation uses one execution and evidence-driven alert', async () => {
  const f = await setup(),
    { security: s, policies: p, operations: o } = f,
    rule = crypto.randomUUID(),
    baseline = crypto.randomUUID(),
    scope = crypto.randomUUID(),
    created = await s.compliance.put(
      rule,
      operation({
        name: 'Floor boundary',
        severity: 'high',
        enabled: true,
        platform: 'all',
        target: { kind: 'all' },
        criteria: {
          kind: 'predicate',
          field: 'custom.office_floor',
          op: 'ge',
          value: { kind: 'integer', value: 1 },
        },
      }),
    )
  await s.compliance.task(rule, created.task!)
  await s.compliance.task(rule, created.task!)
  const native = await s.compliance.current('device-01')
  expect(native.status).toBe('non_compliant')
  const scoped = operation({
    action: 'put' as const,
    definition: {
      targets: [{ kind: 'device' as const, id: 'device-01' }],
      limitations: null,
      exclusions: [],
    },
  })
  await p.scopes.change(scope, scoped)
  await p.scopes.status(scope, scoped.operationId)
  await p.scopes.status(scope, scoped.operationId)
  await s.governance.put(
    baseline,
    operation({
      name: 'Baseline',
      enabled: true,
      scope,
      rules: [{ id: rule, revision: 1 }],
      graceUntil: null,
    }),
  )
  const exception = operation({
    target: {
      kind: 'compliance_exception' as const,
      device: 'device-01',
      baseline,
      baselineRevision: 1,
      rule,
      ruleVersion: 1,
    },
    reason: 'Private exception reason',
    validFrom: f.now,
    validUntil: f.now + 3600,
  })
  await s.requests.create(exception)
  await f.approve(exception.operationId)
  expect((await s.governance.devices(baseline, 1)).items[0]).toMatchObject({
    native,
    rules: [{ governance: 'exempt' }],
  })
  expect(await s.compliance.current('device-01')).toEqual(native)
  const risk = (await s.risks.list()).items[0]!,
    assessment = (await s.risks.current(risk.id, 'device-01')).assessment,
    request = operation({
      target: {
        kind: 'risk_remediation' as const,
        device: 'device-01',
        risk: risk.id,
        assessment: assessment.id,
        assessmentVersion: assessment.version,
      },
      reason: 'Private patch reason',
      validFrom: f.now,
      validUntil: f.now + 3600,
    })
  await s.requests.create(request)
  await f.approve(request.operationId)
  const alert = (await o.alerts.list({ device: 'device-01' })).items.find(
    (a) => a.code === 'risk_affected',
  )!
  await o.alerts.acknowledge(alert.id, operation({}, alert.revision))
  expect((await s.risks.current(risk.id, 'device-01')).assessment.state).toBe('affected')
  const dispatch = operation({}, 2)
  f.server.set('unknown')
  await expect(s.actions.dispatch(request.operationId, dispatch)).rejects.toMatchObject({
    status: 503,
  })
  f.server.set('normal')
  expect((await s.actions.read(dispatch.operationId)).action.summary.effect).toBe('unverified')
  await s.actions.dispatch(request.operationId, dispatch)
  await f.event({
    kind: 'security_result',
    device: 'device-01',
    task: dispatch.operationId,
    at: f.now + 1,
  })
  expect((await p.executions.read(dispatch.operationId)).effect).toBe('unverified')
  await f.event({
    kind: 'security_detect',
    device: 'device-01',
    task: dispatch.operationId,
    at: f.now + 2,
  })
  expect((await p.executions.read(dispatch.operationId)).effect).toBe('verified_present')
  expect((await s.risks.current(risk.id, 'device-01')).assessment.state).toBe('affected')
  await s.risks.reassess(risk.id, 'device-01', operation({}, assessment.version))
  expect((await o.alerts.read(alert.id)).state).toBe('resolved')
  expect(await s.compliance.current('device-01')).toEqual(native)
  expect((await p.executions.list()).items).toHaveLength(1)
  expect(JSON.stringify(await o.audit.list())).not.toContain('Private')
  await f.control({ module: 'security', source: 'real', scenario: 'normal' })
  await expect(s.compliance.current('device-01')).rejects.toMatchObject({ status: 503 })
  await expect(s.risks.read(risk.id)).rejects.toMatchObject({ status: 503 })
  await expect(p.executions.read(dispatch.operationId)).rejects.toMatchObject({ status: 503 })
  await expect(o.alerts.read(alert.id)).rejects.toMatchObject({ status: 503 })
})
it('requires new consent after a failed remote attempt and keeps user withdrawal distinct from a confirmed session end', async () => {
  const f = await setup(),
    { security: s, operations: o, policies: p } = f,
    context = (await s.support.context('device-01')).context,
    definition = {
      target: {
        kind: 'remote_support' as const,
        device: 'device-01',
        contextRevision: context.revision,
        mode: 'view' as const,
      },
      reason: 'Private attended support reason',
      validFrom: f.now,
      validUntil: f.now + 600,
    },
    first = operation(definition)
  await s.requests.create(first)
  await f.approve(first.operationId)
  expect((await s.support.read(first.operationId)).support.details).toMatchObject({
    consent: { state: 'pending' },
  })
  await expect(s.actions.dispatch(first.operationId, operation({}, 2))).rejects.toMatchObject({
    status: 409,
  })
  await f.event({
    kind: 'remote_consent',
    task: first.operationId,
    device: 'device-01',
    at: f.now + 1,
    active: true,
  })
  const attempt = operation({}, 2)
  await s.actions.dispatch(first.operationId, attempt)
  f.server.set('partial')
  await f.event({
    kind: 'security_result',
    task: attempt.operationId,
    device: 'device-01',
    at: f.now + 2,
  })
  f.server.set('normal')
  expect((await p.executions.read(attempt.operationId)).execution).toBe('failed')
  const second = operation({
    ...definition,
    target: { ...definition.target, mode: 'control' as const },
  })
  await s.requests.create(second)
  await f.approve(second.operationId)
  await expect(s.actions.dispatch(second.operationId, operation({}, 2))).rejects.toMatchObject({
    status: 409,
  })
  await f.event({
    kind: 'remote_consent',
    task: second.operationId,
    device: 'device-01',
    at: f.now + 3,
    active: true,
  })
  const next = operation({}, 2)
  f.server.set('unknown')
  await expect(s.actions.dispatch(second.operationId, next)).rejects.toMatchObject({ status: 503 })
  f.server.set('normal')
  await s.actions.dispatch(second.operationId, next)
  await f.event({
    kind: 'security_result',
    task: next.operationId,
    device: 'device-01',
    at: f.now + 4,
  })
  await f.event({
    kind: 'support_detect',
    task: next.operationId,
    device: 'device-01',
    at: f.now + 5,
  })
  expect((await s.support.read(second.operationId)).support).toMatchObject({
    action: next.operationId,
    details: { mode: 'control', session: { state: 'active' } },
  })
  await f.event({
    kind: 'remote_ended',
    task: next.operationId,
    device: 'device-01',
    at: f.now + 4,
  })
  expect((await s.support.read(second.operationId)).support.details).toMatchObject({
    session: { state: 'active' },
  })
  await f.event({
    kind: 'remote_revoke',
    task: second.operationId,
    device: 'device-01',
    at: f.now + 6,
  })
  expect((await s.actions.read(next.operationId)).action.summary.effect).toBe('unknown')
  expect((await s.support.read(second.operationId)).support.details).toMatchObject({
    session: { state: 'unknown', endedAt: null },
  })
  await f.event({
    kind: 'remote_ended',
    task: next.operationId,
    device: 'device-01',
    at: f.now + 7,
  })
  expect((await s.actions.read(next.operationId)).action.summary).toEqual(
    await p.executions.read(next.operationId),
  )
  expect((await p.executions.read(next.operationId)).effect).toBe('verified_absent')
  expect(JSON.stringify(await o.audit.list({ device: 'device-01' }))).not.toContain(
    definition.reason,
  )
  await f.control({ module: 'operations', source: 'real', scenario: 'normal' })
  await expect(s.support.read(second.operationId)).rejects.toMatchObject({ status: 503 })
  await expect(s.support.experience('device-01')).rejects.toMatchObject({ status: 503 })
  await expect(p.executions.read(next.operationId)).rejects.toMatchObject({ status: 503 })
  await expect(o.audit.list()).rejects.toMatchObject({ status: 503 })
})
