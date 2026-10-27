import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { createOnboardingDemo } from './enrollment'
import { installer } from '../src/features/enrollment/clients/packages'
import { TENANT } from './scenario'

it('offers four explicitly synthetic anonymous downloads with exact metadata and no registration secret', () => {
  const domain = createOnboardingDemo(
    () => false,
    () => false,
  )
  const get = (path: string) =>
    domain.handle(
      {
        method: 'GET',
        path,
        body: undefined,
        headers: {},
        query: new URLSearchParams(),
        actor: { principalId: '', sessionId: '', tenantId: TENANT },
      },
      'normal',
    )!
  const catalog = get('/api/v1/agent/enroll/packages')
  expect(catalog.status).toBe(200)
  const packages = (catalog.body as unknown[]).map((value) => installer(value, TENANT))
  expect(packages.map((item) => `${item.target.platform}/${item.target.architecture}`)).toEqual([
    'windows/x86_64',
    'windows/aarch64',
    'macos/x86_64',
    'macos/aarch64',
  ])
  for (const item of packages) {
    expect(item.filename).toContain('MOCK-NOT-AN-INSTALLER')
    expect(get(`/api/v1/agent/enroll/packages/${item.releaseId}`).body).toEqual(item)
    const content = get(`/api/v1/agent/enroll/packages/${item.releaseId}/content`)
    const bytes = new Uint8Array(content.body as ArrayBuffer)
    expect(content.status).toBe(200)
    expect(bytes.byteLength).toBe(item.length)
    expect(Array.from(createHash('sha256').update(bytes).digest())).toEqual(item.installerSha256)
    expect(new TextDecoder().decode(bytes)).toContain(
      'NOT AN INSTALLER. Synthetic text fixture only.',
    )
    expect(content.headers?.['Content-Disposition']).toContain(item.filename)
    expect(JSON.stringify(item)).not.toMatch(/secret|password|signature/)
  }
})
