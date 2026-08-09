/**
 * Typed response envelopes — STATIC SNAPSHOT.
 *
 * Each HTTP contract's response set (status → generated response struct) is
 * declared in the backend contract.yaml and surfaced by `gocell validate
 * --strict` (gate CH-06 enforces the 1:1 bijection). No HTTP endpoint exposes
 * it yet, so this is a labelled snapshot covering a representative subset of
 * the real contract ids in CELL_MANIFEST. Struct names are code identifiers
 * (not translated); the kind drives the semantic colour + screen-reader text.
 */

export type EnvelopeKind = '2xx' | '4xx' | '5xx'

export interface ResponseEnvelopeEntry {
  readonly status: number
  /** Generated response struct name (code identifier — not translated). */
  readonly object: string
  readonly kind: EnvelopeKind
}

/** contractId → ordered response entries. */
export const RESPONSE_ENVELOPES: Readonly<Record<string, readonly ResponseEnvelopeEntry[]>> = {
  'http.auth.login.v1': [
    { status: 200, object: 'LoginResponse', kind: '2xx' },
    { status: 400, object: 'Login400ErrorResponse', kind: '4xx' },
    { status: 401, object: 'Login401ErrorResponse', kind: '4xx' },
    { status: 429, object: 'Login429ErrorResponse', kind: '4xx' },
  ],
  'http.auth.user.create.v1': [
    { status: 201, object: 'UserCreateResponse', kind: '2xx' },
    { status: 400, object: 'UserCreate400ErrorResponse', kind: '4xx' },
    { status: 409, object: 'UserCreate409ErrorResponse', kind: '4xx' },
  ],
  'http.audit.list.v1': [
    { status: 200, object: 'AuditListResponse', kind: '2xx' },
    { status: 400, object: 'AuditList400ErrorResponse', kind: '4xx' },
    { status: 500, object: 'AuditList500ErrorResponse', kind: '5xx' },
  ],
  'http.config.get.v1': [
    { status: 200, object: 'ConfigGetResponse', kind: '2xx' },
    { status: 404, object: 'ConfigGet404ErrorResponse', kind: '4xx' },
  ],
  'http.config.publish.v1': [
    { status: 200, object: 'ConfigPublishResponse', kind: '2xx' },
    { status: 409, object: 'ConfigPublish409ErrorResponse', kind: '4xx' },
  ],
} as const

/** Response envelope entries for a contract, or null if no snapshot exists. */
export function responseEnvelopeFor(contract: string): readonly ResponseEnvelopeEntry[] | null {
  return RESPONSE_ENVELOPES[contract] ?? null
}
