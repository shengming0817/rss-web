import { expect, it } from 'vitest'
import blueprints from '../../../demo/policies/blueprints.json'
import { agentBytes, nativeBytes, telemetryBytes } from './canonical'
import { checked } from './check'
import {
  validateAgentCollectionDefinition,
  validateNativeCollectionDefinition,
  validateResourceWrite,
  validateResourceResponse,
  validateFieldWrite,
} from '@rss/api/mdm-validators'
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
it('accepts valid deep WMI predicates inside complete read and write carriers', () => {
  let filter: object = { kind: 'compare', property: 'Name', operator: 'eq', value: 'Example' }
  for (let depth = 0; depth < 3; depth++) filter = { kind: 'and', terms: [filter] }
  const budget = { timeoutSeconds: 1, outputBytes: 4096, maxRows: 1 }
  const declaration = {
    kind: 'agent_collection',
    artifact: { reference: 'collection.json', length: 1, sha256: Array(32).fill(0) },
    definition: {
      applicability: {
        minimumOsVersion: null,
        minimumBuild: null,
        editions: [],
        enrollments: [],
        tools: {},
        capabilities: [],
      },
      plan: {
        version: 1,
        scope: { kind: 'device' },
        queries: {
          q: {
            version: 1,
            definition: {
              kind: 'windows_wmi',
              namespace: 'root\\cimv2',
              class: 'Win32_OperatingSystem',
              properties: { Name: { cimType: 'string', array: false } },
              filter,
            },
            cardinality: 'exactly_one',
            instanceKeys: [],
            budget,
          },
        },
        budget,
      },
      mappings: {
        'custom.name': {
          query: 'q',
          mapping: { pointer: '/Name', conversion: { kind: 'identity' }, columns: {} },
          missing: 'missing',
        },
      },
    },
  }
  const variants = [{ platform: 'windows', architecture: 'x86_64', key: 'main', declaration }]
  const body = {
    operationId: '11111111-1111-4111-8111-111111111111',
    expectedRevision: 1,
    input: { action: 'version', kind: 'agent_collection', version: '2', variants },
  }
  expect(checked(validateResourceWrite, body)).toEqual(body)
  const response = {
    id: 'resource',
    revision: 2,
    kind: 'agent_collection',
    presentation: {},
    origin: null,
    versions: [{ id: '2', state: 'frozen', digest: Array(32).fill(0), variants }],
  }
  expect(checked(validateResourceResponse, response)).toEqual(response)
})
