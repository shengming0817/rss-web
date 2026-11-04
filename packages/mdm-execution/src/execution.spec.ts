import { expect, it, vi } from 'vitest'
import { createExecution, type Execution, type ExecutionDetail, type ExecutionPort } from './index'
const id = '11111111-1111-4111-8111-111111111111',
  registrationId = '22222222-2222-4222-8222-222222222222'
const item: Execution = {
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
