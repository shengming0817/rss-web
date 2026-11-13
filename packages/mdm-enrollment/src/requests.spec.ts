import { expect, it, vi } from 'vitest'
import { createRequestHistory, type RequestHistoryPort } from './requests'
const device = '11111111-1111-4111-8111-111111111111',
  id = '22222222-2222-4222-8222-222222222222'
it('binds original request reads to their device and preserves exact recovery identity', async () => {
  const windowsRecovery = vi.fn(async () => ({ attempt: id, fingerprint: 'a' })),
    port = {
      agent: async () => ({ id, device: id }),
      windowsRecovery,
    } as unknown as RequestHistoryPort
  const history = createRequestHistory(port)
  await expect(history.agent(device, id)).rejects.toThrow('device')
  const operation = { actor: 'original-actor', instance: 'original-instance', operationId: device }
  await history.windowsRecovery(device, id, operation)
  expect(windowsRecovery).toHaveBeenCalledWith(device, id, operation)
})

it('preserves bounded original directories and checks the selected Windows signing identity', async () => {
  const row = { device, attempt: id, signing: { attempt: id } },
    agent = { device, id }
  const port = {
    agents: async () => ({ items: [agent], nextCursor: 'opaque' }),
    agent: async () => agent,
    windows: async () => ({ items: [row], nextCursor: null }),
    windowsRequest: async () => row,
    windowsRecoveries: async () => ({ items: [], nextCursor: null }),
    windowsRecovery: async () => null,
  } as unknown as RequestHistoryPort
  const history = createRequestHistory(port)
  expect((await history.agents(device)).nextCursor).toBe('opaque')
  expect((await history.agent(device, id)).id).toBe(id)
  expect((await history.windows(device)).items[0]?.attempt).toBe(id)
  expect((await history.windowsRequest(device, id)).signing.attempt).toBe(id)
  expect((await history.windowsRecoveries(device, id)).items).toEqual([])
  expect(
    await history.windowsRecovery(device, id, {
      actor: 'original',
      instance: 'instance',
      operationId: device,
    }),
  ).toBeNull()
  await expect(history.windowsRequest(device, device)).rejects.toThrow('attempt')
})
