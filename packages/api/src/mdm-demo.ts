/** Explicit loopback composition; published operations still use their fixed contracts. */
import { createMdmHttpTransport } from './mdm-http'
import { decodeMdmError } from './mdm'
export function createMdmDemoTransport() {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname))
    throw new Error('MDM demo requires loopback')
  return createMdmHttpTransport(decodeMdmError, true)
}
