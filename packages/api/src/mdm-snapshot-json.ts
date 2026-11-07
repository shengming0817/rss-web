import * as scannerApi from 'jsonc-parser'
import type { ScanError as ScannerError, SyntaxKind } from 'jsonc-parser'
import { clientError, protocolError } from './wire-error'

// jsonc-parser ships these enum tables in JS but declares them as ambient const enums.
const Token = Reflect.get(scannerApi as object, 'SyntaxKind') as Record<
  keyof typeof SyntaxKind,
  number
>
const ScanError = Reflect.get(scannerApi as object, 'ScanError') as Record<
  keyof typeof ScannerError,
  number
>

const enum Frame {
  ObjectFirst = 1,
  ObjectKey,
  ObjectColon,
  ObjectValue,
  ObjectEnd,
  ArrayFirst,
  ArrayValue,
  ArrayEnd,
}

/** Reuse the lexer and validate containers without materializing nested JSON or recursing. */
function span(text: string, path: readonly string[]): [number, number] {
  const scanner = scannerApi.createScanner(text),
    whitespace = /[ \t\r\n]*/y,
    // JSON rejects unescaped C0 control characters.
    // eslint-disable-next-line no-control-regex
    stringRun = /[^"\\\u0000-\u001f]*/y,
    escape = /(?:["\\/bfnrt]|u[0-9a-fA-F]{4})/y,
    keys: (string | undefined)[] = []
  let stack = new Uint8Array(64),
    depth = 0,
    root = false,
    start = -1,
    end = -1,
    selectedDepth = -1
  function value(token: SyntaxKind, offset: number) {
    const selected = depth === path.length && path.every((key, index) => key === keys[index])
    if (selected) {
      if (start >= 0) throw clientError()
      start = offset
    }
    if (token === Token.OpenBraceToken || token === Token.OpenBracketToken) {
      if (selected) selectedDepth = depth
      if (depth < path.length) keys[depth] = undefined
      if (depth === stack.length) {
        const larger = new Uint8Array(stack.length * 2)
        larger.set(stack)
        stack = larger
      }
      stack[depth++] = token === Token.OpenBraceToken ? Frame.ObjectFirst : Frame.ArrayFirst
    } else {
      if (
        token !== Token.StringLiteral &&
        token !== Token.NumericLiteral &&
        token !== Token.TrueKeyword &&
        token !== Token.FalseKeyword &&
        token !== Token.NullKeyword
      )
        throw clientError()
      if (selected) end = scanner.getPosition()
    }
  }
  for (;;) {
    whitespace.lastIndex = scanner.getPosition()
    whitespace.test(text)
    const offset = whitespace.lastIndex
    scanner.setPosition(offset)
    let token: SyntaxKind
    if (text[offset] === '"') {
      // The library materializes decoded strings and accumulates trivia. These
      // runs can span most of the request, so advance over their offsets only.
      let next = offset + 1
      for (;;) {
        stringRun.lastIndex = next
        stringRun.test(text)
        const stop = stringRun.lastIndex
        if (text[stop] === '"') {
          scanner.setPosition(stop + 1)
          break
        }
        if (text[stop] !== '\\') throw clientError()
        escape.lastIndex = stop + 1
        if (!escape.test(text)) throw clientError()
        next = escape.lastIndex
      }
      token = Token.StringLiteral
    } else {
      if (text[offset] === '/') throw clientError()
      token = scanner.scan()
      if (scanner.getTokenError() !== ScanError.None) throw clientError()
    }
    if (token === Token.EOF) {
      if (!root || depth || start < 0 || end <= start) throw clientError()
      return [start, end]
    }
    if (!depth) {
      if (root) throw clientError()
      root = true
      value(token, offset)
      continue
    }
    const frame = stack[depth - 1]!
    if (
      (token === Token.CloseBraceToken &&
        (frame === Frame.ObjectFirst || frame === Frame.ObjectEnd)) ||
      (token === Token.CloseBracketToken &&
        (frame === Frame.ArrayFirst || frame === Frame.ArrayEnd))
    ) {
      if (--depth === selectedDepth) {
        end = scanner.getPosition()
        selectedDepth = -1
      }
    } else if (
      token === Token.CommaToken &&
      (frame === Frame.ObjectEnd || frame === Frame.ArrayEnd)
    ) {
      stack[depth - 1] = frame === Frame.ObjectEnd ? Frame.ObjectKey : Frame.ArrayValue
    } else if (frame === Frame.ObjectColon && token === Token.ColonToken) {
      stack[depth - 1] = Frame.ObjectValue
    } else if (
      (frame === Frame.ObjectFirst || frame === Frame.ObjectKey) &&
      token === Token.StringLiteral
    ) {
      if (depth <= path.length) {
        const expected = path[depth - 1]!
        const end = scanner.getPosition()
        keys[depth - 1] =
          end - offset <= expected.length * 6 + 2 &&
          JSON.parse(text.slice(offset, end)) === expected
            ? expected
            : undefined
      }
      stack[depth - 1] = Frame.ObjectColon
    } else if (
      frame === Frame.ObjectValue ||
      frame === Frame.ArrayFirst ||
      frame === Frame.ArrayValue
    ) {
      stack[depth - 1] = frame === Frame.ObjectValue ? Frame.ObjectEnd : Frame.ArrayEnd
      value(token, offset)
    } else throw clientError()
  }
}

export function encodeSnapshotRequest(body: unknown, checkBudget?: (text: string) => void): string {
  const envelope = body as { input?: { document?: unknown } } | null
  const document = envelope?.input?.document
  if (!envelope || typeof document !== 'string') throw clientError()
  const skeleton = JSON.stringify({ ...envelope, input: { ...envelope.input, document: null } })
  const [at, after] = span(skeleton, ['input', 'document'])
  const request = skeleton.slice(0, at) + document + skeleton.slice(after)
  checkBudget?.(request)
  span(document, [])
  return request
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
