import {
  ACCOUNT_STATUSES,
  type AccountStatus,
  type AccountStatusGetResponse,
  type AccountStatusSetResponse,
} from './types'

const statuses: ReadonlySet<string> = new Set(ACCOUNT_STATUSES)

function invalid(): never {
  throw new Error('invalid account status response')
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid()
  const record = value as Record<string, unknown>
  if (
    Object.keys(record).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(record, key))
  ) {
    invalid()
  }
  return record
}

function status(value: unknown): AccountStatus {
  if (typeof value !== 'string' || !statuses.has(value)) invalid()
  return value as AccountStatus
}

export function decodeAccountStatusGetResponse(value: unknown): AccountStatusGetResponse {
  const envelope = exactRecord(value, ['data'])
  const data = exactRecord(envelope.data, ['status'])
  return { data: { status: status(data.status) } }
}

export function decodeAccountStatusSetResponse(value: unknown): AccountStatusSetResponse {
  const envelope = exactRecord(value, ['data'])
  const data = exactRecord(envelope.data, ['status', 'changed'])
  if (typeof data.changed !== 'boolean') invalid()
  return { data: { status: status(data.status), changed: data.changed } }
}
