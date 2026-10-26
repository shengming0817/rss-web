/** Exact serde struct field order and BTreeMap order, not a general JSON canonicalization scheme.
 * Source: rss-mdm cbc47ebb resource/{agent_collection,native_collection,telemetry}.rs
 */
import type {
  Applicability,
  ValueMapping,
  NativeCollectionDefinition,
  AgentCollectionDefinition,
  NativeQuery,
  TelemetryProfile,
} from './generated/ResourceWrite'
import { checked } from './check'
import {
  validateNativeCollectionDefinition,
  validateAgentCollectionDefinition,
  validateTelemetryProfile,
} from './generated/validators'
const encoder = new TextEncoder()
const compare = (a: string, b: string) => {
  const x = encoder.encode(a),
    y = encoder.encode(b)
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i]! - y[i]!
  return x.length - y.length
}
const object = (entries: [string, string][]) =>
  '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + v).join(',') + '}'
const list = <T>(values: T[], encode: (value: T) => string) =>
  '[' + values.map(encode).join(',') + ']'
function json(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
      throw new Error('Unsafe canonical number')
    // serde_json stores integral JSON literals as integers; fractional literals use its float formatter.
    return value !== 0 && !Number.isInteger(value) && Math.abs(value) < 1e-5
      ? value.toExponential().replace('e+', 'e')
      : JSON.stringify(value)
  }
  if (Array.isArray(value)) return list(value, json)
  if (typeof value === 'object') return map(value as Record<string, unknown>, json)
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  throw new Error('Missing canonical member')
}
const map = <T>(value: Record<string, T>, encode: (v: T) => string) =>
  object(
    Object.keys(value)
      .sort(compare)
      .map((key) => [key, encode(value[key]!)]),
  )
const ordered = (
  value: object,
  keys: string[],
  encode: Record<string, (v: never) => string> = {},
) =>
  object(
    keys.map((key) => [
      key,
      ((encode[key] as ((value: unknown) => string) | undefined) ?? json)(Reflect.get(value, key)),
    ]),
  )
const scope = (value: { kind: string }) =>
  ordered(
    value,
    value.kind === 'device'
      ? ['kind']
      : value.kind === 'prefix'
        ? ['kind', 'path']
        : ['kind', 'identity'],
  )
const strings = (values: string[]) => list([...new Set(values)].sort(compare), json)
const applicability = (v: Applicability) =>
  ordered(
    v,
    ['minimumOsVersion', 'minimumBuild', 'editions', 'enrollments', 'tools', 'capabilities'],
    { editions: strings, enrollments: strings, tools: (x) => map(x, json), capabilities: strings },
  )
function conversion(v: ValueMapping['conversion']): string {
  switch (v.kind) {
    case 'enum':
      return ordered(v, ['kind', 'values'], { values: (x) => map(x, json) })
    case 'bitmask':
      return ordered(v, ['kind', 'flags'], { flags: (x) => map(x, json) })
    case 'array_member':
      return ordered(v, ['kind', 'member', 'present', 'absent'])
    case 'scale':
      return ordered(v, ['kind', 'numerator', 'denominator'])
    default:
      return ordered(v, ['kind'])
  }
}
const mapping = (v: ValueMapping): string =>
  ordered(v, ['pointer', 'conversion', 'columns'], { conversion, columns: (x) => map(x, mapping) })
const budget = (v: object) => ordered(v, ['timeoutSeconds', 'outputBytes', 'maxRows'])
function predicate(v: { kind: string }): string {
  return v.kind === 'compare'
    ? ordered(v, ['kind', 'property', 'operator', 'value'])
    : ordered(v, ['kind', 'terms'], { terms: (x) => list(x, predicate) })
}
function system(v: { kind: string }): string {
  if (v.kind === 'windows_accounts' || v.kind === 'macos_accounts')
    return ordered(v, ['kind', 'section', 'selection'], {
      selection: (x: { kind: string }) =>
        x.kind === 'local'
          ? ordered(x, ['kind'])
          : ordered(x, ['kind', 'identities'], { identities: strings }),
    })
  if (v.kind === 'windows_certificates') return ordered(v, ['kind', 'store', 'user'])
  if (v.kind === 'macos_certificates') return ordered(v, ['kind', 'store'])
  if (v.kind === 'windows_updates' || v.kind === 'macos_updates')
    return ordered(v, ['kind', 'section', 'mode'])
  if (v.kind === 'macos_security') return ordered(v, ['kind', 'section'])
  if (v.kind === 'windows_application' || v.kind === 'macos_application')
    return ordered(
      v,
      v.kind === 'macos_application' ? ['kind', 'target', 'permissions'] : ['kind', 'target'],
      {
        target: (x: { kind: string }) =>
          ordered(
            x,
            x.kind === 'agent'
              ? ['kind']
              : v.kind === 'windows_application'
                ? ['kind', 'service', 'publisher']
                : ['kind', 'bundle_id', 'team_id'],
          ),
        permissions: (x: string[]) =>
          list(
            ['full_disk_access', 'accessibility', 'screen_capture'].filter((p) => x.includes(p)),
            json,
          ),
      },
    )
  return ordered(v, ['kind'])
}
function query(v: NativeQuery['definition']): string {
  switch (v.kind) {
    case 'windows_performance':
    case 'macos_performance':
    case 'macos_hardware':
      return ordered(v, ['kind', 'section'])
    case 'system':
      return ordered(v, ['kind', 'query'], { query: system })
    case 'windows_wmi':
      return ordered(v, ['kind', 'namespace', 'class', 'properties', 'filter'], {
        properties: (x) => map(x, (p) => ordered(p as object, ['cimType', 'array'])),
        filter: (x) => (x === null ? 'null' : predicate(x)),
      })
    case 'windows_registry':
      return ordered(v, ['kind', 'hive', 'view', 'path', 'enumerateSubkeys', 'values'], {
        values: (x) => map(x, (p) => ordered(p as object, ['name', 'valueType'])),
      })
    case 'macos_applications':
      return ordered(v, ['kind', 'root', 'maxDepth'])
    case 'macos_brew':
      return ordered(v, ['kind', 'prefix', 'package', 'taps'], { taps: strings })
    default:
      return ordered(v, ['kind'])
  }
}
export function nativeBytes(input: NativeCollectionDefinition): Uint8Array {
  const v = checked(validateNativeCollectionDefinition, input)
  return encoder.encode(
    ordered(v, ['scope', 'applicability', 'adapter', 'mappings', 'timeoutSeconds', 'outputBytes'], {
      scope,
      applicability,
      mappings: (x) =>
        map(x, (b) =>
          ordered(b as object, ['query', 'mapping'], {
            query: (q: unknown) =>
              typeof q === 'string'
                ? json(q)
                : ordered(
                    q as { kind: string },
                    Reflect.get(q as object, 'kind') === 'scalar'
                      ? ['kind', 'uri']
                      : Reflect.get(q as object, 'kind') === 'inventory'
                        ? ['kind', 'inventory']
                        : ['kind'],
                  ),
            mapping,
          }),
        ),
    }),
  )
}
export function agentBytes(input: AgentCollectionDefinition): Uint8Array {
  const v = checked(validateAgentCollectionDefinition, input)
  return encoder.encode(
    ordered(v, ['applicability', 'plan', 'mappings'], {
      applicability,
      plan: (p: AgentCollectionDefinition['plan']) =>
        ordered(p, ['version', 'scope', 'queries', 'budget'], {
          scope,
          queries: (x) =>
            map(x, (q) =>
              ordered(
                q as object,
                ['version', 'definition', 'cardinality', 'instanceKeys', 'budget'],
                { definition: query, budget },
              ),
            ),
          budget,
        }),
      mappings: (x) =>
        map(x, (b: AgentCollectionDefinition['mappings'][string]) =>
          ordered(
            b,
            b.counterNormalization == null
              ? ['query', 'mapping', 'missing']
              : ['counterNormalization', 'query', 'mapping', 'missing'],
            { mapping },
          ),
        ),
    }),
  )
}
export function telemetryBytes(input: TelemetryProfile): Uint8Array {
  const v = checked(validateTelemetryProfile, input)
  return encoder.encode(
    ordered(
      v,
      [
        'template',
        'parameters',
        'fields',
        'projection',
        'sampleMillis',
        'uploadMillis',
        'budget',
        'boost',
        'backfillSeconds',
      ],
      {
        template: (x) => ordered(x, ['resource', 'version', 'variant', 'platform', 'architecture']),
        parameters: (x) => map(x, json),
        fields: (x) => list(x, (f) => ordered(f as object, ['key', 'version'])),
        budget: (x) =>
          ordered(x, ['points', 'bytes', 'resources', 'executionMillis', 'outputBytes']),
        boost: (x) => (x === null ? 'null' : ordered(x, ['sampleMillis', 'expiresAt'])),
      },
    ),
  )
}
