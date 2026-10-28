import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createRunsClient, policyRun } from './runs'
const id = '11111111-1111-4111-8111-111111111111',
  task = '22222222-2222-4222-8222-222222222222'
const digest = Array<number>(32).fill(1)
const run = {
  nodes: [],
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
    definitionDigest: digest,
    effect: 'waiting_reboot',
    effectObservedAt: 12000000,
    effectReceivedAt: 12000001,
    receivedAt: 12000001,
    evidence: {
      intent: 'install',
      definitionDigest: digest,
      steps: [
        {
          index: 0,
          stepDigest: digest,
          stepId: digest,
          target: { kind: 'device' },
          package: 'Example.App',
          identity: { kind: 'controlled_detector', entry: 'detect' },
          before: { state: 'unknown', diagnostic: 'not observed' },
          after: { state: 'present', version: '1', evidenceSha256: digest, observedAt: 12 },
          process: { kind: 'exited', code: 0 },
          rebootRequired: true,
          diagnostics: {
            stdout: 'synthetic\noutput',
            stderr: '',
            durationMs: 100,
            executedAt: 12,
            failure: null,
          },
        },
      ],
    },
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
    diagnostics: run.result.evidence.steps[0]!.diagnostics,
    trusted: true,
  }
  expect(policyRun({ ...run, effect: 'unverified', result }, true).result).toMatchObject({
    kind: 'script',
    output: { count: 1 },
  })
  expect(policyRun({ ...run, effect: 'unverified', result: null }, true).result).toBeNull()
  expect(() => policyRun({ ...run, result: { ...result, effect: 'verified' } }, true)).toThrow()
})
it('enforces wire diagnostic limits and matching deadlines but accepts ecosystem version strings', () => {
  expect(
    policyRun(
      {
        ...run,
        result: {
          ...run.result,
          evidence: {
            ...run.result.evidence,
            steps: [
              {
                ...run.result.evidence.steps[0]!,
                after: {
                  ...run.result.evidence.steps[0]!.after,
                  version: 'release candidate '.repeat(30),
                },
              },
            ],
          },
        },
      },
      true,
    ).result,
  ).toMatchObject({
    evidence: { steps: [{ after: { version: 'release candidate '.repeat(30) } }] },
  })
  expect(() => policyRun({ ...run, deadline: 101 }, true)).toThrow()
  expect(() =>
    policyRun(
      {
        ...run,
        result: {
          ...run.result,
          evidence: {
            ...run.result.evidence,
            steps: [
              {
                ...run.result.evidence.steps[0]!,
                diagnostics: {
                  ...run.result.evidence.steps[0]!.diagnostics,
                  stdout: 'a'.repeat(16385),
                },
              },
            ],
          },
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
    evidence: { steps: [{ process: { kind: 'exited', code: 0 }, rebootRequired: true }] },
    effect: 'waiting_reboot',
  })
  reply = { ...run, policyId: task }
  await expect(client.read(id, task)).rejects.toThrow('Wrong software run')
  expect(() =>
    policyRun({ ...run, state: { ...run.state, execution: 'compliant' } }, true),
  ).toThrow()
})
it('keeps summary diagnostics redacted and uses the opaque run continuation', async () => {
  const summary: Record<string, unknown> = { ...run }
  delete summary['policyId']
  delete summary['nodes']
  const diagnostics: Record<string, unknown> = { ...run.result.evidence.steps[0]!.diagnostics }
  delete diagnostics['stdout']
  delete diagnostics['stderr']
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode({
      items: [
        {
          ...summary,
          occurrence: 'software:stage:one',
          result: {
            ...run.result,
            evidence: {
              ...run.result.evidence,
              steps: [{ ...run.result.evidence.steps[0]!, diagnostics }],
            },
          },
        },
      ],
      nextCursor: 'b3BhcXVl',
    }),
  )
  const result = await createRunsClient({ request } as unknown as HttpTransport).list(id, {
    cursor: 'b3BhcXVl',
  })
  expect(request.mock.calls[0]![0].query).toEqual({ limit: 20, cursor: 'b3BhcXVl' })
  const current = result.items[0]!.result!
  if (current.kind !== 'software') throw new Error('Wrong result')
  expect(current.evidence.steps[0]!.diagnostics).not.toHaveProperty('stdout')
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
  for (const authorization of [policy, self])
    expect(policyRun({ ...run, attemptId: task, authorization }, true)).toMatchObject({
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
    expect(() => policyRun({ ...run, authorization }, true)).toThrow()
  expect(() => policyRun({ ...run, attemptId: id }, true)).toThrow('Inconsistent run attempt')
  expect(() =>
    policyRun(
      { ...run, attemptId: task, state: { ...run.state, delivery: { kind: 'queued' } } },
      true,
    ),
  ).toThrow()
  const remote: Record<string, unknown> = { ...run }
  delete remote['policyId']
  expect(policyRun({ ...remote, operationId: id }, true)).toMatchObject({ operationId: id })
  expect(policyRun({ ...run, attemptId: null }, true)).not.toHaveProperty('attemptId')
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
    diagnostics: run.result.evidence.steps[0]!.diagnostics,
    trusted: true,
  }
  expect(policyRun({ ...run, result }, true).result).toMatchObject({
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
  delete summaryRun['nodes']
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
  if (summary.kind !== 'script') throw new Error('Wrong result')
  expect(summary.diagnostics).not.toHaveProperty('stdout')
  const reference = { bytes: 1_048_577, sha256: 'a'.repeat(64) }
  expect(
    policyRun(
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
    expect(() => policyRun({ ...run, result: invalid }, true)).toThrow()
  for (const key of ['collectedAt', 'receivedAt', 'budgetValid', 'outputReference']) {
    const invalid: Record<string, unknown> = { ...result }
    delete invalid[key]
    expect(() => policyRun({ ...run, result: invalid }, true)).toThrow()
  }
})
