export const ROLE_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/
declare const roleIdBrand: unique symbol
export type RoleId = string & { readonly [roleIdBrand]: true }

export function parseRoleId(value: unknown): RoleId | undefined {
  if (
    typeof value !== 'string' ||
    !ROLE_ID_PATTERN.test(value) ||
    new TextEncoder().encode(value).length > 128
  ) {
    return undefined
  }
  return value as RoleId
}

export function isRoleId(value: string): value is RoleId {
  return parseRoleId(value) !== undefined
}
