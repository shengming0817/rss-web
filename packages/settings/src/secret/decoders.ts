import type { SecretPublishReceipt, SecretPublishResponse, SecretVersion } from './types'

function invalid(): never {
  throw new Error('invalid settings secret response')
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

function key(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) invalid()
  return value
}

function version(value: unknown): SecretVersion {
  if (!Number.isSafeInteger(value) || (value as number) < 1) invalid()
  return value as SecretVersion
}

export function decodeSecretPublishResponse(value: unknown): SecretPublishResponse {
  const envelope = record(value, ['data'])
  const input = record(envelope.data, ['key', 'version'])
  const data: SecretPublishReceipt = Object.freeze({
    key: key(input.key),
    version: version(input.version),
  })
  return Object.freeze({ data })
}
