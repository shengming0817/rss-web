import {
  validateAgentCollectionDefinition,
  validateNativeCollectionDefinition,
} from '@rss/api/mdm-validators'
import type {
  AgentDefinition,
  AgentPlan,
  Applicability,
  CollectionBudget,
  MappingDeclaration,
  NativeDefinition,
  PhysicalPredicate,
  PhysicalRead,
  SystemRead,
  TemplateScope,
  ValueMapping,
} from '@rss/mdm-inventory'

const encoder = new TextEncoder()
/** serde struct order and UTF-8 BTreeMap/BTreeSet order are part of these exact artifact bytes.
 * ref: serde-rs/json src/ser.rs; dtolnay/ryu src/pretty/mod.rs;
 * rss-mdm resource/{agent_collection,native_collection,applicability}.rs.
 */
function compareUtf8(a: string, b: string): number {
  const left = encoder.encode(a),
    right = encoder.encode(b)
  for (let index = 0; index < Math.min(left.length, right.length); index++)
    if (left[index] !== right[index]) return left[index]! - right[index]!
  return left.length - right.length
}
function object(entries: readonly (readonly [string, string])[]): string {
  return '{' + entries.map(([key, value]) => JSON.stringify(key) + ':' + value).join(',') + '}'
}
function array<T>(values: readonly T[], encode: (value: T) => string): string {
  return '[' + values.map(encode).join(',') + ']'
}
function map<T>(values: Readonly<Record<string, T>>, encode: (value: T) => string): string {
  return object(
    Object.keys(values)
      .sort(compareUtf8)
      .map((key) => [key, encode(values[key]!)]),
  )
}
function json(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
      throw { cause: 'client', code: 'unsafe_number' }
    // Integral JSON input is held as an integer. Ryū prints fractional values below 1e-5 exponentially.
    return value !== 0 && !Number.isInteger(value) && Math.abs(value) < 1e-5
      ? value.toExponential().replace('e+', 'e')
      : JSON.stringify(value)
  }
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (Array.isArray(value)) return array(value, json)
  if (value && typeof value === 'object')
    return map(value as Readonly<Record<string, unknown>>, json)
  throw { cause: 'client', code: 'invalid_input' }
}
function struct<T extends object>(
  value: T,
  keys: readonly (keyof T & string)[],
  codecs: Partial<{ [K in keyof T]: (value: T[K]) => string }> = {},
): string {
  function entry<K extends keyof T & string>(key: K): readonly [string, string] {
    const encode = codecs[key]
    return [key, encode ? encode(value[key]) : json(value[key])]
  }
  return object(keys.map(entry))
}
function set(values: readonly string[]): string {
  return array([...new Set(values)].sort(compareUtf8), json)
}
function templateScope(value: TemplateScope): string {
  if (value.kind === 'device') return struct(value, ['kind'])
  if (value.kind === 'prefix') return struct(value, ['kind', 'path'])
  return struct(value, ['kind', 'identity'])
}
function applicability(value: Applicability): string {
  return struct(
    value,
    ['minimumOsVersion', 'minimumBuild', 'editions', 'enrollments', 'tools', 'capabilities'],
    { editions: set, enrollments: set, tools: (tools) => map(tools, json), capabilities: set },
  )
}
function mapping(value: ValueMapping): string {
  function conversion(value: ValueMapping['conversion']): string {
    switch (value.kind) {
      case 'enum':
        return struct(value, ['kind', 'values'], { values: (values) => map(values, json) })
      case 'bitmask':
        return struct(value, ['kind', 'flags'], { flags: (flags) => map(flags, json) })
      case 'scale':
        return struct(value, ['kind', 'numerator', 'denominator'])
      case 'array_member':
        return struct(value, ['kind', 'member', 'present', 'absent'])
      default:
        return struct(value, ['kind'])
    }
  }
  return struct(value, ['pointer', 'conversion', 'columns'], {
    conversion,
    columns: (columns) => map(columns, mapping),
  })
}
function budget(value: CollectionBudget): string {
  return struct(value, ['timeoutSeconds', 'outputBytes', 'maxRows'])
}
function physicalPredicate(value: PhysicalPredicate): string {
  return value.kind === 'compare'
    ? struct(value, ['kind', 'property', 'operator', 'value'])
    : struct(value, ['kind', 'terms'], { terms: (terms) => array(terms, physicalPredicate) })
}
function systemRead(value: SystemRead): string {
  switch (value.kind) {
    case 'windows_accounts':
    case 'macos_accounts':
      return struct(value, ['kind', 'section', 'selection'], {
        selection: (selection) =>
          selection.kind === 'local'
            ? struct(selection, ['kind'])
            : struct(selection, ['kind', 'identities'], { identities: set }),
      })
    case 'windows_certificates':
      return struct(value, ['kind', 'store', 'user'])
    case 'macos_certificates':
      return struct(value, ['kind', 'store'])
    case 'windows_updates':
    case 'macos_updates':
      return struct(value, ['kind', 'section', 'mode'])
    case 'macos_security':
      return struct(value, ['kind', 'section'])
    case 'windows_application':
      return struct(value, ['kind', 'target'], {
        target: (target) =>
          target.kind === 'agent'
            ? struct(target, ['kind'])
            : struct(target, ['kind', 'service', 'publisher']),
      })
    case 'macos_application':
      return struct(value, ['kind', 'target', 'permissions'], {
        target: (target) =>
          target.kind === 'agent'
            ? struct(target, ['kind'])
            : struct(target, ['kind', 'bundle_id', 'team_id']),
        permissions: (permissions) =>
          array(
            (['full_disk_access', 'accessibility', 'screen_capture'] as const).filter(
              (permission) => permissions.includes(permission),
            ),
            json,
          ),
      })
    default:
      return struct(value, ['kind'])
  }
}
function physicalRead(value: PhysicalRead): string {
  switch (value.kind) {
    case 'windows_performance':
    case 'macos_performance':
    case 'macos_hardware':
      return struct(value, ['kind', 'section'])
    case 'system':
      return struct(value, ['kind', 'query'], { query: systemRead })
    case 'windows_wmi':
      return struct(value, ['kind', 'namespace', 'class', 'properties', 'filter'], {
        properties: (properties) =>
          map(properties, (property) => struct(property, ['cimType', 'array'])),
        filter: (filter) => (filter === null ? 'null' : physicalPredicate(filter)),
      })
    case 'windows_registry':
      return struct(value, ['kind', 'hive', 'view', 'path', 'enumerateSubkeys', 'values'], {
        values: (values) => map(values, (property) => struct(property, ['name', 'valueType'])),
      })
    case 'macos_applications':
      return struct(value, ['kind', 'root', 'maxDepth'])
    case 'macos_brew':
      return struct(value, ['kind', 'prefix', 'package', 'taps'], { taps: set })
    default:
      return struct(value, ['kind'])
  }
}
function plan(value: AgentPlan): string {
  return struct(value, ['version', 'scope', 'queries', 'budget'], {
    scope: templateScope,
    budget,
    queries: (queries) =>
      map(queries, (query) =>
        struct(query, ['version', 'definition', 'cardinality', 'instanceKeys', 'budget'], {
          definition: physicalRead,
          budget,
        }),
      ),
  })
}
function native(value: NativeDefinition): string {
  if (!validateNativeCollectionDefinition(value)) throw { cause: 'client', code: 'invalid_input' }
  return struct(
    value,
    ['scope', 'applicability', 'adapter', 'mappings', 'timeoutSeconds', 'outputBytes'],
    {
      scope: templateScope,
      applicability,
      mappings: (mappings) =>
        map(mappings, (binding) =>
          struct(binding, ['query', 'mapping'], {
            mapping,
            query: (query) =>
              typeof query === 'string'
                ? json(query)
                : query.kind === 'scalar'
                  ? struct(query, ['kind', 'uri'])
                  : query.kind === 'inventory'
                    ? struct(query, ['kind', 'inventory'])
                    : struct(query, ['kind']),
          }),
        ),
    },
  )
}
function agent(value: AgentDefinition): string {
  if (!validateAgentCollectionDefinition(value)) throw { cause: 'client', code: 'invalid_input' }
  return struct(value, ['applicability', 'plan', 'mappings'], {
    applicability,
    plan,
    mappings: (mappings) =>
      map(mappings, (binding) =>
        struct(
          binding,
          binding.counterNormalization == null
            ? ['query', 'mapping', 'missing']
            : ['counterNormalization', 'query', 'mapping', 'missing'],
          { mapping },
        ),
      ),
  })
}
export function encodeCollectionContent(
  declaration: Exclude<MappingDeclaration, { readonly kind: 'script' }>,
): ArrayBuffer {
  const content =
    declaration.kind === 'native_collection'
      ? native(declaration.definition)
      : agent(declaration.definition)
  const bytes = encoder.encode(content)
  if (bytes.byteLength > 8 * 1024 * 1024) throw { cause: 'client', code: 'invalid_input' }
  const result = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(result).set(bytes)
  return result
}
