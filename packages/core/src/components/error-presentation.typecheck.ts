import type { SafeErrorPresentation } from './error-presentation'

const safe: SafeErrorPresentation = {
  kind: 'forbidden',
  code: 'ERR_CORE_FORBIDDEN',
  retryable: false,
  recovery: 'home',
  requestId: 'request-id',
}
void safe

// @ts-expect-error Raw backend messages are not a presentation coordinate.
const withMessage: SafeErrorPresentation = { ...safe, message: 'backend message' }
// @ts-expect-error Wire details are not a presentation coordinate.
const withDetails: SafeErrorPresentation = { ...safe, safeDetails: [{ secret: 'value' }] }
void [withMessage, withDetails]
