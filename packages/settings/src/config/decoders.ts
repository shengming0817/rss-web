import type {
  ConfigEntry,
  ConfigGetResponse,
  ConfigPublishResponse,
  ConfigRollbackReceipt,
  ConfigRollbackResponse,
  ConfigVersion,
} from './types'
import { exactRecord, nonEmptyText, positiveSafeInteger, text } from '../internal/decode'

function invalid(): never {
  throw new Error('invalid settings config response')
}

function key(value: unknown): string {
  return nonEmptyText(value, invalid)
}

function version(value: unknown): ConfigVersion {
  return positiveSafeInteger(value, invalid) as ConfigVersion
}

function coordinate(value: unknown) {
  const input = exactRecord(value, ['key', 'version'], invalid)
  return Object.freeze({ key: key(input.key), version: version(input.version) })
}

export function decodeConfigPublishResponse(value: unknown): ConfigPublishResponse {
  const envelope = exactRecord(value, ['data'], invalid)
  return Object.freeze({ data: coordinate(envelope.data) })
}

export function decodeConfigGetResponse(value: unknown): ConfigGetResponse {
  const envelope = exactRecord(value, ['data'], invalid)
  const input = exactRecord(envelope.data, ['key', 'value', 'version'], invalid)
  const data: ConfigEntry = Object.freeze({
    key: key(input.key),
    value: text(input.value, invalid),
    version: version(input.version),
  })
  return Object.freeze({ data })
}

export function decodeConfigRollbackResponse(value: unknown): ConfigRollbackResponse {
  const envelope = exactRecord(value, ['data'], invalid)
  const input = exactRecord(envelope.data, ['key', 'version', 'sourceVersion'], invalid)
  const data: ConfigRollbackReceipt = Object.freeze({
    key: key(input.key),
    version: version(input.version),
    sourceVersion: version(input.sourceVersion),
  })
  return Object.freeze({ data })
}
