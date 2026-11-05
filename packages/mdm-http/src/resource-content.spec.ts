import { expect, it } from 'vitest'
import type { AgentDefinition, MappingDeclaration, NativeDefinition } from '@rss/mdm-resources'
import { encodeCollectionContent } from './resource-content'

const applicability = () => ({
  minimumOsVersion: null,
  minimumBuild: null,
  editions: [],
  enrollments: [],
  tools: {},
  capabilities: [],
})
const artifact = () => ({
  reference: 'collection.json',
  length: 1,
  sha256: Array<number>(32).fill(0),
})
function native(): Extract<MappingDeclaration, { kind: 'native_collection' }> {
  return {
    kind: 'native_collection',
    artifact: artifact(),
    definition: {
      scope: { kind: 'device' },
      applicability: applicability(),
      adapter: 'windows_read',
      mappings: {
        'custom.ready': {
          query: { kind: 'enrollment_id' },
          mapping: { pointer: '', conversion: { kind: 'identity' }, columns: {} },
        },
      },
      timeoutSeconds: 30,
      outputBytes: 65536,
    },
  }
}
it('matches Rust serde native struct order rather than JavaScript property insertion order', () => {
  // Golden follows the primary Rust native_collection.rs / applicability.rs declarations.
  const value = native(),
    source = value.definition
  const reordered: NativeDefinition = {
    outputBytes: source.outputBytes,
    timeoutSeconds: source.timeoutSeconds,
    mappings: source.mappings,
    adapter: source.adapter,
    applicability: source.applicability,
    scope: source.scope,
  }
  const result = new TextDecoder().decode(
    encodeCollectionContent({ ...value, definition: reordered }),
  )
  expect(result).toBe(
    '{"scope":{"kind":"device"},"applicability":{"minimumOsVersion":null,"minimumBuild":null,"editions":[],"enrollments":[],"tools":{},"capabilities":[]},"adapter":"windows_read","mappings":{"custom.ready":{"query":{"kind":"enrollment_id"},"mapping":{"pointer":"","conversion":{"kind":"identity"},"columns":{}}}},"timeoutSeconds":30,"outputBytes":65536}',
  )
})
it('retains lexical numeric keys, UTF-8 order, false, zero and Ryū fractional notation', () => {
  const value = native(),
    original = value.definition.mappings['custom.ready']!,
    result = new TextDecoder().decode(
      encodeCollectionContent({
        ...value,
        definition: {
          ...value.definition,
          mappings: {
            'custom.ready': {
              ...original,
              mapping: {
                pointer: '/value',
                conversion: {
                  kind: 'enum',
                  values: {
                    '2': 0,
                    '10': 1,
                    '\u{10000}': 0,
                    '\ue000': false,
                    fraction: 0.000001,
                    threshold: 0.00001,
                  },
                },
                columns: {},
              },
            },
          },
        },
      }),
    )
  expect(result).toContain(
    '"values":{"10":1,"2":0,"fraction":1e-6,"threshold":0.00001,"\ue000":false,"\u{10000}":0}',
  )
})
it('sorts set-valued applicability inputs but preserves ordered physical instance keys', () => {
  const budget = { timeoutSeconds: 30, outputBytes: 65536, maxRows: 1000 },
    definition: AgentDefinition = {
      applicability: { ...applicability(), capabilities: ['z', 'a'] },
      plan: {
        version: 1,
        scope: { kind: 'device' },
        queries: {
          physical: {
            version: 1,
            definition: { kind: 'windows_cpu' },
            cardinality: 'list',
            instanceKeys: ['b', 'a'],
            budget,
          },
        },
        budget,
      },
      mappings: {
        'custom.rows': {
          query: 'physical',
          missing: 'delete',
          counterNormalization: 'local_cumulative_v1',
          mapping: {
            pointer: '',
            conversion: { kind: 'identity' },
            columns: {
              flag: {
                pointer: '/mask',
                conversion: {
                  kind: 'bitmask',
                  flags: { '18446744073709551615': 'all', '2': 'two' },
                },
                columns: {},
              },
            },
          },
        },
      },
    }
  const result = new TextDecoder().decode(
    encodeCollectionContent({ kind: 'agent_collection', artifact: artifact(), definition }),
  )
  expect(result).toContain('"capabilities":["a","z"]')
  expect(result).toContain('"instanceKeys":["b","a"]')
  expect(result).toContain(
    '"custom.rows":{"counterNormalization":"local_cumulative_v1","query":"physical","mapping":',
  )
  expect(result).toContain('"flags":{"18446744073709551615":"all","2":"two"}')
})
it('rejects lossy numbers instead of uploading bytes that disagree with the declared definition', () => {
  const value = native(),
    original = value.definition.mappings['custom.ready']!
  expect(() =>
    encodeCollectionContent({
      ...value,
      definition: {
        ...value.definition,
        mappings: {
          'custom.ready': {
            ...original,
            mapping: {
              pointer: '',
              conversion: { kind: 'enum', values: { unsafe: Number.MAX_SAFE_INTEGER + 1 } },
              columns: {},
            },
          },
        },
      },
    }),
  ).toThrow()
})

it('matches Rust telemetry struct order and sorted parameter objects without reordering field references', () => {
  const content = encodeCollectionContent({
    kind: 'telemetry_profile',
    artifact: artifact(),
    definition: {
      template: {
        architecture: 'x86_64',
        platform: 'windows',
        variant: 'main',
        version: 'v1',
        resource: 'template',
      },
      parameters: { z: false, a: { nested: 0 } },
      fields: [
        { key: 'custom.z', version: 2 },
        { key: 'custom.a', version: 1 },
      ],
      projection: 'both',
      sampleMillis: 30000,
      uploadMillis: 60000,
      budget: {
        points: 100,
        bytes: 65536,
        resources: 4,
        executionMillis: 1000,
        outputBytes: 65536,
      },
      boost: null,
      backfillSeconds: 3600,
    },
  })
  expect(new TextDecoder().decode(content)).toBe(
    '{"template":{"resource":"template","version":"v1","variant":"main","platform":"windows","architecture":"x86_64"},"parameters":{"a":{"nested":0},"z":false},"fields":[{"key":"custom.z","version":2},{"key":"custom.a","version":1}],"projection":"both","sampleMillis":30000,"uploadMillis":60000,"budget":{"points":100,"bytes":65536,"resources":4,"executionMillis":1000,"outputBytes":65536},"boost":null,"backfillSeconds":3600}',
  )
})
