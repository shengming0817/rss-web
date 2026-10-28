import { clientError, protocolError } from './wire-error'
import type { HttpMethod } from './types'
type Validate = (value: unknown) => boolean
interface ResponseBranch {
  status: number
  media: string | null
  validate: Validate | null
  headers: Readonly<Record<string, Validate>>
}
export interface EndpointDescription {
  operationId: string
  method: HttpMethod
  path: string
  captures: readonly string[]
  pathShape: 'object' | 'scalar' | 'tuple' | null
  queryOwner:
    | {
        kind: 'directory'
        schema: {
          fields: readonly ({ name: string; output: boolean; sort: boolean } & Record<
            string,
            unknown
          >)[]
        } & Record<string, unknown>
      }
    | { kind: 'window'; schema: unknown }
    | { kind: 'catalog'; schema: unknown }
    | null
  publicRead: boolean
  requestHeaders: readonly string[]
  requiredHeaders: readonly string[]
  contentType: string | null
  binary: boolean
  statuses: readonly number[]
  checks: {
    headers: Readonly<Record<string, Validate>>
    path: Validate | null
    query: Validate | null
    body: Validate | null
  }
  responses: readonly ResponseBranch[]
}
/** JSON boundary policy shared by generated contracts, including open extension leaves. */
export function safeJson(value: unknown): void {
  const active = new Set<object>()
  function visit(v: unknown): void {
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw clientError()
    } else if (v !== null && typeof v === 'object') {
      if (active.has(v)) throw clientError()
      active.add(v)
      for (const child of Object.values(v)) visit(child)
      active.delete(v)
    } else if (!['string', 'boolean', 'undefined'].includes(typeof v) && v !== null)
      throw clientError()
  }
  visit(value)
}

/** Called only by the HTTP executor, before exposing a response or projecting its error. */
export function validateEndpointResponse(
  contract: EndpointDescription,
  status: number,
  data: unknown,
  headers: Readonly<Record<string, unknown>>,
) {
  const header = (name: string) =>
    Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
  const contentType = header('content-type')
  const media =
    typeof contentType === 'string' ? contentType.split(';')[0]?.trim().toLowerCase() : null
  // A gateway can reject before the handler. Its body never becomes trusted domain data.
  if (status === 413) return
  const candidates = contract.responses.filter(
    (r) =>
      r.status === status &&
      (r.media === null || r.media.split(';')[0]?.trim().toLowerCase() === media),
  )
  const accepted = candidates.some((r) => {
    if (
      !Object.entries(r.headers).every(([name, validate]) => {
        if (name.toLowerCase() === 'set-cookie') return true // The browser owns this inaccessible response header.
        const value = header(name)
        return typeof value === 'string' && validate(value)
      })
    )
      return false
    if (!r.validate) return data === undefined || data === null || data === ''
    if (contract.binary && contract.statuses.includes(status)) {
      if (!(data instanceof ArrayBuffer)) return false
      if (r.media?.startsWith('application/json')) {
        try {
          const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data))
          safeJson(value)
          return r.validate(value)
        } catch {
          return false
        }
      }
      return true
    }
    return r.validate(data)
  })
  if (!accepted) throw protocolError(status)
  if (!(data instanceof ArrayBuffer)) safeJson(data)
}
