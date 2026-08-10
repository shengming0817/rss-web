const CONTRACT_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/

export function isExactRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false

  const keys = Reflect.ownKeys(value)
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys])
  return (
    requiredKeys.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => typeof key === 'string' && allowedKeys.has(key))
  )
}

function validPermission(value: unknown): value is string {
  const hasUnsafeCharacter =
    typeof value === 'string' &&
    Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return character === '*' || /\s/u.test(character) || codePoint <= 31 || codePoint === 127
    })

  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value === value.trim() &&
    !hasUnsafeCharacter
  )
}

export function authorizationIntentKey(intent: unknown): string | undefined {
  if (
    !isExactRecord(intent, ['contractId', 'permission'], ['resourceId']) ||
    typeof intent.contractId !== 'string' ||
    !CONTRACT_ID.test(intent.contractId) ||
    !validPermission(intent.permission) ||
    (intent.resourceId !== undefined &&
      (typeof intent.resourceId !== 'string' ||
        intent.resourceId.length === 0 ||
        intent.resourceId !== intent.resourceId.trim()))
  ) {
    return undefined
  }
  return JSON.stringify([
    intent.contractId,
    intent.permission,
    typeof intent.resourceId === 'string' ? intent.resourceId : null,
  ])
}
