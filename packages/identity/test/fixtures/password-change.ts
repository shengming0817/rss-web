import type { PasswordChangeRequest, PasswordChangeResponse } from '../../src/api/types'

export const passwordChangeRequestFixture = {
  currentPassword: 'current-password-fixture',
  newPassword: 'replacement-password-fixture',
} satisfies PasswordChangeRequest

export const passwordChangeResponseFixture = {
  data: { changed: true },
} satisfies PasswordChangeResponse
