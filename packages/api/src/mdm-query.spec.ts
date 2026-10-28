import { describe, expect, it } from 'vitest'
const count = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid count')
  return value
}
const identifier = (value: unknown) => {
  if (typeof value !== 'string' || !value) throw new Error('Invalid identifier')
  return value
}
const nullable = <T>(value: unknown, decode: (value: unknown) => T) =>
  value === null ? null : decode(value)
import { allOf, comparison, pageCursor, projectedPage, queryParameters } from './mdm-query'

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

it('validates each filter independently so user syntax cannot escape fixed selector conditions', () => {
  for (const fixed of ["kind=='relying_party'", "platform=='windows'", "status=='active'"]) {
    for (const input of [
      "id=='x'),(id=='other'",
      "id=='x');(id=='other'",
      "id=='unclosed",
      "id=='x'),assetContext=='associated_device';(id!='x'",
    ]) {
      expect(() => allOf(fixed, input)).toThrow()
    }
    expect(allOf(fixed, "id=='x',id=='other'")).toBe(`(${fixed});(id=='x',id=='other')`)
    expect(allOf(fixed, comparison('id', '==', "x'),(id=='other"))).toContain(fixed)
  }
})
