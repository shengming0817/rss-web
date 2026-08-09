import type { ProfileResponse } from '../../src/api/types'

export const profileResponseFixture = {
  data: { subject: 'fixture-subject', tenantId: 'fixture-tenant', kind: 'user' },
} satisfies ProfileResponse
