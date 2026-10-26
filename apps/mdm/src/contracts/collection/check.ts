import { jsonValue } from '../../services/json'

/** Generated schema owns shape; the Web boundary also rejects lossy JS numeric values. */
export function checked<T>(validate: (value: unknown) => value is T, value: unknown): T {
  const json = jsonValue(value, 8 * 1024 * 1024)
  function precision(value: unknown): void {
    if (
      typeof value === 'number' &&
      (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
    )
      throw new Error('This number cannot be represented exactly by the Web client')
    if (value && typeof value === 'object') Object.values(value).forEach(precision)
  }
  precision(json)
  if (!validate(json)) throw new Error('Unsupported collection contract')
  return json
}
