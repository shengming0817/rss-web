import { expect, it } from 'vitest'
import { formatFilter, parseFilter } from './query-filter'

it('preserves backend precedence and both quoted and bare escaped operands', () => {
  const source = 'name==a\\,b;(revision=ge=2,active==false)'
  const parsed = parseFilter(source)
  expect(parseFilter(formatFilter(parsed))).toEqual(parsed)
  expect(parsed).toMatchObject({ kind: 'and', children: [{ values: ['a,b'] }, { kind: 'or' }] })
  for (const value of ["a'b\\c,*", 'a;()', '', '中文', 'false', '0']) {
    const tree = { kind: 'compare' as const, field: 'name', operator: '==', values: [value] }
    expect(parseFilter(formatFilter(tree))).toEqual(tree)
  }
})
it('rejects invalid syntax and bounds work before restoring editor trees', () => {
  for (const filter of [
    '',
    'x==',
    'x==a and y==b',
    'x<1',
    'x==a*',
    'x=="a\\q"',
    'x=in=()',
    'x==1;',
    '('.repeat(17) + 'x==1' + ')'.repeat(17),
    'x==' + 'a'.repeat(1025),
    Array(130).fill('x==1').join(';'),
  ])
    expect(() => parseFilter(filter)).toThrow()
  expect(() => formatFilter({ kind: 'or', children: [] })).toThrow('Incomplete condition')
})
