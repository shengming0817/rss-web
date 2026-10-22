export function utc(micros: number) {
  return new Date(micros / 1000).toISOString().replace('T', ' ').replace('Z', ' UTC')
}
export function quantity(value: number | boolean | string) {
  return typeof value === 'number'
    ? new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 }).format(value)
    : String(value)
}
