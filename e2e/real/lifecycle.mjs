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
  let productFailure = false
  let environmentFailure = false
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (value === null || typeof value !== 'object') return
    if (
      typeof value.message === 'string' &&
      /(?:net::ERR_|ECONNREFUSED|browser.*(?:closed|launch)|executable doesn't exist|missing dependencies|target page.*closed)/i.test(
        value.message,
      )
    ) {
      environmentFailure = true
    }
    if (
      typeof value.file === 'string' &&
      value.file.endsWith('e2e/real/journey.spec.ts') &&
      Array.isArray(value.tests) &&
      value.tests.some(
        (test) =>
          test?.status === 'unexpected' ||
          test?.results?.some(
            (result) => result?.status === 'failed' || result?.status === 'timedOut',
          ),
      )
    ) {
      productFailure = true
    }
    if (
      typeof value.location?.file === 'string' &&
      value.location.file.endsWith('e2e/real/journey.spec.ts')
    ) {
      productFailure = true
    }
    Object.values(value).forEach(visit)
  }
  visit(report?.suites)
  if (environmentFailure) return 'environment'
  return productFailure ? 'product' : 'environment'
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
