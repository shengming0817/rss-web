import { describe, expect, it } from 'vitest'
import { decodeCursorPage } from './cursor'

const decodeItem = (value: unknown): { id: string } => {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as { id?: unknown }).id !== 'string'
  ) {
    throw new Error('invalid item')
  }
  return { id: (value as { id: string }).id }
}

describe('decodeCursorPage', () => {
  const decode = decodeCursorPage(decodeItem)

  it('decodes data, hasMore and an optional nextCursor', () => {
    expect(decode({ data: [{ id: 'a' }], hasMore: true, nextCursor: 'next' })).toEqual({
      data: [{ id: 'a' }],
      hasMore: true,
      nextCursor: 'next',
    })
    expect(decode({ data: [], hasMore: false })).toEqual({ data: [], hasMore: false })
    expect(decode({ data: [], hasMore: true })).toEqual({ data: [], hasMore: true })
    expect(decode({ data: [], hasMore: false, nextCursor: 'opaque' })).toEqual({
      data: [],
      hasMore: false,
      nextCursor: 'opaque',
    })
  })

  it.each([
    null,
    {},
    { data: {}, hasMore: false },
    { data: [], hasMore: 'false' },
    { data: [], hasMore: false, nextCursor: 1 },
    { data: [{ nope: true }], hasMore: false },
    { data: [], hasMore: false, extra: true },
  ])('rejects malformed cursor pages %#', (value) => {
    expect(() => decode(value)).toThrow()
  })
})
