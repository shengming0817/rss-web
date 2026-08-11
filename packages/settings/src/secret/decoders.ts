import type { SecretPublishReceipt, SecretPublishResponse, SecretVersion } from './types'
import { exactRecord, nonEmptyText, positiveSafeInteger } from '../internal/decode'

function invalid(): never {
  throw new Error('invalid settings secret response')
}

function key(value: unknown): string {
  return nonEmptyText(value, invalid)
}

function version(value: unknown): SecretVersion {
  return positiveSafeInteger(value, invalid) as SecretVersion
}

export function decodeSecretPublishResponse(value: unknown): SecretPublishResponse {
  const envelope = exactRecord(value, ['data'], invalid)
  const input = exactRecord(envelope.data, ['key', 'version'], invalid)
  const data: SecretPublishReceipt = Object.freeze({
    key: key(input.key),
    version: version(input.version),
  })
  return Object.freeze({ data })
}
