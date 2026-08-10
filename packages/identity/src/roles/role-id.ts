export const ROLE_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/

export function isRoleId(value: string): boolean {
  return ROLE_ID_PATTERN.test(value) && new TextEncoder().encode(value).length <= 128
}
