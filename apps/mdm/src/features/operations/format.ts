/** Timeline and runtime observation timestamps are Unix seconds; telemetry uses microseconds. */
export function auditTime(seconds: number) {
  const date = new Date(seconds * 1000)
  return Number.isNaN(date.getTime())
    ? String(seconds)
    : date.toISOString().replace('T', ' ').replace('.000Z', ' UTC')
}
