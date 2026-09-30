import type { HttpTransport } from '@rss/api/mdm'
import { createComplianceClient } from './clients/compliance'
export function createSecurityClients(transport: HttpTransport) {
  return { compliance: createComplianceClient(transport) }
}
