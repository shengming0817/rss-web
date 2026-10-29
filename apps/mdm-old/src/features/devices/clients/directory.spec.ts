import { expect, it } from 'vitest'
import { decodeDirectory } from './directory'
const tenant = '11111111-1111-4111-8111-111111111111'
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
    nextCursor: null,
  }
  expect(decodeDirectory(response).items[0]?.inventoryAvailable).toBe(false)
  expect(() => decodeDirectory({ ...response, ...metadata })).toThrow()
  expect(() =>
    decodeDirectory({ ...response, items: [{ ...response.items[0], name: 'legacy' }] }),
  ).toThrow()
})
