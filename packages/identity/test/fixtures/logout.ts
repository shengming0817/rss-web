import type { LogoutAllResponse, LogoutResponse } from '../../src/api/types'

export const logoutResponseFixture = {
  data: { loggedOut: true },
} satisfies LogoutResponse
export const logoutAllResponseFixture = {
  data: { loggedOut: false },
} satisfies LogoutAllResponse
