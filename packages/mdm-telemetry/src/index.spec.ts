import { expect, it, vi } from 'vitest'
import { aggregateSelection, createTelemetry, seriesKey } from './index'
import type { HistoryPage, HistoryQuery, Observation, TelemetryPort } from './model'
const tenant = '11111111-1111-4111-8111-111111111111',
  registration = '22222222-2222-4222-8222-222222222222',
  epoch = '33333333-3333-4333-8333-333333333333'
function row(): Observation {
  return {
    device: 'device-a',
    epoch,
    source: 'agent.script',
    receivedAt: 30,
    liveSource: true,
    sourceConflict: false,
    sample: {
      id: 'sample',
      sequence: 1,
      observedAt: 20,
      interval: null,
      reading: { quality: 'valid', value: -12.5 },
      stream: {
        scope: { tenant, namespace: 'mdm.telemetry' },
        source: 'device-a' + ':agent.script',
        generation: epoch,
      },
      series: {
        definition: {
          scope: { tenant, namespace: 'mdm.telemetry' },
          key: 'custom.gauge',
          version: 2,
          unit: 'degree',
          metric: { kind: 'gauge', number: 'f64' },
          dimensions: {
            allowed: ['disk'],
            required: [],
            maxCount: 1,
            maxValueBytes: 16,
            maxTotalBytes: 64,
          },
        },
        subject: 'device-a',
        resource: 'device',
        dimensions: { disk: 'system' },
      },
    },
  }
}
const query: HistoryQuery = {
  device: 'device-a',
  field: 'custom.gauge',
  resource: 'device',
  startMicros: 0,
  endMicros: 100,
  maxPoints: 10,
  mode: 'history',
  after: null,
}
function fixture(value: HistoryPage) {
  const history = vi.fn(async () => value),
    aggregate = vi.fn(async () => ({
      buckets: [],
      unavailable: [],
      resolutionMicros: 10,
      refreshedThrough: null,
      next: null,
    }))
  return {
    history,
    aggregate,
    telemetry: createTelemetry({ history, aggregate } as unknown as TelemetryPort, tenant),
  }
}
it('retains real source/epoch/definition/dimensions for aggregate selection', async () => {
  const observation = row(),
    request = aggregateSelection(query, observation, 'mean', 10, null),
    f = fixture({ rows: [observation], unavailable: [], next: null, retired: false })
  await f.telemetry.aggregate(request)
  expect(f.aggregate).toHaveBeenCalledWith(
    expect.objectContaining({
      epoch,
      source: 'agent.script',
      definitionVersion: 2,
      dimensions: { disk: 'system' },
      coverage: { coverage: 'observedOnly' },
      query: { ...query, mode: 'history', after: null },
    }),
  )
  expect(seriesKey(observation)).not.toBe(seriesKey({ ...observation, epoch: registration }))
  expect(() =>
    aggregateSelection({ ...query, device: 'device-b' }, observation, 'mean', 10, null),
  ).toThrow()
})
it.each(['tenant', 'device', 'field', 'resource', 'time'] as const)(
  'rejects a response mixed across %s coordinates',
  async (kind) => {
    const observation = row()
    const changed = structuredClone(observation) as unknown as {
      sample: {
        stream: { scope: { tenant: string } }
        series: { subject: string; resource: string; definition: { key: string } }
        observedAt: number
      }
    }
    if (kind === 'tenant') changed.sample.stream.scope.tenant = registration
    if (kind === 'device') changed.sample.series.subject = 'device-b'
    if (kind === 'field') changed.sample.series.definition.key = 'other'
    if (kind === 'resource') changed.sample.series.resource = 'other'
    if (kind === 'time') changed.sample.observedAt = query.endMicros
    const f = fixture({
      rows: [changed as unknown as Observation],
      unavailable: [],
      next: null,
      retired: false,
    })
    await expect(f.telemetry.history(query)).rejects.toThrow('coordinates')
  },
)
it('rejects latest continuation and invalid windows before calling a port', async () => {
  const f = fixture({ rows: [], unavailable: [], next: null, retired: false })
  await expect(f.telemetry.history({ ...query, mode: 'latest', after: 'cursor' })).rejects.toThrow()
  await expect(f.telemetry.history({ ...query, endMicros: 0 })).rejects.toThrow()
  expect(f.history).not.toHaveBeenCalled()
})
it('keeps no data distinct from unavailable intervals and rejects foreign unavailable facts', async () => {
  const value: HistoryPage = {
      rows: [],
      unavailable: [
        {
          selection: {
            selection: 'resource',
            keys: [query.field],
            resource: 'device',
            subject: 'device-a',
            scope: { tenant, namespace: 'mdm.telemetry' },
          },
          window: { start: 0, end: 50 },
          reason: 'retention',
        },
      ],
      next: null,
      retired: false,
    },
    f = fixture(value)
  expect((await f.telemetry.history(query)).unavailable).toHaveLength(1)
  const foreign = structuredClone(value) as unknown as {
    unavailable: { selection: { subject: string } }[]
  }
  foreign.unavailable[0]!.selection.subject = 'device-b'
  await expect(fixture(foreign as unknown as HistoryPage).telemetry.history(query)).rejects.toThrow(
    'unavailable',
  )
})
it('rejects overlapping aggregate windows and preserves coverage information', async () => {
  const f = fixture({ rows: [], unavailable: [], next: null, retired: false })
  f.aggregate.mockResolvedValueOnce({
    buckets: [
      {
        window: { start: 0, end: 10 },
        coveredMicros: 11,
        validSamples: 1,
        completeness: [],
        value: { kind: 'number', value: 4 },
      },
    ],
    unavailable: [],
    resolutionMicros: 10,
    refreshedThrough: null,
    next: null,
  } as never)
  await expect(
    f.telemetry.aggregate(aggregateSelection(query, row(), 'mean', 10, null)),
  ).rejects.toThrow('window')
})

it('uses counter gap and explicit state hold semantics without inventing coverage', () => {
  const gauge = row(),
    counter = {
      ...gauge,
      sample: {
        ...gauge.sample,
        series: {
          ...gauge.sample.series,
          definition: {
            ...gauge.sample.series.definition,
            metric: { kind: 'counter', number: 'u64', temporality: 'cumulative' },
          },
        },
      },
    } as Observation
  expect(aggregateSelection(query, gauge, 'mean', 10, 300).maxGapMicros).toBeNull()
  expect(() => aggregateSelection(query, counter, 'rate', 10, null)).toThrow('gap required')
  expect(aggregateSelection(query, counter, 'rate', 10, 300).maxGapMicros).toBe(300)
  const state = {
    ...gauge,
    sample: {
      ...gauge.sample,
      series: {
        ...gauge.sample.series,
        definition: {
          ...gauge.sample.series.definition,
          metric: { kind: 'state', members: ['running', 'stopped'] },
        },
      },
    },
  } as Observation
  expect(() => aggregateSelection(query, state, 'coverage', 10, null)).toThrow('coverage')
  expect(
    aggregateSelection(query, state, 'coverage', 10, null, {
      coverage: 'holdLast',
      maxHoldMicros: 300,
    }).coverage,
  ).toEqual({ coverage: 'holdLast', maxHoldMicros: 300 })
})
