import { expect, it } from 'vitest'
import { certificate, exported, page, vault, validity } from './model'
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222',
  hash = 'ab'.repeat(32)
const cert = {
  subject: 'CN=fixture',
  issuer: 'CN=fixture CA',
  sans: ['fixture.example'],
  serial: '01',
  fingerprint: hash,
  algorithm: 'RSA/2048',
  notBefore: 50,
  notAfter: 200,
  publicKey: hash,
}
it('separates time, CSR and opaque states without claiming trust', () => {
  const facts = [
    {
      name: 'cert.pem',
      format: 'certificate' as const,
      certificates: [cert],
      publicKeys: [hash],
      containsPrivateKey: false,
    },
  ]
  expect(validity(facts, 40, 30)).toBe('not_yet_valid')
  expect(validity(facts, 100, 0)).toBe('valid')
  expect(validity(facts, 100, 1)).toBe('expiring')
  expect(validity(facts, 200, 1)).toBe('expired')
  expect(validity([{ ...facts[0]!, format: 'csr', certificates: [] }], 100, 30)).toBe('request')
  expect(validity([{ ...facts[0]!, format: 'opaque', certificates: [] }], 100, 30)).toBe('unparsed')
  expect(() => certificate({ ...cert, notAfter: 40 })).toThrow()
})
it('rejects foreign pages, fabricated unlock state and mismatched export versions', () => {
  const result = {
    tenantId: id,
    items: [],
    nextAfter: null,
    asOf: 100,
    reminderDays: 30,
    alerts: { expired: 0, expiring: 0, notYetValid: 0 },
  }
  expect(page(result, id).items).toEqual([])
  expect(() => page(result, other)).toThrow()
  expect(() => vault({ initialized: false, generation: 0, unlockedUntil: 150 })).toThrow()
  expect(() =>
    exported(
      { entryId: other, version: 1, files: [{ name: 'key.pk8', data: 'a2V5' }] },
      { entryId: id, version: 1 },
    ),
  ).toThrow()
  expect(() =>
    exported(
      { entryId: id, version: 1, files: [{ name: '../key', data: 'a2V5' }] },
      { entryId: id, version: 1 },
    ),
  ).toThrow()
})
