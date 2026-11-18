import { expect, it } from 'vitest'
import { loadMdmHostConfig, mdmTenantFromPath, type HttpTransport } from './mdm'
const tenant = '11111111-1111-4111-8111-111111111111'
const managementTenant = '22222222-2222-4222-8222-222222222222'
const valid = {
  canonicalOrigin: 'https://console.example',
  managementTenant,
  serviceId: '33333333-3333-4333-8333-333333333333',
}
function transport(value: unknown): HttpTransport {
  return {
    request: async (options: { decode: (value: unknown) => unknown }) => options.decode(value),
  } as HttpTransport
}
it('accepts only a complete HTTPS host with installation and platform coordinates', async () => {
  expect(await loadMdmHostConfig(transport(valid), valid.canonicalOrigin)).toEqual(valid)
  for (const value of [
    { ...valid, managementTenant: null },
    { ...valid, serviceId: '' },
    { ...valid, canonicalOrigin: 'https://other.example' },
    { ...valid, tenant },
    { ...valid, extra: true },
  ]) {
    await expect(loadMdmHostConfig(transport(value), valid.canonicalOrigin)).rejects.toThrow()
  }
})

it('accepts only an explicit canonical business locator', () => {
  expect(mdmTenantFromPath(`/tenants/${tenant}/login`, managementTenant)).toBe(tenant)
  for (const path of [
    '/',
    '/login',
    '/tenants',
    '/tenants/00000000-0000-0000-0000-000000000000',
    '/tenants/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
    `/tenants/%31${tenant.slice(1)}`,
    `/tenants/${managementTenant}`,
  ])
    expect(mdmTenantFromPath(path, managementTenant)).toBeNull()
})
