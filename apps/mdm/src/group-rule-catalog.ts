import type { AuthorizationPort, DirectoryQuery } from '@rss/mdm-authorization'
import type { GroupCriteria } from '@rss/mdm-groups'
import type { InventoryPort } from '@rss/mdm-inventory'

export const registrationFields = 'device.registration_user.'
export const currentFields = 'device.current_user.'

export function usesRegistration(criteria: GroupCriteria): boolean {
  if (criteria.kind === 'predicate') return criteria.field.startsWith(registrationFields)
  if (criteria.kind === 'group') return false
  return criteria.children.some(usesRegistration)
}

// A rule tree can show the same directory in many leaves. Share only pending reads
// within this permission snapshot, and cancel HTTP when the last owner leaves.
function shareRead<Q, T>(load: (query: Q, signal: AbortSignal) => Promise<T>) {
  type Entry = { controller: AbortController; result: Promise<T>; readers: number }
  const pending = new Map<string, Entry>()
  return (query: Q, signal: AbortSignal) => {
    signal.throwIfAborted()
    const key = JSON.stringify(query)
    let entry = pending.get(key)
    if (!entry) {
      const controller = new AbortController()
      const result = load(query, controller.signal)
      entry = { controller, result, readers: 0 }
      pending.set(key, entry)
    }
    const reading = entry
    reading.readers++
    function release() {
      signal.removeEventListener('abort', release)
      if (--reading.readers === 0) {
        if (pending.get(key) === reading) pending.delete(key)
        if (signal.aborted) reading.controller.abort()
      }
    }
    signal.addEventListener('abort', release, { once: true })
    return reading.result.finally(() => {
      if (!signal.aborted) release()
    })
  }
}

export function createRuleCatalog(
  scope: string,
  registration: boolean,
  fields: InventoryPort['fields'],
  groups: AuthorizationPort['groups'],
) {
  return {
    scope,
    registration,
    fields: shareRead(fields),
    userGroups: shareRead((query: DirectoryQuery<'id' | 'name'>, signal) => groups(query, signal)),
  }
}
export type RuleCatalog = ReturnType<typeof createRuleCatalog>
