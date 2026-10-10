import { expect, it } from 'vitest'
import { decodeDirectory } from './directory'
import { decodeBatch } from './candidate-operations'
const tenant = '11111111-1111-4111-8111-111111111111'
const snapshot = '22222222-2222-4222-8222-222222222222'
const metadata = { contract: 'devices-v1', tenantId: tenant, source: 'mock' }
it('decodes only the formal endpoint directory', () => {
  const response = {
    items: [
      {
        id: 'pending',
        inventoryAvailable: false,
        status: 'pending',
        primaryMdmRegistration: null,
        channels: [],
        enrollments: [],
      },
    ],
    statistics: { total: 1, pending: 1, active: 0, revoked: 0 },
    asOf: 0,
    nextCursor: null,
  }
  expect(decodeDirectory(response).items[0]?.inventoryAvailable).toBe(false)
  expect(() => decodeDirectory({ ...response, ...metadata })).toThrow()
  expect(() =>
    decodeDirectory({ ...response, items: [{ ...response.items[0], name: 'legacy' }] }),
  ).toThrow()
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
