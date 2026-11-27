import { expect, it, vi } from 'vitest'
import {
  newProfileOperationId,
  profileExtensions,
  validateLocalProfile,
  validateNewPassword,
  validateLogin,
} from './administration'
it('uses the corrected wall clock for each new profile operation', () => {
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now')
  try {
    for (const time of [now + 120_000, now]) {
      clock.mockReturnValue(time)
      const id = newProfileOperationId()
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      expect(Number.parseInt(id.slice(0, 13).replace('-', ''), 16)).toBe(time)
    }
  } finally {
    clock.mockRestore()
  }
})
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
  expect(() => profileExtensions({ array: Array(1024).fill(false) })).not.toThrow()
  expect(() => profileExtensions({ array: Array(1025).fill(false) })).toThrow()
  expect(() =>
    profileExtensions(Object.fromEntries(Array.from({ length: 1025 }, (_, i) => [`k${i}`, 0]))),
  ).toThrow()
  const members = Object.fromEntries(Array.from({ length: 1024 }, (_, i) => [`k${i}`, false]))
  expect(profileExtensions(members)).toEqual(members)
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
  expect(() => validateLogin('a'.repeat(255))).not.toThrow()
  for (const login of ['a'.repeat(256), ' admin', 'admin ', '用户'])
    expect(() => validateLogin(login)).toThrow()
  expect(() => validateNewPassword('字'.repeat(342))).toThrow()
})
