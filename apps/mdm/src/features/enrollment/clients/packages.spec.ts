import { expect, it } from 'vitest'
import { installer } from './packages'
const tenant = '11111111-1111-4111-8111-111111111111'
const item = {
  releaseId: tenant,
  tenantId: tenant,
  channel: 'production',
  target: { platform: 'windows', architecture: 'x86_64' },
  version: '1.0.0',
  filename: 'rss-agent.exe',
  length: 42,
  installerSha256: Array(32).fill(0),
  candidateSha256: Array(32).fill(0),
  origin: 'https://agent.example.test',
  signingKeys: { test: 'A'.repeat(43) },
}
it('accepts published installer metadata and rejects tenant, file and wire mismatches', () => {
  expect(installer(item, tenant).filename).toBe('rss-agent.exe')
  for (const delta of [
    { tenantId: '22222222-2222-4222-8222-222222222222' },
    { filename: '../secret.exe' },
    { filename: 'rss-agent.pkg' },
    { target: { platform: 'windows', architecture: 'auto' } },
    { origin: 'https://agent.example.test/' },
    { length: 0 },
    { secret: 'unexpected' },
  ])
    expect(() => installer({ ...item, ...delta }, tenant)).toThrow()
})
