import { expect, it } from 'vitest'
import { jsonObject, jsonValue } from './json'

it('retains nested extension data without promoting keys into the enclosing contract', () => {
  const value = JSON.parse(
    '{"vendor":{"help":[false,0,null,"中文"]},"tenant":"untrusted","__proto__":{"allowed":true}}',
  )
  const decoded = jsonObject(value, 65536)
  expect(decoded).toEqual(value)
  expect(decoded).not.toBe(value)
  expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype)
  expect({}).not.toHaveProperty('allowed')
})

it('enforces UTF-8 bytes, depth, node, key and string budgets for extensions', () => {
  expect(jsonObject({ x: '中' }, 11)).toEqual({ x: '中' })
  expect(() => jsonObject({ x: '中' }, 10)).toThrow()
  expect(() => jsonObject({ x: Array(4096).fill(null) }, 65536)).toThrow()
  expect(jsonObject({ x: Array(4095).fill(null) }, 65536)).toBeDefined()
  let nested: unknown = null
  for (let i = 0; i < 17; i++) nested = { x: nested }
  expect(() => jsonObject(nested, 65536)).toThrow()
  for (const value of [
    { '': 1 },
    { ['中'.repeat(86)]: 1 },
    { '\n': 1 },
    { x: '\0' },
    { x: Infinity },
    { x: undefined },
    { x: new Date() },
    [],
  ])
    expect(() => jsonObject(value, 65536)).toThrow()
  const cycle: Record<string, unknown> = {}
  cycle['self'] = cycle
  expect(() => jsonObject(cycle, 65536)).toThrow()
})

it('leaves module-owned JSON key semantics to the module decoder', () => {
  expect(jsonValue({ '': 'literal', rows: Array(4096).fill(0) }, 65536)).toBeDefined()
  expect(() => jsonValue({ x: NaN }, 65536)).toThrow()
})
