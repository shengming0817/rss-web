export function boundedTimeout(deadlineMs, requestedMs, nowMs = Date.now()) {
  const remaining = deadlineMs - nowMs
  if (remaining <= 0) return 0
  return Math.min(remaining, requestedMs)
}

export function isCleanWebStatus(output) {
  return output === ''
}

export function classifyPlaywrightReport(report) {
  if (report?.stats?.unexpected === 0) return 'passed'
  const locations = []
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (value === null || typeof value !== 'object') return
    if (typeof value.location?.file === 'string') locations.push(value.location.file)
    Object.values(value).forEach(visit)
  }
  visit(report?.suites)
  return locations.some((file) => file.endsWith('e2e/real/journey.spec.ts'))
    ? 'product'
    : 'environment'
}

export function finalizeOutcome(outcome, cleanup) {
  if (cleanup.status === 'passed') return { ...outcome, cleanup }
  return {
    status: 'failed',
    failure: { stage: 'environment:cleanup', classification: 'environment' },
    cleanup,
  }
}

export function authorsTenantHeader(source) {
  return (
    /headers\s*:\s*\{[^}]*["']?x-tenant-id["']?\s*:/is.test(source) ||
    /\.(?:set|append)\(\s*["']x-tenant-id["']/i.test(source)
  )
}
