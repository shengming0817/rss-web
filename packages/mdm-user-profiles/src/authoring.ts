import type { DefinitionValue, ProfileSource } from './model'
const reserved = new Set([
  'principalId',
  'tenantId',
  'instanceId',
  'sessionId',
  'authentication',
  'authTime',
  'issuedAt',
  'groups',
  'department',
  'displayName',
  'username',
  'email',
  'emailVerified',
  'extensions',
])
export function uuid(value: string): string {
  if (
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value) ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)
  )
    throw new Error('Invalid identifier')
  return value
}
export function validateSource(source: ProfileSource): void {
  if (source.kind === 'idp') uuid(source.provider)
}
function integer(value: number | null, maximum: number): void {
  if (value !== null && (!Number.isSafeInteger(value) || value < 1 || value > maximum))
    throw new Error('Invalid field limit')
}
/** Draft constraints mirror the business authoring rules, not the wire decoder. */
export function validateDefinition(value: DefinitionValue): void {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value.key) || reserved.has(value.key))
    throw new Error('Invalid field key')
  if (
    !value.displayName ||
    new TextEncoder().encode(value.displayName).length > 256 ||
    /\p{Cc}/u.test(value.displayName)
  )
    throw new Error('Invalid field label')
  validateSource(value.source)
  if (
    !(value.pointer === '' || value.pointer.startsWith('/')) ||
    new TextEncoder().encode(value.pointer).length > 1024 ||
    /\p{Cc}/u.test(value.pointer) ||
    /~(?![01])/.test(value.pointer)
  )
    throw new Error('Invalid JSON pointer')
  integer(value.maxLength, 65536)
  integer(value.maxItems, value.valueType === 'array' ? 128 : 256)
  if (value.maxLength !== null && value.valueType !== 'string')
    throw new Error('Length only applies to strings')
  if (value.maxItems !== null && !['array', 'object'].includes(value.valueType))
    throw new Error('Item limit requires a collection')
  for (const n of [value.minimum, value.maximum])
    if (
      n !== null &&
      (!['number', 'integer'].includes(value.valueType) ||
        !Number.isFinite(n) ||
        (Number.isInteger(n) && !Number.isSafeInteger(n)))
    )
      throw new Error('Invalid numeric constraint')
  if (value.minimum !== null && value.maximum !== null && value.minimum > value.maximum)
    throw new Error('Invalid numeric range')
}
