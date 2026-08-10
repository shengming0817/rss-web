import type {
  LoginResponse,
  LogoutAllResponse,
  LogoutResponse,
  PasswordChangeResponse,
  ProfileKind,
  ProfileResponse,
  RefreshResponse,
} from './types'

const PROFILE_KINDS: ReadonlySet<string> = new Set([
  'user',
  'device',
  'admin',
  'superAdmin',
  'service',
  'anonymous',
])

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalidResponse()
  const record = value as Record<string, unknown>
  const actual = Object.keys(record).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw invalidResponse()
  }
  return record
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string') throw invalidResponse()
  return value
}

function integerField(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw invalidResponse()
  return value
}

function booleanField(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  if (typeof value !== 'boolean') throw invalidResponse()
  return value
}

function invalidResponse(): Error {
  return new Error('invalid identity response')
}

export function decodeLoginResponse(value: unknown): LoginResponse {
  const envelope = exactRecord(value, ['data'])
  const data = exactRecord(envelope.data, [
    'sessionId',
    'expiresAt',
    'accessToken',
    'refreshToken',
    'accessExpiresAt',
  ])
  return {
    data: {
      sessionId: stringField(data, 'sessionId'),
      expiresAt: integerField(data, 'expiresAt'),
      accessToken: stringField(data, 'accessToken'),
      refreshToken: stringField(data, 'refreshToken'),
      accessExpiresAt: integerField(data, 'accessExpiresAt'),
    },
  }
}

export function decodeRefreshResponse(value: unknown): RefreshResponse {
  const envelope = exactRecord(value, ['data'])
  const data = exactRecord(envelope.data, ['accessToken', 'refreshToken', 'accessExpiresAt'])
  return {
    data: {
      accessToken: stringField(data, 'accessToken'),
      refreshToken: stringField(data, 'refreshToken'),
      accessExpiresAt: integerField(data, 'accessExpiresAt'),
    },
  }
}

export function decodeProfileResponse(value: unknown): ProfileResponse {
  const envelope = exactRecord(value, ['data'])
  const data = exactRecord(envelope.data, ['subject', 'tenantId', 'kind'])
  const kind = stringField(data, 'kind')
  if (!PROFILE_KINDS.has(kind)) throw invalidResponse()
  return {
    data: {
      subject: stringField(data, 'subject'),
      tenantId: stringField(data, 'tenantId'),
      kind: kind as ProfileKind,
    },
  }
}

function decodeLoggedOut(value: unknown): boolean {
  const envelope = exactRecord(value, ['data'])
  const data = exactRecord(envelope.data, ['loggedOut'])
  return booleanField(data, 'loggedOut')
}

export function decodeLogoutResponse(value: unknown): LogoutResponse {
  return { data: { loggedOut: decodeLoggedOut(value) } }
}

export function decodeLogoutAllResponse(value: unknown): LogoutAllResponse {
  return { data: { loggedOut: decodeLoggedOut(value) } }
}

export function decodePasswordChangeResponse(value: unknown): PasswordChangeResponse {
  const envelope = exactRecord(value, ['data'])
  const data = exactRecord(envelope.data, ['changed'])
  return { data: { changed: booleanField(data, 'changed') } }
}
