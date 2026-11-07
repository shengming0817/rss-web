import { visit, type JSONPath } from 'jsonc-parser'
import { clientError, protocolError } from './wire-error'

const strict = { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false }

/** Extract exactly one contract-declared value without materializing its nested JSON. */
function span(text: string, path: readonly string[]): [number, number] {
  let depth = 0,
    start = -1,
    end = -1,
    container = -1
  const matches = (value: JSONPath) =>
    value.length === path.length && path.every((key, index) => value[index] === key)
  function begin(offset: number, at: () => JSONPath, nested: boolean, length: number) {
    if (depth !== path.length || !matches(at())) return
    if (start !== -1) throw clientError()
    start = offset
    if (nested) container = depth
    else end = offset + length
  }
  function open(
    offset: number,
    length: number,
    _line: number,
    _column: number,
    at: () => JSONPath,
  ) {
    begin(offset, at, true, length)
    depth++
  }
  function close(offset: number, length: number) {
    if (--depth === container) end = offset + length
  }
  visit(
    text,
    {
      onObjectBegin: open,
      onArrayBegin: open,
      onObjectEnd: close,
      onArrayEnd: close,
      onLiteralValue: (_value, offset, length, _line, _column, at) =>
        begin(offset, at, false, length),
      onError: () => {
        throw clientError()
      },
    },
    strict,
  )
  if (start < 0 || end <= start) throw clientError()
  return [start, end]
}

export function encodeSnapshotRequest(body: unknown): string {
  const envelope = body as { input?: { document?: unknown } } | null
  const document = envelope?.input?.document
  if (!envelope || typeof document !== 'string') throw clientError()
  try {
    const [start, end] = span(document, [])
    const skeleton = JSON.stringify({ ...envelope, input: { ...envelope.input, document: null } })
    const [at, after] = span(skeleton, ['input', 'document'])
    return skeleton.slice(0, at) + document.slice(start, end) + skeleton.slice(after)
  } catch {
    throw clientError()
  }
}

export function decodeSnapshotResponse(
  value: unknown,
  leaf: 'document' | 'data',
  status: number,
): unknown {
  if (status === 413) return undefined
  if (typeof value !== 'string') throw protocolError(status)
  try {
    if (status >= 400) return JSON.parse(value) as unknown
    const [start, end] = span(value, [leaf])
    const envelope = JSON.parse(value.slice(0, start) + 'null' + value.slice(end)) as Record<
      string,
      unknown
    >
    return { ...envelope, [leaf]: value.slice(start, end) }
  } catch {
    throw protocolError(status)
  }
}
