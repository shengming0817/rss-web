import type {
  SecretMaterialBase64,
  SecretPublishReceipt,
  SecretPublishResponse,
  SecretResolveData,
  SecretResolveResponse,
  SecretVersion,
} from './types'
import { exactRecord, nonEmptyText, positiveSafeInteger, text } from '../internal/decode'

const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function invalid(): never {
  throw new Error('invalid settings secret response')
}

function key(value: unknown): string {
  return nonEmptyText(value, invalid)
}

function version(value: unknown): SecretVersion {
  return positiveSafeInteger(value, invalid) as SecretVersion
}

function materialBase64(value: unknown): SecretMaterialBase64 {
  const result = text(value, invalid)
  if (!CANONICAL_BASE64.test(result)) invalid()
  if (result.endsWith('==') && (BASE64_ALPHABET.indexOf(result.at(-3)!) & 0x0f) !== 0) invalid()
  if (
    result.endsWith('=') &&
    !result.endsWith('==') &&
    (BASE64_ALPHABET.indexOf(result.at(-2)!) & 0x03) !== 0
  )
    invalid()
  return result as SecretMaterialBase64
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

export function decodeSecretResolveResponse(value: unknown): SecretResolveResponse {
  const envelope = exactRecord(value, ['data'], invalid)
  const input = exactRecord(envelope.data, ['materialBase64'], invalid)
  const data: SecretResolveData = Object.freeze({
    materialBase64: materialBase64(input.materialBase64),
  })
  return Object.freeze({ data })
}
