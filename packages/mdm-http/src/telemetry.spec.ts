import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createTelemetry } from '@rss/mdm-telemetry'
import { createTelemetryAdapter } from './telemetry'
const tenant = '11111111-1111-4111-8111-111111111111',
  reg = '22222222-2222-4222-8222-222222222222',
  epoch = '33333333-3333-4333-8333-333333333333'
function sample() {
  return {
    id: 'sample',
    sequence: '1',
    observedAt: '20',
    interval: null,
    reading: { quality: 'valid', value: { type: 'number', value: { type: 'f64', value: -12.5 } } },
    stream: {
      scope: { tenant, namespace: 'mdm.telemetry' },
      source: 'device-a' + ':agent.script',
      generation: epoch,
    },
    series: {
      definition: {
        scope: { tenant, namespace: 'mdm.telemetry' },
        key: 'custom.gauge',
        version: '1',
        unit: 'degree',
        metric: { kind: 'gauge', number: 'f64' },
        dimensions: {
          allowed: [],
          required: [],
          maxCount: 0,
          maxValueBytes: 16,
          maxTotalBytes: 64,
        },
      },
      subject: 'device-a',
      resource: 'device',
      dimensions: {},
    },
  }
}
const query = {
  device: 'device-a',
  field: 'custom.gauge',
  resource: 'device',
  startMicros: 0,
  endMicros: 100,
  maxPoints: 10,
  mode: 'history' as const,
  after: null,
}
function fixture(reply: unknown) {
  const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(reply)),
    telemetry = createTelemetry(
      createTelemetryAdapter({ request } as unknown as HttpTransport, tenant),
      tenant,
    )
  return { request, telemetry }
}
it('uses generated operations and admits script observations with all exact coordinates', async () => {
  const f = fixture({
      mode: 'history',
      rows: [{ sample: sample(), receivedAt: '25', liveSource: false }],
      unavailable: [],
      next: 'opaque',
      retired: false,
    }),
    result = await f.telemetry.history(query)
  expect(result.rows[0]).toMatchObject({
    device: 'device-a',
    source: 'agent.script',
    epoch,
    liveSource: false,
    sample: { reading: { quality: 'valid', value: -12.5 } },
  })
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'POST',
      path: '/api/v1/telemetry/history',
      body: { ...query, startMicros: '0', endMicros: '100' },
    }),
  )
})
it('uses the server latest effective source and conflict facts', async () => {
  const f = fixture({
    mode: 'latest',
    rows: [{ sample: sample(), receivedAt: '25', effectiveSource: true, sourceConflict: true }],
    unavailable: [],
    next: null,
    retired: false,
  })
  expect((await f.telemetry.history({ ...query, mode: 'latest' })).rows[0]).toMatchObject({
    liveSource: true,
    sourceConflict: true,
  })
})
it('rejects unsafe integer telemetry rather than rendering a rounded value', async () => {
  const value = sample()
  value.series.definition.metric = { kind: 'gauge', number: 'i64' }
  value.reading.value.value = { type: 'i64', value: 9007199254740992 } as never
  await expect(
    fixture({
      mode: 'history',
      rows: [{ sample: value, receivedAt: '25', liveSource: true }],
      unavailable: [],
      next: null,
      retired: false,
    }).telemetry.history(query),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})
it('rejects foreign scope and mismatched metric readings after protocol admission', async () => {
  const value = sample()
  value.stream.scope.tenant = reg
  await expect(
    fixture({
      mode: 'history',
      rows: [{ sample: value, receivedAt: '25', liveSource: true }],
      unavailable: [],
      next: null,
      retired: false,
    }).telemetry.history(query),
  ).rejects.toThrow()
})
it('reads fixed configuration bindings and registration without substituting active versions', async () => {
  const resource = {
      id: reg,
      version: 'fixed-v1',
      variant: 'default',
      platform: 'macos',
      architecture: 'aarch64',
    },
    f = fixture({
      device: 'device-a',
      evaluatedAtMicros: 50,
      configurations: [
        {
          policyId: reg,
          policyVersionId: epoch,
          resource,
          source: 'agent.script',
          projection: 'both',
          sampleMillis: 1000,
          normalSampleMillis: 5000,
          boostExpiresAt: null,
          uploadMillis: 10000,
          supported: true,
        },
      ],
    })
  expect((await f.telemetry.configurations('device-a')).configurations[0]?.resource).toEqual({
    resource: resource.id,
    version: resource.version,
    variant: resource.variant,
    platform: resource.platform,
    architecture: resource.architecture,
  })
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'GET',
      path: '/api/v1/devices/{device}/telemetry-configurations',
      pathParams: { device: 'device-a' },
    }),
  )
})
