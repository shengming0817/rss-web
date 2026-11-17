import { expect, it, vi } from 'vitest'
import {
  createTenantAdministration,
  prepareUpdate,
  provisioningEntry,
  type TenantAdministrationPort,
  type Tenant,
  type Provisioning,
} from './index'
const tenantId = '11111111-1111-4111-8111-111111111111',
  operationId = '22222222-2222-4222-8222-222222222222'
const tenant: Tenant = {
  tenantId,
  name: 'Business',
  notes: null,
  management: false,
  revision: 4,
  deletable: true,
}
const progress: Provisioning = {
  tenantId,
  administratorId: null,
  phase: 'pending',
  blocked: null,
  entryPath: `/tenants/${tenantId}`,
}
it('opens precisely the same-origin configured tenant after its administrator exists', () => {
  expect(provisioningEntry(progress)).toBeNull()
  const waiting = { ...progress, administratorId: operationId }
  expect(provisioningEntry(waiting)).toBeNull()
  const complete = { ...waiting, phase: 'configured' as const }
  expect(provisioningEntry(complete)).toBe(progress.entryPath)
  expect(provisioningEntry({ ...complete, blocked: 'outcome_unknown' })).toBeNull()
  expect(() => provisioningEntry({ ...complete, entryPath: `/tenants/${operationId}` })).toThrow()
  expect(() => provisioningEntry({ ...complete, entryPath: 'https://elsewhere.test' })).toThrow()
})
it('uses full tenant detail revision, forbids management edits and deletion of used tenants', async () => {
  expect(() => prepareUpdate(operationId, { ...tenant, management: true }, 'New', null)).toThrow()
  const input = prepareUpdate(operationId, tenant, '新'.repeat(128), null)
  expect(input.expectedRevision).toBe(4)
  expect(() => prepareUpdate(operationId, tenant, 'x'.repeat(129), null)).toThrow()
  const remove = vi.fn()
  const client = createTenantAdministration({ remove } as unknown as TenantAdministrationPort)
  await expect(client.remove({ ...tenant, deletable: false }, operationId)).rejects.toThrow()
  expect(remove).not.toHaveBeenCalled()
})
it('submits provisioning exactly once per explicit call and keeps credentials out of its public intent', async () => {
  const provision = vi.fn(async () => {
    throw new Error('Lost response')
  })
  const client = createTenantAdministration({ provision } as unknown as TenantAdministrationPort)
  const intent = { operationId, name: 'New', administratorLogin: 'admin' }
  await expect(client.provision(intent, 'disposable secret')).rejects.toThrow('Lost response')
  expect(provision).toHaveBeenCalledTimes(1)
  expect(intent).toEqual({ operationId, name: 'New', administratorLogin: 'admin' })
  await expect(client.provision(intent, 'disposable secret')).rejects.toThrow()
  expect(provision).toHaveBeenCalledTimes(2)
  expect(provision.mock.calls[0]).toEqual(provision.mock.calls[1])
})
it('rejects historical or foreign receipts instead of claiming current operation success', async () => {
  const update = vi.fn(async () => ({
    operationId,
    action: 'update',
    result: { ...tenant, revision: 4 },
  }))
  const client = createTenantAdministration({ update } as unknown as TenantAdministrationPort)
  await expect(client.update(prepareUpdate(operationId, tenant, 'New', null))).rejects.toThrow(
    'revision',
  )
})
