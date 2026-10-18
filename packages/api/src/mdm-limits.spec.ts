import { expect, it } from 'vitest'
import { mdmJsonBodyLimit } from './mdm-limits'
it('allows 2 MiB only on exact current authorization PUT targets', () => {
  for (const name of ['rules', 'user-groups']) {
    expect(mdmJsonBodyLimit('PUT', `/api/v1/authorization/${name}/{id}`)).toBe(2 * 1024 * 1024)
    expect(
      mdmJsonBodyLimit('PUT', `/api/v1/authorization/${name}/11111111-1111-4111-8111-111111111111`),
    ).toBe(2 * 1024 * 1024)
    expect(mdmJsonBodyLimit('POST', `/api/v1/authorization/${name}/{id}`)).toBe(16384)
    expect(mdmJsonBodyLimit('PUT', `/api/v1/authorization/${name}/{id}/extra`)).toBe(16384)
  }
  expect(mdmJsonBodyLimit('PUT', '/api/v1/mdm-candidate/authorization/rules/{id}')).toBe(16384)
})

it.each([
  ['POST', '/api/v1/policies/{id}', 8 * 1024 * 1024],
  ['POST', '/api/v1/policies/previews', 8 * 1024 * 1024],
  ['POST', '/api/v1/resources/{id}', 8 * 1024 * 1024],
  ['POST', '/api/v1/devices/{device}/operations', 16 * 1024 * 1024],
  ['POST', '/api/v1/pki/rotations', 64 * 1024 * 1024],
  ['POST', '/api/v1/pki/crls', 64 * 1024 * 1024],
  ['POST', '/api/v1/pki/signing/recover', 256 * 1024],
  ['PUT', '/api/v1/windows/entra-policy', 128 * 1024],
  ['POST', '/api/v1/certificate-archive/import', 2 * 1024 * 1024],
  ['PUT', '/api/v1/tenant-administration/authorization/rules/{id}', 2 * 1024 * 1024],
  ['POST', '/api/v1/agent-packages', 1024 * 1024],
  ['POST', '/api/v1/agent-packages/{id}/withdraw', 1024 * 1024],
  ['POST', '/api/v1/software/imports', 1024 * 1024],
  ['POST', '/api/v1/software/sources/{id}/revisions/{revision}', 1024 * 1024],
  ['POST', '/api/v1/software/resources/{id}/versions/{version}', 1024 * 1024],
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
  expect(mdmJsonBodyLimit('POST', '/api/v1/apple/organizations/org/ade/operations')).toBe(16384)
  expect(mdmJsonBodyLimit('POST', '/api/v1/resources/pkg/content')).toBe(16384)
  expect(mdmJsonBodyLimit('PATCH', '/api/v1/resources/pkg/uploads/upload')).toBe(16384)
})
