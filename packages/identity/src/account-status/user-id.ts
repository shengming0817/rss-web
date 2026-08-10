export const ACCOUNT_STATUS_USER_ID_PATTERN =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

const USER_ID = new RegExp(`^${ACCOUNT_STATUS_USER_ID_PATTERN}$`)
const NIL_USER_ID = '00000000-0000-0000-0000-000000000000'

export function isAccountStatusUserId(value: string): boolean {
  return USER_ID.test(value) && value !== NIL_USER_ID
}
