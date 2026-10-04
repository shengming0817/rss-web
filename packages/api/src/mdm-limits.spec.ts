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
