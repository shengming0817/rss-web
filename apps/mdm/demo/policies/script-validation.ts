import Ajv from 'ajv'
import type { ExecutionDefinition } from '../../src/features/policies/clients/model'
import { record } from '../../src/services/decode'
import {
  decodeScriptSpec,
  jsonValue,
  type Json,
  type ScriptSpec,
  type Variant,
} from '../../src/features/policies/clients/resources'
// The published contract allows only keywords shared by Draft 7 and 2020-12,
// with no schema IDs, references, combinators, formats or remote resolution.
const validator = new Ajv({ allErrors: false, logger: false })
const name = (value: string) => /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value)
function invalid(): never {
  throw new Error('Invalid script contract')
}
export function validateScriptVariant(variant: Variant) {
  if (variant.declaration.kind !== 'script') return
  const spec = decodeScriptSpec(variant.declaration.definition)
  if (
    (spec.profile === 'power_shell7' && variant.platform !== 'windows') ||
    (['posix_sh', 'bash'].includes(spec.profile) && variant.platform !== 'macos')
  )
    invalid()
  if (!validator.validateSchema(spec.parameters) || !validator.validateSchema(spec.output))
    invalid()
  const parameters = record(spec.parameters),
    props = record(parameters['properties']),
    required = parameters['required']
  if (
    parameters['type'] !== 'object' ||
    parameters['additionalProperties'] !== false ||
    !Array.isArray(required) ||
    Object.keys(props).length > 32 ||
    required.length !== Object.keys(props).length ||
    new Set(required).size !== required.length ||
    Object.keys(props).some((key) => !required.includes(key)) ||
    Object.keys(props).length !== Object.keys(spec.bindings).length
  )
    invalid()
  const destinations = new Set<string>(),
    positions: number[] = []
  for (const [key, binding] of Object.entries(spec.bindings)) {
    if (!name(key) || !(key in props)) invalid()
    let destination: string
    if (binding.kind === 'named') {
      if (spec.profile !== 'power_shell7' || !name(binding.name)) invalid()
      destination = `named:${binding.name.toLowerCase()}`
    } else if (binding.kind === 'environment') {
      if (
        !name(binding.name) ||
        !binding.name.startsWith('RSS_PARAM_') ||
        binding.name.length <= 10
      )
        invalid()
      destination = `env:${binding.name.toUpperCase()}`
    } else if (binding.kind === 'positional') {
      if (!['posix_sh', 'bash'].includes(spec.profile)) invalid()
      destination = `position:${binding.index}`
      positions.push(binding.index)
    } else invalid()
    if (destinations.has(destination)) invalid()
    destinations.add(destination)
  }
  if (positions.sort((a, b) => a - b).some((n, index) => n !== index)) invalid()
  if (spec.purpose.kind === 'collection') {
    const pointers = Object.values(spec.purpose.mappings)
    if (!pointers.length || pointers.some((p) => !p.startsWith('/') || /~(?![01])/.test(p)))
      invalid()
  }
  if (
    spec.profile === 'osquery_info_v1' &&
    (spec.runAs !== 'system' ||
      Object.keys(spec.bindings).length ||
      spec.maxRows !== 1 ||
      spec.purpose.kind !== 'collection' ||
      Object.keys(spec.purpose.mappings).length !== 1 ||
      spec.purpose.mappings['custom.osquery.version'] !== '/0/version')
  )
    invalid()
}
export function validateScriptParameters(spec: ScriptSpec, value: Json) {
  const parameters = record(jsonValue(value, 65_536))
  if (
    Object.values(parameters).some(
      (v) =>
        !(
          typeof v === 'boolean' ||
          (typeof v === 'string' && !v.includes('\0')) ||
          (typeof v === 'number' && Number.isSafeInteger(v))
        ),
    ) ||
    !validator.validate(spec.parameters, parameters)
  )
    invalid()
}

/** Publication validates fixed fields against Resource; allowed inputs retain its constraints. */
export function validateParameterSources(
  spec: ScriptSpec,
  sources: ExecutionDefinition['action']['parameters'],
) {
  const props = record(spec.parameters['properties'])
  if (
    Object.keys(props).length !== Object.keys(sources).length ||
    Object.keys(sources).some((k) => !(k in props))
  )
    invalid()
  for (const [name, source] of Object.entries(sources)) {
    if (source.kind === 'fixed' && !validator.validate(props[name] as object, source.value))
      invalid()
  }
}
