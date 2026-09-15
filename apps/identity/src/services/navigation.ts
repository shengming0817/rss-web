import { uuid } from './decode'
/** A query locator can restore a read-only lookup, never a command or arbitrary destination. */
export function operationQuery(query: Record<string, unknown>): { operation?: string } {
  try {
    return { operation: uuid(query['operation']) }
  } catch {
    return {}
  }
}
