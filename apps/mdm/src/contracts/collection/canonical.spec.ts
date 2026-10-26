import { expect, it } from 'vitest'
import blueprints from '../../../demo/policies/blueprints.json'
import { agentBytes, nativeBytes, telemetryBytes } from './canonical'
import { checked } from './check'
import {
  validateAgentCollectionDefinition,
  validateNativeCollectionDefinition,
  validateResourceWrite,
  validateFieldWrite,
} from './generated/validators'
// Existing producer canonical contents are real format vectors; reorder every JSON object on read.
function reordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reordered)
  return value && typeof value === 'object'
    ? Object.fromEntries(
        Object.entries(value)
          .reverse()
          .map(([k, v]) => [k, reordered(v)]),
      )
    : value
}
it.each(
  blueprints.packages.filter(
    (p) => p.kind === 'native_collection' || p.kind === 'agent_collection',
  ),
)('encodes the producer canonical artifact for $id', (p) => {
  const input: unknown = reordered(JSON.parse(p.content))
  const bytes =
    p.kind === 'native_collection'
      ? nativeBytes(checked(validateNativeCollectionDefinition, input))
      : agentBytes(checked(validateAgentCollectionDefinition, input))
  expect(new TextDecoder().decode(bytes)).toBe(p.content)
})
it('validates whole request carriers, preserves presentation extensions and rejects unsafe numeric bytes', () => {
  const body = {
    operationId: '11111111-1111-4111-8111-111111111111',
    expectedRevision: 0,
    input: { action: 'present', presentation: { name: 'Name', vendor: { enabled: false } } },
  }
  expect(checked(validateResourceWrite, body)).toEqual(body)
  expect(() =>
    checked(validateResourceWrite, { ...body, expectedRevision: Number.MAX_SAFE_INTEGER + 1 }),
  ).toThrow('exactly')
  expect(() =>
    checked(validateFieldWrite, {
      ...body,
      input: { action: 'put', definition: { key: 'custom.incomplete' } },
    }),
  ).toThrow()
  expect(() => checked(validateResourceWrite, { ...body, oldVersion: 1 })).toThrow()
})
it('serializes telemetry structs independently of HTTP key insertion order', () => {
  const profile = {
    template: {
      resource: 'source',
      version: '1',
      variant: 'main',
      platform: 'windows' as const,
      architecture: 'x86_64' as const,
    },
    parameters: { '2': 2, '10': 10 },
    fields: [{ key: 'custom.cpu', version: 1 }],
    projection: 'both' as const,
    sampleMillis: 60000,
    uploadMillis: 60000,
    budget: { points: 10, bytes: 1024, resources: 1, executionMillis: 1000, outputBytes: 1024 },
    boost: { sampleMillis: 10000, expiresAt: 1900000000 },
    backfillSeconds: 3600,
  }
  expect(new TextDecoder().decode(telemetryBytes(profile))).toBe(
    '{"template":{"resource":"source","version":"1","variant":"main","platform":"windows","architecture":"x86_64"},"parameters":{"10":10,"2":2},"fields":[{"key":"custom.cpu","version":1}],"projection":"both","sampleMillis":60000,"uploadMillis":60000,"budget":{"points":10,"bytes":1024,"resources":1,"executionMillis":1000,"outputBytes":1024},"boost":{"sampleMillis":10000,"expiresAt":1900000000},"backfillSeconds":3600}',
  )
})
