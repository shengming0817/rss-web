/** Timeline and runtime observation timestamps are Unix seconds; telemetry uses microseconds. */
export function auditTime(seconds: number) {
  const date = new Date(seconds * 1000)
  return Number.isNaN(date.getTime())
    ? String(seconds)
    : date.toISOString().replace('T', ' ').replace('.000Z', ' UTC')
}

/** Known audit results have product labels; unfamiliar safe metadata retains its source value. */
export function auditOutcome(value: string, translate: (key: string) => string) {
  return ['succeeded', 'denied', 'failed', 'unknown'].includes(value)
    ? translate(`operations.auditUi.${value}`)
    : value
}
