import { expect, it, vi } from 'vitest'
import { createTaskTrust } from './index'
it('keeps the original change identity and checks the accepted revision', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const trust = { serviceId: id, tenant: id, revision: 2, keys: [] }
  const port = {
    trust: vi.fn(),
    changeTrust: vi.fn().mockResolvedValue(trust),
    trustOperation: vi.fn().mockResolvedValue(trust),
    trustObservation: vi.fn(),
  }
  const client = createTaskTrust(port)
  await expect(client.changeTrust(id, { action: 'prepare', expectedRevision: 0 })).rejects.toThrow(
    'revision',
  )
  expect(await client.trustOperation(id)).toEqual(trust)
  expect(port.trustOperation).toHaveBeenCalledWith(id)
  const observation = {
    device: id,
    state: 'applied',
    reason: null,
    targetRevision: 2,
    actualRevision: 2,
    receivedAt: 42,
  }
  port.trustObservation.mockResolvedValue(observation)
  await expect(client.trustObservation(id)).resolves.toEqual(observation)
  await expect(client.trustObservation('22222222-2222-4222-8222-222222222222')).rejects.toThrow(
    'observation device',
  )
})
