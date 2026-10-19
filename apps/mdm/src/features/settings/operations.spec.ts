import { expect, it } from 'vitest'
import { shallowRef } from 'vue'
import type { IdentitySession } from '@rss/auth'
import { decodeMdmError } from '@rss/api/mdm'
import { createSettingsOperations } from './operations'
function fixture() {
  const state = shallowRef({
    status: 'authenticated',
    tenant: 'tenant-a',
    identity: { principalId: 'principal-a' },
    session: { id: 'session-a' },
  })
  const owner = { state } as unknown as IdentitySession
  return { state, store: createSettingsOperations(owner) }
}
it('locks unknown writes, queries before explicit replay and preserves the exact original operation', async () => {
  const { store } = fixture(),
    ids: string[] = []
  await expect(
    store.submit('smtp', 'save', 7, '{"profile":"mail-a"}', async (id) => {
      ids.push(id)
      throw decodeMdmError(503, { code: 'operation_unknown' })
    }),
  ).rejects.toBeDefined()
  expect(store.records.get('smtp')).toMatchObject({
    state: 'unknown',
    expectedRevision: 7,
    queried: false,
  })
  await expect(store.submit('smtp', 'save', 8, '{}', async () => null)).rejects.toThrow(
    'resolution',
  )
  await expect(
    store.submit('smtp', 'save', 7, '{"profile":"mail-a"}', async () => null, true),
  ).rejects.toThrow('original input')
  store.queried('smtp', ids[0]!)
  await expect(
    store.submit('smtp', 'save', 7, '{"profile":"mail-b"}', async () => null, true),
  ).rejects.toThrow('original input')
  await store.submit(
    'smtp',
    'save',
    7,
    '{"profile":"mail-a"}',
    async (id) => {
      ids.push(id)
      return 'receipt'
    },
    true,
  )
  expect(ids[1]).toBe(ids[0])
  expect(store.records.get('smtp')?.state).toBe('received')
  store.dispose()
})
it('never resolves an unknown write through an unrelated receipt or a new revision conflict', async () => {
  const { store } = fixture()
  await expect(
    store.submit('apns', 'key', 2, '{}', async () => {
      throw new Error('transport lost')
    }),
  ).rejects.toThrow()
  const id = store.records.get('apns')!.id
  store.confirm('apns', 'wrong')
  store.resolveConflict('apns')
  expect(store.records.get('apns')?.state).toBe('unknown')
  store.queried('apns', id)
  await expect(
    store.submit(
      'apns',
      'key',
      2,
      '{}',
      async () => {
        throw decodeMdmError(409, { code: 'operation_conflict' })
      },
      true,
    ),
  ).rejects.toBeDefined()
  expect(store.records.get('apns')?.state).toBe('unknown')
  store.confirm('apns', id)
  expect(store.records.get('apns')?.state).toBe('received')
  store.dispose()
})
it('requires an explicit conflict comparison and discards known rejected requests', async () => {
  const { store } = fixture()
  await expect(
    store.submit('storage', 'save', 1, '{}', async () => {
      throw decodeMdmError(409, { code: 'operation_conflict' })
    }),
  ).rejects.toBeDefined()
  expect(store.records.get('storage')?.state).toBe('conflict')
  store.resolveConflict('storage')
  expect(store.records.size).toBe(0)
  await expect(
    store.submit('storage', 'save', 1, '{}', async () => {
      throw decodeMdmError(403, { code: 'permission_denied' })
    }),
  ).rejects.toBeDefined()
  expect(store.records.size).toBe(0)
  store.dispose()
})
it('fences a late write on principal, tenant and session changes and retains no request closure', async () => {
  const { state, store } = fixture()
  let resolve!: (v: string) => void
  const pending = store.submit(
    'task',
    'prepare',
    0,
    '{"origin":"https://mdm.test"}',
    () => new Promise<string>((r) => (resolve = r)),
  )
  expect(Object.keys(store.records.get('task')!).sort()).toEqual([
    'action',
    'expectedRevision',
    'id',
    'publicInput',
    'queried',
    'state',
    'target',
  ])
  await expect(store.submit('task', 'prepare', 0, '{}', async () => null)).rejects.toThrow(
    'resolution',
  )
  state.value = { ...state.value, session: { id: 'session-b' } }
  expect(store.records.size).toBe(0)
  resolve('late')
  await expect(pending).rejects.toThrow('Stale')
  state.value = { ...state.value, status: 'anonymous' }
  await expect(store.submit('task', 'prepare', 0, '{}', async () => null)).rejects.toThrow(
    'resolution',
  )
  store.dispose()
})
