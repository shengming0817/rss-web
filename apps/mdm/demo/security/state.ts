import type { createDeviceDemo } from '../devices/state'
import type { createOperationsDemo } from '../operations/state'
import { createComplianceDemo } from './compliance'
export function createSecurityDemo(
  devices: ReturnType<typeof createDeviceDemo>,
  operations: ReturnType<typeof createOperationsDemo>,
) {
  const compliance = createComplianceDemo(devices, operations)
  return { compliance, handle: compliance.handle, reset: compliance.reset }
}
