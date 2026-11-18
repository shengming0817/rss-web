import { expect, it } from 'vitest'
import { mdmJsonBodyLimit } from './mdm-limits'
it('allows 2 MiB only on exact current authorization PUT targets', () => {
  for (const name of ['rules', 'user-groups']) {
    expect(mdmJsonBodyLimit('PUT', `/api/v1/tenants/{tenant}/authorization/${name}/{id}`)).toBe(
      2 * 1024 * 1024,
    )
    expect(
      mdmJsonBodyLimit(
        'PUT',
        `/api/v1/tenants/{tenant}/authorization/${name}/11111111-1111-4111-8111-111111111111`,
      ),
    ).toBe(2 * 1024 * 1024)
    expect(mdmJsonBodyLimit('POST', `/api/v1/tenants/{tenant}/authorization/${name}/{id}`)).toBe(
      16384,
    )
    expect(
      mdmJsonBodyLimit('PUT', `/api/v1/tenants/{tenant}/authorization/${name}/{id}/extra`),
    ).toBe(16384)
  }
})

it.each([
  ['POST', '/api/v1/tenants/{tenant}/policies/{id}', 8 * 1024 * 1024],
  ['POST', '/api/v1/tenants/{tenant}/policies/previews', 8 * 1024 * 1024],
  ['POST', '/api/v1/tenants/{tenant}/resources/{id}', 8 * 1024 * 1024],
  ['POST', '/api/v1/tenants/{tenant}/devices/{device}/operations', 16 * 1024 * 1024],
  ['POST', '/api/v1/tenants/{tenant}/pki/rotations', 64 * 1024 * 1024],
  ['POST', '/api/v1/tenants/{tenant}/pki/crls', 64 * 1024 * 1024],
  ['POST', '/api/v1/tenants/{tenant}/pki/signing/recover', 256 * 1024],
  ['PUT', '/api/v1/tenants/{tenant}/windows/entra-policy', 128 * 1024],
  ['POST', '/api/v1/tenants/{tenant}/certificate-archive/import', 2 * 1024 * 1024],
  ['PUT', '/api/v1/tenant-administration/authorization/rules/{id}', 2 * 1024 * 1024],
  ['POST', '/api/v1/tenants/{tenant}/agent-packages', 1024 * 1024],
  ['POST', '/api/v1/tenants/{tenant}/agent-packages/{id}/withdraw', 1024 * 1024],
  ['POST', '/api/v1/tenants/{tenant}/software/imports', 1024 * 1024],
  ['POST', '/api/v1/tenants/{tenant}/software/sources/{id}/revisions/{revision}', 1024 * 1024],
  ['POST', '/api/v1/tenants/{tenant}/software/resources/{id}/versions/{version}', 1024 * 1024],
] as const)(
  'matches the exact %s %s budget for templates and expanded paths',
  (method, path, limit) => {
    for (const target of [
      path,
      path.replace(/\{[^}]+\}/g, '11111111-1111-4111-8111-111111111111'),
    ]) {
      expect(mdmJsonBodyLimit(method, target)).toBe(limit)
      expect(mdmJsonBodyLimit('DELETE', target)).toBe(16384)
      expect(mdmJsonBodyLimit(method, target + '/extra')).toBe(16384)
    }
  },
)

it('uses the ordinary budget for ADE configuration and leaves content with its streaming owner', () => {
  expect(
    mdmJsonBodyLimit('POST', '/api/v1/tenants/{tenant}/apple/organizations/org/ade/operations'),
  ).toBe(16384)
  expect(mdmJsonBodyLimit('POST', '/api/v1/tenants/{tenant}/resources/pkg/content')).toBe(16384)
  expect(mdmJsonBodyLimit('PATCH', '/api/v1/tenants/{tenant}/resources/pkg/uploads/upload')).toBe(
    16384,
  )
})
