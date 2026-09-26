import { describe, expect, it } from 'vitest'
import { decodeWorkspace, decodeMdmConfig } from './workspace'
describe('MDM app configuration and navigation', () => {
  it('fails closed for origin mismatch and unrecognized module source', () => {
    expect(() =>
      decodeMdmConfig({ tenant: 'a', canonicalOrigin: 'https://other.test' }, 'https://mdm.test'),
    ).toThrow()
    expect(() =>
      decodeWorkspace({ modules: [{ id: 'devices', source: 'fallback', available: true }] }),
    ).toThrow()
  })
  it('keeps unknown navigation distinct from a denied entry', () => {
    expect(
      decodeWorkspace({ modules: [{ id: 'devices', source: 'real', available: null }] }).modules[0]
        ?.available,
    ).toBeNull()
    expect(
      decodeWorkspace({ modules: [{ id: 'devices', source: 'real', available: false }] }).modules[0]
        ?.available,
    ).toBe(false)
  })
})

it('rejects mock data in production and never calls a fallback', async () => {
  const { createWorkspaceClient } = await import('./workspace')
  let calls = 0
  const transport = {
    async request(options: { decode: (v: unknown) => unknown }) {
      calls++
      return options.decode({ modules: [{ id: 'devices', source: 'mock', available: true }] })
    },
  } as import('@rss/api/mdm').HttpTransport
  await expect(createWorkspaceClient(transport, false).read()).rejects.toThrow()
  expect(calls).toBe(1)
  expect((await createWorkspaceClient(transport, true).read()).modules[0]?.source).toBe('mock')
})

it('validates the static host identity and closed module data', () => {
  const tenant = '11111111-1111-4111-8111-111111111111'
  expect(
    decodeMdmConfig({ tenant, canonicalOrigin: 'https://mdm.test' }, 'https://mdm.test').tenant,
  ).toBe(tenant)
  for (const value of [
    null,
    [],
    { tenant, canonicalOrigin: 'http://mdm.test' },
    { tenant: 'invalid', canonicalOrigin: 'https://mdm.test' },
  ])
    expect(() => decodeMdmConfig(value, 'https://mdm.test')).toThrow()
  for (const value of [
    { modules: {} },
    { modules: [{ id: 'devices', source: 'real', available: 'yes' }] },
    {
      modules: [
        { id: 'devices', source: 'real', available: true },
        { id: 'devices', source: 'real', available: true },
      ],
    },
  ])
    expect(() => decodeWorkspace(value)).toThrow()
})
