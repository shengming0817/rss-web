import { describe, expect, it } from 'vitest'
import { count, identifier, nullable } from './decode'
import { allOf, comparison, pageCursor, projectedPage, queryParameters } from './directory-query'

describe('current directory protocol', () => {
  it('encodes literal filters and current continuation parameters without losing false or zero', () => {
    expect(comparison('name', '=icontains=', "a';(x)\\")).toBe("name=icontains='a\\';(x)\\\\'")
    expect(
      queryParameters({
        filter: allOf(comparison('active', '==', false), comparison('revision', '==', 0)),
        sort: ['kind', '-revision'],
        fields: ['id'],
        limit: 20,
        cursor: 'YWJj',
      }),
    ).toEqual({
      filter: "(active=='false');(revision=='0')",
      sort: 'kind,-revision',
      fields: 'id',
      limit: 20,
      cursor: 'YWJj',
    })
  })
  it('rejects empty or duplicate field sets, invalid limits and retired parameters', () => {
    for (const query of [
      { fields: [] },
      { fields: ['id', 'id'] },
      { limit: 0 },
      { sort: [] },
      { filter: '' },
      { after: 'YWJj' },
    ])
      expect(() => queryParameters(query)).toThrow()
  })
  it('accepts long opaque canonical cursors and rejects malformed encodings', () => {
    expect(pageCursor('A'.repeat(4096))).toHaveLength(4096)
    for (const token of ['', 'a', 'ab', 'abc=', 'ab+c', 'A'.repeat(4097)])
      expect(() => pageCursor(token)).toThrow()
  })
  it('decodes precisely the selected fields and preserves absent versus null', () => {
    const codecs = {
      id: identifier,
      revision: count,
      activeVersion: (v: unknown) => nullable(v, identifier),
    }
    expect(
      projectedPage({ items: [{ id: 'resource' }], nextCursor: null }, codecs, ['id']).items,
    ).toEqual([{ id: 'resource' }])
    expect(
      projectedPage({ items: [{ activeVersion: null }], nextCursor: null }, codecs, [
        'activeVersion',
      ]).items,
    ).toEqual([{ activeVersion: null }])
    for (const row of [{}, { id: 'resource', revision: 1 }])
      expect(() => projectedPage({ items: [row], nextCursor: null }, codecs, ['id'])).toThrow()
  })
})
