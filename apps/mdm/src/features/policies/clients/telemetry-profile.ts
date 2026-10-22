import {
  array,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  record,
  unique,
  string,
  boolean,
  integer,
} from '../../../services/decode'
import { fieldKey } from '../../devices/clients/asset-model'
import { positive } from './collection-mapping'
export function telemetryProfile(value: unknown) {
  const v = closed(value, [
    'template',
    'parameters',
    'fields',
    'projection',
    'sampleMillis',
    'uploadMillis',
    'budget',
    'boost',
    'backfillSeconds',
  ])
  const t = closed(v['template'], ['resource', 'version', 'variant', 'platform', 'architecture'])
  const b = closed(v['budget'], ['points', 'bytes', 'resources', 'executionMillis', 'outputBytes'])
  const result = {
    template: {
      resource: identifier(t['resource']),
      version: identifier(t['version']),
      variant: identifier(t['variant']),
      platform: enumeration(t['platform'], ['windows', 'macos'] as const),
      architecture: enumeration(t['architecture'], ['x86_64', 'aarch64'] as const),
    },
    parameters: Object.fromEntries(
      Object.entries(record(v['parameters'])).map(([key, value]) => [
        key,
        typeof value === 'string'
          ? string(value)
          : typeof value === 'boolean'
            ? boolean(value)
            : integer(value),
      ]),
    ),
    fields: unique(
      array(v['fields'], (x) => {
        const f = closed(x, ['key', 'version'])
        return { key: fieldKey(f['key']), version: positive(f['version']) }
      }),
      (f) => f.key,
    ),
    projection: enumeration(v['projection'], ['current', 'history', 'both'] as const),
    sampleMillis: positive(v['sampleMillis']),
    uploadMillis: positive(v['uploadMillis']),
    budget: {
      points: positive(b['points']),
      bytes: positive(b['bytes']),
      resources: positive(b['resources']),
      executionMillis: positive(b['executionMillis']),
      outputBytes: positive(b['outputBytes']),
    },
    boost: nullable(v['boost'], (x) => {
      const b = closed(x, ['sampleMillis', 'expiresAt'])
      return { sampleMillis: positive(b['sampleMillis']), expiresAt: positive(b['expiresAt']) }
    }),
    backfillSeconds: positive(v['backfillSeconds']),
  }
  if (
    Object.keys(result.parameters).length > 64 ||
    result.budget.points > 4096 ||
    result.budget.resources > 4096 ||
    result.budget.bytes > 4194304 ||
    result.budget.executionMillis > 300000 ||
    !result.fields.length ||
    result.fields.length > 64 ||
    result.uploadMillis < result.sampleMillis ||
    result.budget.executionMillis > result.sampleMillis ||
    result.budget.outputBytes > result.budget.bytes ||
    (result.boost &&
      (result.boost.sampleMillis >= result.sampleMillis ||
        result.boost.sampleMillis < result.budget.executionMillis))
  )
    throw new Error('Invalid telemetry profile')
  count(result.sampleMillis)
  return result
}
export type TelemetryProfile = ReturnType<typeof telemetryProfile>
/** Mirrors TelemetryProfileSpec field order and Rust BTreeMap ordering for its artifact. */
export function profileBytes(value: TelemetryProfile) {
  const profile = telemetryProfile(value)
  const encoder = new TextEncoder()
  const compare = (a: string, b: string) => {
    const x = encoder.encode(a),
      y = encoder.encode(b)
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      if (x[i] !== y[i]) return x[i]! - y[i]!
    }
    return x.length - y.length
  }
  const parameters =
    '{' +
    Object.keys(profile.parameters)
      .sort(compare)
      .map((k) => JSON.stringify(k) + ':' + JSON.stringify(profile.parameters[k]))
      .join(',') +
    '}'
  return encoder.encode(
    '{' +
      Object.entries(profile)
        .map(
          ([key, value]) =>
            JSON.stringify(key) + ':' + (key === 'parameters' ? parameters : JSON.stringify(value)),
        )
        .join(',') +
      '}',
  )
}
