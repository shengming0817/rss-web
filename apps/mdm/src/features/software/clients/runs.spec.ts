import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createRunsClient, softwareRun } from './runs'
const id = '11111111-1111-4111-8111-111111111111',
  task = '22222222-2222-4222-8222-222222222222'
const digest = Array<number>(32).fill(1)
const run = {
  taskId: task,
  policyId: id,
  device: 'device-01',
  registrationId: id,
  generation: 1,
  availableAt: 10,
  deadline: 100,
  state: {
    delivery: { kind: 'received', attempt: task, leaseUntil: 50 },
    execution: 'waiting_reboot',
    cancellation: 'none',
    deadline: 100,
    startedAt: 12,
  },
  effect: 'waiting_reboot',
  userAction: null,
  result: {
    intent: 'install',
    installerExitCode: 0,
    detection: 'present',
    definitionDigest: digest,
    observedVersion: '1',
    evidenceDigest: digest,
    rebootRequired: true,
    diagnostics: {
      stdout: 'synthetic\noutput',
      stderr: '',
      durationMs: 100,
      executedAt: 12,
      failure: null,
    },
    effect: 'waiting_reboot',
  },
}
it('preserves script history without pretending a pending result has a software kind', () => {
  const result = {
    collectedAt: 12,
    receivedAt: 15,
    budgetValid: true,
    outputReference: null,
    exitCode: 0,
    quality: 'complete',
    schemaValid: true,
    output: { count: 1 },
    diagnostics: run.result.diagnostics,
    trusted: true,
  }
  expect(softwareRun({ ...run, effect: 'unverified', result }, true).result).toMatchObject({
    kind: 'script',
    output: { count: 1 },
  })
  expect(softwareRun({ ...run, effect: 'unverified', result: null }, true).result).toBeNull()
  expect(() => softwareRun({ ...run, result: { ...result, effect: 'verified' } }, true)).toThrow()
})
it('enforces wire diagnostic limits and matching deadlines but accepts ecosystem version strings', () => {
  expect(
    softwareRun(
      { ...run, result: { ...run.result, observedVersion: 'release candidate '.repeat(30) } },
      true,
    ).result,
  ).toMatchObject({ observedVersion: 'release candidate '.repeat(30) })
  expect(() => softwareRun({ ...run, deadline: 101 }, true)).toThrow()
  expect(() =>
    softwareRun(
      {
        ...run,
        result: {
          ...run.result,
          diagnostics: { ...run.result.diagnostics, stdout: 'a'.repeat(16385) },
        },
      },
      true,
    ),
  ).toThrow()
})
it('decodes software evidence without conflating a zero exit with verified effect and scopes detail to its Policy', async () => {
  let reply: unknown = run
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply))
  const client = createRunsClient({ request } as unknown as HttpTransport)
  expect((await client.read(id, task)).result).toMatchObject({
    installerExitCode: 0,
    rebootRequired: true,
    effect: 'waiting_reboot',
  })
  reply = { ...run, policyId: task }
  await expect(client.read(id, task)).rejects.toThrow('Wrong software run')
  expect(() =>
    softwareRun({ ...run, state: { ...run.state, execution: 'compliant' } }, true),
  ).toThrow()
})
it('keeps summary diagnostics redacted and uses both fields of the native run cursor', async () => {
  const summary: Record<string, unknown> = { ...run }
  delete summary['policyId']
  const diagnostics: Record<string, unknown> = { ...run.result.diagnostics }
  delete diagnostics['stdout']
  delete diagnostics['stderr']
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode({
      items: [
        {
          ...summary,
          occurrence: 'software:stage:one',
          result: { ...run.result, diagnostics },
        },
      ],
      nextCursor: { availableAt: 10, taskId: task },
    }),
  )
  const result = await createRunsClient({ request } as unknown as HttpTransport).list(id, {
    availableAt: 20,
    taskId: task,
  })
  expect(request.mock.calls[0]![0].query).toEqual({ afterAt: 20, afterId: task })
  expect(result.items[0]!.result!.diagnostics).not.toHaveProperty('stdout')
})

it('decodes the current attempt and all authorization branches and rejects malformed facts', () => {
  const policy = { kind: 'policy', policyId: id, policyVersion: task }
  const self = {
    kind: 'self_service',
    requestId: task,
    subject: { kind: 'user', user: { tenantId: id, instanceId: task, principalId: id } },
    source: 'ai',
    policyId: id,
    policyRevision: 1,
    policyVersion: task,
    allowAi: true,
    riskLevel: 2,
    confirmed: true,
  }
  for (const authorization of [policy, { kind: 'remote_operation', operationId: task }, self])
    expect(softwareRun({ ...run, attemptId: task, authorization }, true)).toMatchObject({
      attemptId: task,
      authorization,
    })
  for (const authorization of [
    { ...policy, policyVersion: 'bad' },
    { ...self, confirmed: false },
    { ...self, allowAi: false },
    { ...self, riskLevel: 3 },
    { ...self, subject: { kind: 'user', user: { ...self.subject.user, token: 'secret' } } },
  ])
    expect(() => softwareRun({ ...run, authorization }, true)).toThrow()
  expect(() => softwareRun({ ...run, attemptId: id }, true)).toThrow('Inconsistent run attempt')
  expect(() =>
    softwareRun(
      { ...run, attemptId: task, state: { ...run.state, delivery: { kind: 'queued' } } },
      true,
    ),
  ).toThrow()
  const remote: Record<string, unknown> = { ...run }
  delete remote['policyId']
  expect(softwareRun({ ...remote, operationId: id }, true)).toMatchObject({ operationId: id })
  expect(() => softwareRun({ ...run, attemptId: null }, true)).toThrow()
})

it('consumes current script evidence, redacts summaries and rejects obsolete or malformed envelopes', async () => {
  const result = {
    collectedAt: 12,
    receivedAt: 15,
    exitCode: 0,
    quality: 'complete',
    schemaValid: true,
    budgetValid: true,
    output: { large: 'a'.repeat(70_000) },
    outputReference: null,
    diagnostics: run.result.diagnostics,
    trusted: true,
  }
  expect(softwareRun({ ...run, result }, true).result).toMatchObject({
    collectedAt: 12,
    receivedAt: 15,
    budgetValid: true,
    output: result.output,
  })
  const summaryResult: Record<string, unknown> = { ...result }
  delete summaryResult['output']
  const diagnostics: Record<string, unknown> = { ...result.diagnostics }
  delete diagnostics['stdout']
  delete diagnostics['stderr']
  const summaryRun: Record<string, unknown> = { ...run }
  delete summaryRun['policyId']
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode({
      items: [{ ...summaryRun, occurrence: 'script:1', result: { ...summaryResult, diagnostics } }],
      nextCursor: null,
    }),
  )
  const summary = (await createRunsClient({ request } as unknown as HttpTransport).list(id))
    .items[0]!.result!
  expect(summary).toMatchObject({
    kind: 'script',
    collectedAt: 12,
    receivedAt: 15,
    outputReference: null,
  })
  expect(summary).not.toHaveProperty('output')
  expect(summary.diagnostics).not.toHaveProperty('stdout')
  const reference = { bytes: 1_048_577, sha256: 'a'.repeat(64) }
  expect(
    softwareRun(
      {
        ...run,
        result: { ...result, budgetValid: false, output: null, outputReference: reference },
      },
      true,
    ).result,
  ).toMatchObject({ output: null, outputReference: reference })
  for (const invalid of [
    { ...result, outputReference: { bytes: 1, sha256: 'bad' } },
    { ...result, outputReference: reference },
    { ...result, receivedAt: 'now' },
    { ...result, budgetValid: 'true' },
    { ...result, extra: true },
    { ...result, output: 'a'.repeat(1_048_577) },
  ])
    expect(() => softwareRun({ ...run, result: invalid }, true)).toThrow()
  for (const key of ['collectedAt', 'receivedAt', 'budgetValid', 'outputReference']) {
    const invalid: Record<string, unknown> = { ...result }
    delete invalid[key]
    expect(() => softwareRun({ ...run, result: invalid }, true)).toThrow()
  }
})
