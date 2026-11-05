import { expect, it, vi } from 'vitest'
import { createTenantSetup, intent, sameIntent } from './index'
import type { Intent, Progress, SetupPort } from './model'
const tenant = '11111111-1111-4111-8111-111111111111',
  operation = '22222222-2222-4222-8222-222222222222'
const selection: Intent = {
  channels: ['windows_mdm'],
  capabilities: { smtp: { kind: 'skip', reason: 'No mail needed' } },
  completionRequested: false,
}
function fixture() {
  const progress: Progress = {
    tenantId: tenant,
    saved: { revision: 0, intent: selection },
    steps: [],
    canComplete: false,
    complete: false,
  }
  const port: SetupPort = {
    read: vi.fn(async () => progress),
    catalog: vi.fn(async () => ({ items: [], domains: [] })),
    update: vi.fn(async (command) => ({
      operationId: command.operationId,
      saved: { revision: command.expectedRevision + 1, intent: command.intent },
    })),
    operation: vi.fn(async (id) => ({
      operationId: id,
      saved: { revision: 1, intent: selection },
    })),
  }
  return { port, progress, setup: createTenantSetup(port, tenant) }
}
it('rejects ambiguous choices, implicit skipping, channel mismatches and byte/control budgets', () => {
  expect(() => intent({ ...selection, channels: ['windows_mdm', 'windows_mdm'] })).toThrow()
  expect(() =>
    intent({ ...selection, capabilities: { task_signing: { kind: 'configure' } } }),
  ).toThrow()
  for (const reason of ['', ' ', 'a\nb', '字'.repeat(400)])
    expect(() =>
      intent({ ...selection, capabilities: { smtp: { kind: 'skip', reason } } }),
    ).toThrow()
  expect(() =>
    intent({ ...selection, capabilities: { unknown: { kind: 'configure' } } } as Intent),
  ).toThrow()
  expect(
    sameIntent(selection, {
      ...selection,
      capabilities: { smtp: { kind: 'skip', reason: 'No mail needed' } },
    }),
  ).toBe(true)
})
it('freezes an exact original request, forbids a second UUID, and never automatically replays after unknown', async () => {
  const f = fixture(),
    listener = vi.fn(),
    unsubscribe = f.setup.subscribe(listener)
  const draft = { ...selection, channels: [...selection.channels] }
  const command = f.setup.prepare(operation, 0, draft)
  draft.channels.push('agent')
  expect(command.intent.channels).toEqual(['windows_mdm'])
  vi.mocked(f.port.update).mockRejectedValueOnce({ status: 503, code: 'outcome_unknown' })
  await expect(f.setup.submit(command)).rejects.toMatchObject({ code: 'outcome_unknown' })
  expect(f.setup.getSnapshot()).toBe(command)
  expect(() => f.setup.prepare(tenant, 0, selection)).toThrow()
  expect(f.port.update).toHaveBeenCalledTimes(1)
  const receipt = await f.setup.operation(operation)
  expect(receipt.saved.revision).toBe(1)
  expect(f.setup.getSnapshot()).toBeNull()
  expect(f.port.update).toHaveBeenCalledTimes(1)
  expect(listener).toHaveBeenCalledTimes(2)
  unsubscribe()
})
it('keeps a pending request when an original receipt mismatches revision or intent', async () => {
  const f = fixture(),
    command = f.setup.prepare(operation, 0, selection)
  vi.mocked(f.port.operation).mockResolvedValueOnce({
    operationId: operation,
    saved: { revision: 2, intent: selection },
  })
  await expect(f.setup.operation(operation)).rejects.toThrow()
  expect(f.setup.getSnapshot()).toBe(command)
  vi.mocked(f.port.update).mockResolvedValueOnce({
    operationId: operation,
    saved: { revision: 1, intent: { ...selection, completionRequested: true } },
  })
  await expect(f.setup.submit(command)).rejects.toThrow()
  expect(f.setup.getSnapshot()).toBe(command)
})
it('reads current tenant authority without deriving completion from the saved request', async () => {
  const f = fixture()
  vi.mocked(f.port.read).mockResolvedValueOnce({
    ...f.progress,
    saved: { revision: 3, intent: { ...selection, completionRequested: true } },
  })
  const value = await f.setup.read()
  expect(value.complete).toBe(false)
  expect(value.canComplete).toBe(false)
  vi.mocked(f.port.read).mockResolvedValueOnce({ ...f.progress, tenantId: operation })
  await expect(f.setup.read()).rejects.toThrow('Wrong setup tenant')
})
it('allows an explicit original resubmit and an explicit known rejection reset', async () => {
  const f = fixture(),
    command = f.setup.prepare(operation, 0, selection)
  expect((await f.setup.submit(command)).saved.revision).toBe(1)
  expect(f.setup.getSnapshot()).toBeNull()
  const second = f.setup.prepare(operation, 1, selection)
  f.setup.rejected(second)
  expect(f.setup.getSnapshot()).toBeNull()
  await expect(f.setup.submit(command)).rejects.toThrow()
})
it('queries a durable receipt after reload without manufacturing a new request', async () => {
  const f = fixture()
  expect((await f.setup.operation(operation)).operationId).toBe(operation)
  expect(f.port.update).not.toHaveBeenCalled()
  vi.mocked(f.port.operation).mockResolvedValueOnce({
    operationId: tenant,
    saved: { revision: 1, intent: selection },
  })
  await expect(f.setup.operation(operation)).rejects.toThrow()
})

it('rejects a revision whose successor cannot be represented exactly', () => {
  expect(() => fixture().setup.prepare(operation, Number.MAX_SAFE_INTEGER, selection)).toThrow()
})
