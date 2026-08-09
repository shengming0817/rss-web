import type { CursorPage, Decoder } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function decodeCursorPage<T>(decodeItem: Decoder<T>): Decoder<CursorPage<T>> {
  return (value) => {
    if (!isRecord(value)) throw new Error('invalid cursor page')
    const keys = Object.keys(value)
    if (keys.some((key) => !['data', 'hasMore', 'nextCursor'].includes(key))) {
      throw new Error('invalid cursor page')
    }
    if (!Array.isArray(value.data) || typeof value.hasMore !== 'boolean') {
      throw new Error('invalid cursor page')
    }
    if (value.nextCursor !== undefined && typeof value.nextCursor !== 'string') {
      throw new Error('invalid cursor page')
    }
    const page: CursorPage<T> = {
      data: value.data.map((item) => decodeItem(item)),
      hasMore: value.hasMore,
    }
    if (value.nextCursor !== undefined) page.nextCursor = value.nextCursor
    return page
  }
}
