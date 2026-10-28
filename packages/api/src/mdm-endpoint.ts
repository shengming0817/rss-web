import { safeJson, type EndpointDescription } from './mdm-contract-response'
import type { HttpTransport, RequestOptions } from './types'
import { clientError, protocolError } from './wire-error'
import { resolvePath } from './transport'

interface Arguments {
  pathParams?: Readonly<Record<string, string | number>>
  query?: Readonly<Record<string, string | number | boolean | null | undefined>> | undefined
  headers?: Readonly<Record<string, string>> | undefined
  body?: unknown
  signal?: AbortSignal | undefined
  timeoutMs?: number | undefined
}

export type WireInput<T> = T extends readonly (infer V)[]
  ? WireInput<V>[]
  : T extends object
    ? { [K in keyof T]: WireInput<T[K]> | (undefined extends T[K] ? undefined : never) }
    : T

/** Generated operations use the existing executor; the session owns credential injection. */
export function defineEndpoint<Input extends object, Output>(description: EndpointDescription) {
  function params(input: Arguments) {
    const p = input.pathParams ?? {}
    safeJson(p)
    resolvePath(description.path, p)
    const values = description.captures.map((name) => p[name])
    const carrier =
      description.pathShape === 'object'
        ? p
        : description.pathShape === 'scalar'
          ? values[0]
          : values
    if (description.checks.path && !description.checks.path(carrier)) throw clientError()
    return p
  }
  function endpoint(transport: HttpTransport, parameters: Input): Promise<Output>
  function endpoint<View>(
    transport: HttpTransport,
    parameters: Input,
    project: (value: Output) => View,
  ): Promise<View>
  async function endpoint<View>(
    transport: HttpTransport,
    parameters: Input,
    project?: (value: Output) => View,
  ): Promise<View> {
    const input = parameters as Arguments
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw clientError()
    if (
      input.query !== undefined &&
      (!input.query || typeof input.query !== 'object' || Array.isArray(input.query))
    )
      throw clientError()
    const pathParams = params(input)
    for (const [key, value] of Object.entries(input.headers ?? {})) {
      if (
        typeof value !== 'string' ||
        [...value].some((character) => {
          const code = character.charCodeAt(0)
          return (code < 32 && code !== 9) || code === 127
        })
      )
        throw clientError()
      if (key.toLowerCase() === 'content-type' && value === description.contentType) continue
      const validate = Object.entries(description.checks.headers).find(
        ([name]) => name.toLowerCase() === key.toLowerCase(),
      )?.[1]
      if (validate && !validate(value)) throw clientError()
      if (!description.requestHeaders.some((k) => k.toLowerCase() === key.toLowerCase()))
        throw clientError()
    }
    for (const key of description.requiredHeaders) {
      if (!Object.keys(input.headers ?? {}).some((k) => k.toLowerCase() === key.toLowerCase()))
        throw clientError()
    }
    const query =
      input.query &&
      Object.fromEntries(Object.entries(input.query).filter(([, v]) => v !== undefined))
    safeJson(query)
    if (
      description.checks.query
        ? !description.checks.query(query ?? {})
        : query && Object.keys(query).length
    )
      throw clientError()
    if (description.queryOwner?.kind === 'directory') {
      for (const key of ['fields', 'sort'] as const) {
        const encoded = query?.[key]
        if (encoded === undefined) continue
        if (typeof encoded !== 'string') throw clientError()
        const names = encoded
          .split(',')
          .map((name) => (key === 'sort' ? name.replace(/^-/, '') : name))
        if (
          new Set(names).size !== names.length ||
          names.some(
            (name) =>
              !description.queryOwner ||
              description.queryOwner.kind !== 'directory' ||
              !description.queryOwner.schema.fields.some(
                (field) => field.name === name && field[key === 'fields' ? 'output' : 'sort'],
              ),
          )
        )
          throw clientError()
      }
    }
    if (description.contentType === 'application/octet-stream') {
      if (!(input.body instanceof ArrayBuffer)) throw clientError()
    } else if (description.checks.body) {
      if (input.body === undefined) throw clientError()
      safeJson(input.body)
      // Validate the JSON representation sent by the executor (undefined means omitted).
      if (!description.checks.body(JSON.parse(JSON.stringify(input.body)))) throw clientError()
    } else if (input.body !== undefined) throw clientError()
    const success = description.responses.filter((r) => description.statuses.includes(r.status))
    const empty = success.every((r) => !r.validate)
    const options = {
      method: description.method,
      path: description.path,
      pathParams,
      ...(query ? { query } : {}),
      ...(input.body === undefined ? {} : { body: input.body }),
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
      headers: {
        ...input.headers,
        ...(description.contentType ? { 'Content-Type': description.contentType } : {}),
      },
      successStatus:
        description.statuses.length === 1 ? description.statuses[0] : description.statuses,
      ...(description.binary
        ? { responseType: 'arraybuffer' as const }
        : empty && description.statuses[0] !== 204
          ? { responseType: 'empty' as const }
          : {}),
      contract: description,
      decode(value: unknown) {
        if (!description.binary) {
          safeJson(value)
          if (!success.some((r) => r.validate?.(value))) throw protocolError()
        }
        return project ? project(value as Output) : (value as View)
      },
    }
    return transport.request(options as RequestOptions<View>)
  }
  endpoint.method = description.method
  endpoint.url = (
    pathParams: Input extends { pathParams: infer P } ? P : Record<string, never>,
  ) => {
    const p = params({ pathParams: pathParams as NonNullable<Arguments['pathParams']> })
    return resolvePath(description.path, p)
  }
  return endpoint
}
