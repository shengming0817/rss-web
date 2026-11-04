import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createDeviceAccess } from '@rss/mdm-device-access'
import { createDeviceAccessAdapter } from './device-access'
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222'
const binding = {
  id,
  operationId: id,
  registration: other,
  registrationGeneration: 2,
  accountDisposition: 'keep',
  accountIntent: { kind: 'create', platform: 'windows', name: 'rss' },
  createdByRss: true,
  policy: id,
  policyVersion: other,
  desired: {
    enabled: true,
    selfEnrollment: true,
    role: null,
    mac: null,
    windows: { kind: 'rss_factor', accounts: ['local'] },
  },
  device: 'pc',
  revision: 2,
  principal: id,
  instance: other,
  bindingGeneration: 1,
  factorGeneration: 2,
  account: { platform: 'windows', sid: 'S-1-5-21-1', authority: { kind: 'local' } },
  receivedRevision: 2,
  appliedRevision: 1,
  serverState: 'active',
  effect: null,
}
function fixture(reply: unknown) {
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply))
  return {
    request,
    core: createDeviceAccess(createDeviceAccessAdapter({ request } as unknown as HttpTransport)),
  }
}
it('keeps desired, received, applied and missing effect separate in an original receipt', async () => {
  expect(await fixture(binding).core.operation('pc', id)).toMatchObject({
    revision: 2,
    receivedRevision: 2,
    appliedRevision: 1,
    effect: null,
  })
  await expect(fixture(binding).core.operation('pc', other)).rejects.toThrow(
    'Wrong binding operation',
  )
  await expect(fixture(binding).core.binding('other', id)).rejects.toThrow('Wrong device')
})
it('validates enterprise composite identity rather than trusting display names or projected omissions', async () => {
  const value = {
    id: 'app',
    revision: 2,
    enabled: false,
    callback: 'https://app.example.test/callback',
    targetFingerprint: 'fixed',
    capabilities: ['native_key'],
  }
  expect(
    (
      await fixture({
        items: [{ id: 'rp:app', kind: 'relying_party', value }],
        nextCursor: null,
      }).core.enterprise()
    ).items[0],
  ).toMatchObject({ enabled: false, revision: 2 })
  await expect(
    fixture({
      items: [{ id: 'rp:another', kind: 'relying_party', value }],
      nextCursor: null,
    }).core.enterprise(),
  ).rejects.toThrow('Wrong relying')
  await expect(
    fixture({ items: [{ id: 'rp:app' }], nextCursor: null }).core.enterprise(),
  ).rejects.toThrow()
})
