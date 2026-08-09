import type { RefreshRequest, RefreshResponse } from '../../src/api/types'

export const refreshRequestFixture = {
  refreshToken: 'fixture-old-refresh-token',
} satisfies RefreshRequest

export const refreshResponseFixture = {
  data: {
    accessToken: 'fixture-next-access-token',
    refreshToken: 'fixture-next-refresh-token',
    accessExpiresAt: 1_900_000_001,
  },
} satisfies RefreshResponse
