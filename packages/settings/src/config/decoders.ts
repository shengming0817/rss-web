import type {
  ConfigEntry,
  ConfigGetResponse,
  ConfigPublishResponse,
  ConfigRollbackReceipt,
  ConfigRollbackResponse,
  ConfigVersion,
} from './types'

function invalid(): never {
  throw new Error('invalid settings config response')
}

function record(value: unknown, required: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid()
  const input = value as Record<string, unknown>
  if (
    required.some((key) => !Object.hasOwn(input, key)) ||
    Reflect.ownKeys(input).some((key) => typeof key !== 'string' || !required.includes(key))
  )
    invalid()
  return input
}

function text(value: unknown): string {
  if (typeof value !== 'string') invalid()
  return value
}

function key(value: unknown): string {
  const result = text(value)
  if (result.length === 0) invalid()
  return result
}

function version(value: unknown): ConfigVersion {
  if (!Number.isSafeInteger(value) || (value as number) < 1) invalid()
  return value as ConfigVersion
}

function coordinate(value: unknown) {
  const input = record(value, ['key', 'version'])
  return Object.freeze({ key: key(input.key), version: version(input.version) })
}

export function decodeConfigPublishResponse(value: unknown): ConfigPublishResponse {
  const envelope = record(value, ['data'])
  return Object.freeze({ data: coordinate(envelope.data) })
}

export function decodeConfigGetResponse(value: unknown): ConfigGetResponse {
  const envelope = record(value, ['data'])
  const input = record(envelope.data, ['key', 'value', 'version'])
  const data: ConfigEntry = Object.freeze({
    key: key(input.key),
    value: text(input.value),
    version: version(input.version),
  })
  return Object.freeze({ data })
}

export function decodeConfigRollbackResponse(value: unknown): ConfigRollbackResponse {
  const envelope = record(value, ['data'])
  const input = record(envelope.data, ['key', 'version', 'sourceVersion'])
  const data: ConfigRollbackReceipt = Object.freeze({
    key: key(input.key),
    version: version(input.version),
    sourceVersion: version(input.sourceVersion),
  })
  return Object.freeze({ data })
}
