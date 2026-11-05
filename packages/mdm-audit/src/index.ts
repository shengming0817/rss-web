export type * from './model'
export { validateAuditQuery, validateActivityQuery, validatePolicyAddress } from './query'
import { freeze, identifier, uuid } from '@rss/mdm-inventory'
import type { WindowQuery } from '@rss/mdm-devices'
import type {
  ActivityQuery,
  AuditPort,
  AuditPolicyLookupPort,
  AuditQuery,
  PolicyAddress,
  TimelineQuery,
} from './model'
import {
  validateActivityQuery,
  validateAuditQuery,
  validatePolicyAddress,
  validateWindow,
} from './query'

/** Reads only safe producer facts. No client-side correlation, verification or automatic replay. */
export function createAudit(port: AuditPort) {
  return Object.freeze({
    search(query: AuditQuery = {}) {
      validateAuditQuery(query)
      return port.search(freeze(query))
    },
    timeline(device: string, query: TimelineQuery = {}) {
      identifier(device, 256)
      if ('device' in query) throw new Error('Timeline device belongs to its path')
      validateAuditQuery(query)
      return port.timeline(device, freeze(query))
    },
    activities(device: string, query: ActivityQuery = {}) {
      identifier(device, 256)
      validateActivityQuery(query)
      return port.activities(device, freeze(query))
    },
    async activity(device: string, id: string) {
      identifier(device, 256)
      identifier(id, 256)
      const value = await port.activity(device, id)
      if (value.personal !== false || value.activity.id !== id)
        throw new Error('Wrong management activity detail')
      return value
    },
  })
}
/** Policy remains its own owner. This narrow lookup exists only to navigate authorized audit. */
export function createAuditPolicyLookup(port: AuditPolicyLookupPort) {
  return Object.freeze({
    async resolve(address: PolicyAddress) {
      validatePolicyAddress(address)
      const value = await port.resolve(freeze(address))
      uuid(value.id)
      if (address.kind === 'id' && address.id !== value.id) throw new Error('Wrong policy identity')
      if (address.kind === 'tool_name' && address.name !== value.toolName)
        throw new Error('Wrong policy tool name')
      if (address.kind === 'alias' && address.alias.toLowerCase() !== value.alias)
        throw new Error('Wrong policy alias')
      return value
    },
    async byEvent(event: string, query: WindowQuery = {}) {
      identifier(event, 256)
      validateWindow(query)
      const value = await port.byEvent(event, freeze(query))
      if (value.items.some((item) => item.customEvent !== event))
        throw new Error('Wrong event association')
      return value
    },
  })
}
export type Audit = ReturnType<typeof createAudit>
export type AuditPolicyLookup = ReturnType<typeof createAuditPolicyLookup>
