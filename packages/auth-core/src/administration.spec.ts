import { expect, it } from 'vitest'
import { profileExtensions, validateLocalProfile, validateNewPassword } from './administration'
it('preserves unknown extension keys, including prototype-like names, without prototype mutation', () => {
  const input = JSON.parse(
    '{"__proto__":{"futureKey":0},"vendor":{"enabled":false,"empty":"","optional":null},"constructor":"business"}',
  )
  const result = profileExtensions(input)
  expect(JSON.stringify(result)).toBe(JSON.stringify(input))
  expect(Object.prototype).not.toHaveProperty('futureKey')
})
it('counts root object as depth one and enforces aggregate members, arrays and UTF8 bytes', () => {
  const nested = (depth: number): unknown => (depth === 1 ? {} : { child: nested(depth - 1) })
  expect(() => profileExtensions(nested(8))).not.toThrow()
  expect(() => profileExtensions(nested(9))).toThrow()
  expect(() => profileExtensions({ array: Array(128).fill(false) })).not.toThrow()
  expect(() => profileExtensions({ array: Array(129).fill(false) })).toThrow()
  expect(() =>
    profileExtensions(Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`k${i}`, 0]))),
  ).toThrow()
  expect(() => profileExtensions({ value: '字'.repeat(22000) })).toThrow()
})
it('rejects nested normalized secret keys, control keys, nonfinite/unsafe values and NUL strings', () => {
  for (const value of [
    { vendor: { 'Client-Secret': 'x' } },
    { 'key\u0085': true },
    { value: '\u0000' },
    { n: Infinity },
    { n: 9007199254740992 },
  ])
    expect(() => profileExtensions(value)).toThrow()
  expect(() => profileExtensions({ n: 1.5, future: false, empty: '', list: [null] })).not.toThrow()
})
it('normalizes secret keys using the backend ASCII rule and preserves allowed Unicode keys', () => {
  const allowed = { private_Key: 'ordinary label', vendor: { future: false } }
  expect(profileExtensions(allowed)).toEqual(allowed)
  for (const key of ['private_key', 'PRIVATE-KEY', 'Private_Key'])
    expect(() => profileExtensions({ [key]: 'x' })).toThrow()
})
it('validates local profile source budgets and password character/byte limits', () => {
  const value = {
    displayName: 'Name',
    username: null,
    email: null,
    extensions: {},
    maxAgeSeconds: 60,
  }
  expect(() => validateLocalProfile(value)).not.toThrow()
  expect(() => validateLocalProfile({ ...value, maxAgeSeconds: 59 })).toThrow()
  expect(() => validateLocalProfile({ ...value, displayName: '字'.repeat(171) })).toThrow()
  expect(() => validateNewPassword('字'.repeat(15))).not.toThrow()
  expect(() => validateNewPassword('short')).toThrow()
  expect(() => validateNewPassword('字'.repeat(342))).toThrow()
})
