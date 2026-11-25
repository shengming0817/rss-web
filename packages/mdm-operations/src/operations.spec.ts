import { expect, it, vi } from 'vitest'
import { createOperations, type Execution, type CommandDetail, type OperationsPort } from './index'
const id = '11111111-1111-4111-8111-111111111111'
const item: Execution = {
  family: null,
  id,
  kind: 'command',
  device: 'device',
  origin: 'direct',
  policy: null,
  deadline: 100,
  status: 'applied',
}
const detail: CommandDetail = {
  kind: 'command',
  id,
  revision: 1,
  task: { name: 'sync', kind: 'sync_ml', platform: 'windows', objects: [] },
  target: { kind: 'device' },
  inputVersion: 'v1',
  dispatchFailure: null,
  device: 'device',
  owner: 'device',
  delivery: 'applied',
  observation: { protocol: 'syncml', effect: 'unknown' },
  deadline: 100,
  authorization: { state: 'authorized' },
}
function fixture(rows: readonly Execution[] = [item]) {
  const port: OperationsPort = {
    statistics: vi.fn(async () => ({ total: 0, commands: 0, actionRuns: 0, unknown: 0, asOf: 0 })),
    list: vi.fn(async () => ({ items: rows, nextCursor: null })),
    command: vi.fn(async () => detail),
    run: vi.fn(),
  }
  return { port, core: createOperations(port) }
}
it('keeps an applied command with unknown effect distinct and resolves detail by the exact directory identity', async () => {
  const f = fixture(),
    signal = new AbortController().signal,
    result = await f.core.detail({ kind: 'command', id }, signal)
  expect(result?.detail.kind === 'command' && result.detail.observation.effect).toBe('unknown')
  expect(f.port.command).toHaveBeenCalledWith('device', id, signal)
  expect(f.port.list).toHaveBeenCalledWith(
    { filter: `id=='${id}';kind=='command'`, limit: 2 },
    signal,
  )
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
