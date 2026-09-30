import type { createDeviceDemo } from '../devices/state'
import { createComplianceDemo } from './compliance'
export function createSecurityDemo(devices: ReturnType<typeof createDeviceDemo>) {
  const compliance = createComplianceDemo(devices)
  return { compliance, handle: compliance.handle, reset: compliance.reset }
}
