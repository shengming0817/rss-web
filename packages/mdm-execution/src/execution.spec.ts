import { expect, it, vi } from 'vitest'
import { createExecution, type Execution, type ExecutionDetail, type ExecutionPort } from './index'
const id = '11111111-1111-4111-8111-111111111111',
  registrationId = '22222222-2222-4222-8222-222222222222'
const item: Execution = {
  family: null,
  id,
  kind: 'command',
  device: 'device',
  registrationId,
  generation: 2,
  origin: 'direct',
  policy: null,
  deadline: 100,
  status: 'applied',
}
const detail: ExecutionDetail = {
  id,
  revision: 1,
  reauthorization: null,
  taskName: null,
  dispatchFailure: null,
  device: 'device',
  registrationId: null,
  generation: null,
  owner: 'device',
  delivery: 'applied',
  execution: null,
  effect: 'unknown',
  cancellation: null,
  attempt: null,
  deadline: 100,
  authorization: 'authorized',
}
function fixture(rows: readonly Execution[] = [item]) {
  const port: ExecutionPort = {
    create: vi.fn(async (input) => ({ operationId: input.operationId, revision: 1 })),
    cancel: vi.fn(async (_device, id) => ({ operationId: id, revision: 2 })),
    reauthorize: vi.fn(async (_device, id) => ({ operationId: id, revision: 2 })),
    statistics: vi.fn(async () => ({ total: 0, commands: 0, actionRuns: 0, unknown: 0, asOf: 0 })),
    trust: vi.fn(),
    changeTrust: vi.fn(),
    trustOperation: vi.fn(),
    trustObservation: vi.fn(),
    list: vi.fn(async () => ({ items: rows, nextCursor: null })),
    command: vi.fn(async () => detail),
    run: vi.fn(async () => detail),
  }
  return { port, core: createExecution(port) }
}
it('keeps an applied command with unknown effect distinct and resolves detail by the exact directory identity', async () => {
  const f = fixture(),
    result = await f.core.detail({ kind: 'command', id })
  expect(result?.detail.effect).toBe('unknown')
  expect(f.port.command).toHaveBeenCalledWith('device', id)
  expect(f.port.list).toHaveBeenCalledWith({ filter: `id=='${id}';kind=='command'`, limit: 2 })
})
it('rejects wrong targets, ambiguous identities and malformed IDs before detail transport', async () => {
  const f = fixture([{ ...item, device: 'another' }])
  await expect(f.core.detail({ kind: 'command', id })).rejects.toThrow('target changed')
  const duplicate = fixture([item, item])
  await expect(duplicate.core.detail({ kind: 'command', id })).rejects.toThrow('Ambiguous')
  const invalid = fixture()
  await expect(invalid.core.detail({ kind: 'command', id: 'bad' })).rejects.toThrow()
  expect(invalid.port.list).not.toHaveBeenCalled()
})
it('returns not found without inventing an execution result', async () => {
  const f = fixture([])
  expect(await f.core.detail({ kind: 'command', id })).toBeNull()
  expect(f.port.command).not.toHaveBeenCalled()
})

it('requires exact dangerous confirmation and a six-digit ephemeral PIN without retaining it in the intent', async () => {
  const f = fixture(),
    intent = {
      device: 'device',
      operationId: id,
      deadline: 100,
      action: {
        kind: 'lock' as const,
        confirmed: true as const,
        expectedRegistrationId: registrationId,
        expectedGeneration: 2,
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
