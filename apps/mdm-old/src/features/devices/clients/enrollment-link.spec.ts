import { expect, it } from 'vitest'
import { windowsEnrollmentLink } from './enrollment'
it('hands the exact server-issued UPN and HTTPS server origin to full Windows MDM', () => {
  const username = '11111111-1111-4111-8111-111111111111@mdm.example.test'
  const link = windowsEnrollmentLink({
    platform: 'windows',
    windowsProfile: 'Full',
    username,
    server: 'https://mdm.example.test',
    discoveryUrl: 'https://mdm.example.test/EnrollmentServer/Discovery.svc',
  })!
  const query = new URLSearchParams(link.split('?')[1])
  expect(link.startsWith('ms-device-enrollment:?')).toBe(true)
  expect(Object.fromEntries(query)).toEqual({
    mode: 'mdm',
    username,
    servername: 'https://mdm.example.test',
  })
})
it('keeps other native protocols and existing device-only registrations out of the Full handoff', () => {
  for (const value of [
    { platform: 'windows', windowsProfile: 'Device' },
    { platform: 'windows_entra', windowsProfile: 'Full' },
    { platform: 'macos' },
  ])
    expect(windowsEnrollmentLink(value)).toBeUndefined()
})
it('rejects a credential-bearing or untrusted server locator', () => {
  for (const server of [
    'http://mdm.example.test/discovery',
    'https://user:secret@mdm.example.test/discovery',
    'https://mdm.example.test/discovery?secret=value',
  ]) {
    expect(() =>
      windowsEnrollmentLink({
        platform: 'windows',
        windowsProfile: 'Full',
        username: 'request@mdm.example.test',
        server,
      }),
    ).toThrow('Invalid native URL')
  }
})
