import { expect, it } from 'vitest'
import { installer } from './packages'
const tenant = '11111111-1111-4111-8111-111111111111'
const item = {
  releaseId: tenant,
  tenantId: tenant,
  target: { platform: 'windows', architecture: 'x86_64' },
  version: '1.0.0',
  format: 'windows_exe',
  filename: 'rss-agent.exe',
  length: 42,
  installerSha256: Array(32).fill(0),
}
it('accepts published installer metadata and rejects tenant, file and wire mismatches', () => {
  expect(installer(item, tenant).filename).toBe('rss-agent.exe')
  for (const delta of [
    { tenantId: '22222222-2222-4222-8222-222222222222' },
    { filename: '../secret.exe' },
    { format: 'macos_pkg', filename: 'rss-agent.pkg' },
    { target: { platform: 'windows', architecture: 'auto' } },
    { origin: 'https://agent.example.test/' },
    { length: 0 },
    { format: 'nsis_exe' },
    { secret: 'unexpected' },
  ])
    expect(() => installer({ ...item, ...delta }, tenant)).toThrow()
})
it('distinguishes MSI and MSIX and rejects the retired metadata shape', () => {
  for (const [format, suffix] of [
    ['windows_msi', 'msi'],
    ['windows_msix', 'msix'],
  ] as const) {
    expect(installer({ ...item, format, filename: `rss-agent.${suffix}` }, tenant).format).toBe(
      format,
    )
    expect(() => installer({ ...item, format, filename: 'rss-agent.exe' }, tenant)).toThrow()
  }
  const old = { ...item } as Record<string, unknown>
  delete old['format']
  expect(() => installer(old, tenant)).toThrow()
})
it('rejects the previous package contract instead of decoding both formats', () => {
  expect(() =>
    installer(
      {
        ...item,
        candidateSha256: Array(32).fill(0),
        origin: 'https://old.example',
        signingKeys: {},
      },
      tenant,
    ),
  ).toThrow()
})
