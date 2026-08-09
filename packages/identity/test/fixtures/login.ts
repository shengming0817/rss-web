import type { LoginRequest, LoginResponse } from '../../src/api/types'

export const loginRequestFixture = {
  username: 'fixture-user',
  password: 'fixture-password',
} satisfies LoginRequest

export const loginResponseFixture = {
  data: {
    sessionId: 'fixture-session',
    expiresAt: 2_000_000_000,
    accessToken: 'fixture-access-token',
    refreshToken: 'fixture-refresh-token',
    accessExpiresAt: 1_900_000_000,
  },
} satisfies LoginResponse
