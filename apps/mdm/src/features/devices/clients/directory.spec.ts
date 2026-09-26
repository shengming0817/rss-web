import { expect, it } from 'vitest'
import { decodeDirectory, decodeBatch } from './directory'
const tenant = '11111111-1111-4111-8111-111111111111'
const snapshot = '22222222-2222-4222-8222-222222222222'
const metadata = { contract: 'devices-v1', tenantId: tenant, source: 'mock' }
it('keeps pending devices visible without an inventory identity and denies mock in production', () => {
  const response = {
    ...metadata,
    snapshot,
    items: [
      {
        id: 'pending',
        name: 'Pending Mac',
        platform: 'macos',
        status: 'pending',
        inventoryAvailable: false,
        revision: 1,
        channels: [],
        owner: null,
        department: null,
      },
    ],
    nextCursor: null,
    statistics: { total: 1, pending: 1, windows: 0, macos: 1, withInventory: 0 },
  }
  expect(decodeDirectory(response, tenant, true).items[0]?.inventoryAvailable).toBe(false)
  expect(() => decodeDirectory(response, tenant, false)).toThrow()
  expect(() => decodeDirectory({ ...response, tenantId: snapshot }, tenant, true)).toThrow()
})
it('keeps offline and stale-generation blocks separate from accepted execution facts', () => {
  const response = {
    ...metadata,
    id: snapshot,
    revision: 1,
    action: 'wipe',
    phase: 'preview',
    targets: [
      {
        device: 'd1',
        deviceRevision: 1,
        registration: snapshot,
        generation: 2,
        blocked: 'stale_generation',
        execution: null,
        dispatch: 'not_requested',
        receipt: 'none',
        effect: 'unknown',
        compliance: 'unknown',
      },
    ],
  }
  expect(decodeBatch(response, tenant, true).targets[0]?.blocked).toBe('stale_generation')
  expect(() => decodeBatch({ ...response, phase: 'wiped' }, tenant, true)).toThrow()
})
