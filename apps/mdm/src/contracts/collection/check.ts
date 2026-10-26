/** Validate the actual JSON wire document, not a presentation extension's nesting budget. */
export function checked<T>(validate: (value: unknown) => value is T, value: unknown): T {
  const encoded = JSON.stringify(value, (_key, item: unknown) => {
    if (
      typeof item === 'number' &&
      (!Number.isFinite(item) || (Number.isInteger(item) && !Number.isSafeInteger(item)))
    )
      throw new Error('This number cannot be represented exactly by the Web client')
    return item
  })
  if (encoded === undefined || new TextEncoder().encode(encoded).byteLength > 8 * 1024 * 1024)
    throw new Error('Invalid collection document budget')
  const json: unknown = JSON.parse(encoded)
  if (!validate(json)) throw new Error('Unsupported collection contract')
  return json
}
