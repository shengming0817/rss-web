type Invalid = () => never

export function exactRecord(
  value: unknown,
  required: readonly string[],
  invalid: Invalid,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid()
  const input = value as Record<string, unknown>
  if (
    required.some((key) => !Object.hasOwn(input, key)) ||
    Reflect.ownKeys(input).some((key) => typeof key !== 'string' || !required.includes(key))
  )
    invalid()
  return input
}

export function text(value: unknown, invalid: Invalid): string {
  if (typeof value !== 'string') invalid()
  return value
}

export function nonEmptyText(value: unknown, invalid: Invalid): string {
  const result = text(value, invalid)
  if (result.length === 0) invalid()
  return result
}

export function positiveSafeInteger(value: unknown, invalid: Invalid): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) invalid()
  return value as number
}
