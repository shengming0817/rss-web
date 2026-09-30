import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { experience, experienceMetrics } from './experience-model'
import { createSupportClient } from './support'
const id = '11111111-1111-4111-8111-111111111111',
  source = {
    provider: 'Synthetic source',
    registration: { registrationId: id, generation: 1, source: 'agent.builtin' },
  },
  report = {
    device: 'device-01',
    window: { from: 10, until: 100 },
    evaluatedAt: 100,
    source,
    metrics: experienceMetrics.map((metric) => ({
      metric,
      value: 1,
      state: 'incomplete',
      sampleCount: 4,
      denominator: 5,
      unknownCount: 1,
    })),
  }
it('rejects invented completeness, missing provenance and out-of-window metric metadata', () => {
  expect(experience(report).metrics[0]!.unknownCount).toBe(1)
  expect(() => experience({ ...report, source: null })).toThrow()
  expect(() => experience({ ...report, window: { from: 10, until: 101 } })).toThrow()
  for (const patch of [
    { state: 'complete' },
    { denominator: 4 },
    { value: null },
    { sampleCount: 0 },
    { unknownCount: null },
    { value: Infinity },
  ])
    expect(() =>
      experience({ ...report, metrics: report.metrics.map((m) => ({ ...m, ...patch })) }),
    ).toThrow()
  expect(
    experience({
      ...report,
      source: null,
      metrics: report.metrics.map((m) => ({
        ...m,
        state: 'unknown',
        value: null,
        sampleCount: 0,
        denominator: null,
        unknownCount: null,
      })),
    }).metrics[0]!.value,
  ).toBeNull()
})
it('binds experience evidence to the requested device and response time', async () => {
  let reply: unknown = {
    contract: 'security-v1',
    tenantId: id,
    source: 'mock',
    experience: report,
    asOf: 100,
  }
  const transport = {
      request: vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply)),
    } as unknown as HttpTransport,
    client = createSupportClient(transport, id, true)
  await expect(client.experience('device-01')).resolves.toMatchObject({
    experience: { window: { until: 100 } },
  })
  await expect(client.experience('device-02')).rejects.toThrow()
  reply = { contract: 'security-v1', tenantId: id, source: 'mock', experience: report, asOf: 99 }
  await expect(client.experience('device-01')).rejects.toThrow()
})
