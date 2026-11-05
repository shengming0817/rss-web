import { expect, it, vi } from 'vitest'
import { createDeviceAccess, type Binding, type DeviceAccessPort } from './index'
const id = '11111111-1111-4111-8111-111111111111',
  operationId = '22222222-2222-4222-8222-222222222222'
const binding: Binding = {
  instance: id,
  principal: id,
  account: null,
  accountIntent: { kind: 'create', platform: 'windows', name: 'user' },
  disposition: 'keep',
  id,
  operationId,
  device: 'device',
  registration: id,
  registrationGeneration: 1,
  bindingGeneration: 2,
  factorGeneration: 3,
  revision: 4,
  serverState: 'active',
  policy: id,
  policyVersion: id,
  receivedRevision: 3,
  appliedRevision: 2,
  effect: 'unknown',
}
function fixture(value = binding) {
  const port: DeviceAccessPort = {
    beginBinding: vi.fn(),
    changeBinding: vi.fn(),
    enterpriseDetail: vi.fn(),
    beginEnterprise: vi.fn(),
    changeEnterprise: vi.fn(),
    platformSso: vi.fn(),
    bindings: vi.fn(async () => ({ items: [], nextCursor: null })),
    binding: vi.fn(async () => value),
    operation: vi.fn(async () => value),
    enterprise: vi.fn(async () => ({ items: [], nextCursor: null })),
  }
  return { core: createDeviceAccess(port), port }
}
it('reads an original snapshot without changing desired, received, applied or unknown effect', async () => {
  const f = fixture()
  expect(await f.core.operation('device', operationId)).toEqual(binding)
  expect(f.port.binding).not.toHaveBeenCalled()
})
it('rejects mismatched device, binding and original operation identities', async () => {
  await expect(fixture().core.operation('other', operationId)).rejects.toThrow(
    'Wrong binding operation',
  )
  await expect(fixture().core.operation('device', id)).rejects.toThrow('Wrong binding operation')
  await expect(fixture({ ...binding, id: operationId }).core.binding('device', id)).rejects.toThrow(
    'Wrong binding',
  )
})
it('binds a write receipt to its original intent, subject and next revision without replay', async () => {
  const f = fixture(),
    input = {
      operationId,
      expectedRevision: 3,
      action: {
        kind: 'put' as const,
        instance: id,
        principal: id,
        policy: id,
        account: { kind: 'create' as const, platform: 'windows' as const, name: 'user' },
      },
    }
  vi.mocked(f.port.changeBinding).mockResolvedValue(binding)
  expect(await f.core.changeBinding('device', id, input)).toEqual(binding)
  vi.mocked(f.port.changeBinding).mockResolvedValue({ ...binding, principal: operationId })
  await expect(f.core.changeBinding('device', id, input)).rejects.toThrow('subject')
  vi.mocked(f.port.changeBinding).mockResolvedValue({ ...binding, revision: 5 })
  await expect(f.core.changeBinding('device', id, input)).rejects.toThrow('receipt')
  vi.mocked(f.port.changeBinding).mockRejectedValue({ cause: 'transport' })
  await expect(f.core.changeBinding('device', id, input)).rejects.toEqual({ cause: 'transport' })
  expect(f.port.changeBinding).toHaveBeenCalledTimes(4)
})
