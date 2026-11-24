import { expect, it, vi } from 'vitest'
import { createDeviceControl, type ControlPort } from './control'
const id = '11111111-1111-4111-8111-111111111111',
  registrationId = '22222222-2222-4222-8222-222222222222'
function fixture() {
  const port: ControlPort = {
    original: vi.fn(),
    create: vi.fn(async (input) => ({ operationId: input.operationId, revision: 1 })),
    cancel: vi.fn(async (_device, id) => ({ operationId: id, revision: 2 })),
    reauthorize: vi.fn(),
  }
  return { port, core: createDeviceControl(port) }
}
it('requires exact dangerous confirmation and a six-digit ephemeral PIN without retaining it in the intent', async () => {
  const f = fixture(),
    intent = {
      device: 'device',
      operationId: id,
      deadline: 100,
      action: {
        kind: 'lock' as const,
        confirmed: true as const,
      },
    }
  await expect(f.core.create(intent, '１２３４５６')).rejects.toThrow('Six ASCII')
  expect(f.port.create).not.toHaveBeenCalled()
  await f.core.create(intent, '123456')
  expect(f.port.create).toHaveBeenCalledWith(intent, '123456')
  expect(JSON.stringify(intent)).not.toContain('123456')
})
it('keeps an explicit recovery request identity and CAS instead of creating another command', async () => {
  const f = fixture(),
    input = { requestId: registrationId, expectedRevision: 1 }
  await f.core.cancel('device', id, input)
  expect(f.port.cancel).toHaveBeenCalledWith('device', id, input)
  expect(f.port.create).not.toHaveBeenCalled()
})
