/** Calendar input is interpreted as UTC, never in the browser's local timezone. */
export function formatUtc(value: number | null): string {
  return value !== null && Number.isSafeInteger(value) && value >= 0 && value <= 253402300799
    ? new Date(value * 1000).toISOString().slice(0, 19)
    : ''
}
export function parseUtc(value: string): number | null {
  const normalized = value.length === 16 ? `${value}:00` : value
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(normalized)) return null
  const seconds = Date.parse(`${normalized}Z`) / 1000
  return formatUtc(seconds) === normalized ? seconds : null
}
