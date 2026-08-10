/** Test-only factory for exercising consumers against the real sanitized error type. */
export { decodeWireError as decodeWireErrorForTest } from './wire-error'
export { decodeEndpointError as decodeEndpointErrorForTest } from './wire-error'
export {
  abortedError as abortedErrorForTest,
  networkError as networkErrorForTest,
  protocolError as protocolErrorForTest,
  timeoutError as timeoutErrorForTest,
} from './wire-error'
