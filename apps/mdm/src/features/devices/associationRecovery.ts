import { shallowRef } from 'vue'
import { isRssApiError } from '@rss/api/mdm'
import type { MdmRuntime } from '../../context'
import type { ConfirmAssociation, RevokeAssociation } from './clients/associations'
import { deviceBinding } from './useDeviceBinding'
export type PendingAssociation =
  | { kind: 'confirm'; body: ConfirmAssociation }
  | { kind: 'revoke'; id: string; body: RevokeAssociation }
type Entry = { request: PendingAssociation; state: 'inFlight' | 'unknown' }
type Recovery = {
  binding: string
  entries: Map<string, ReturnType<typeof shallowRef<Entry | undefined>>>
}
const stores = new WeakMap<MdmRuntime, Recovery>()
/** Operation memory only. Credentials and current authority remain in the app session. */
export function associationRecovery(runtime: MdmRuntime, resource: string) {
  const binding = JSON.stringify(deviceBinding(runtime))
  let store = stores.get(runtime)
  if (store?.binding !== binding) {
    store = { binding, entries: new Map() }
    stores.set(runtime, store)
  }
  let pending = store.entries.get(resource)
  if (!pending) {
    pending = shallowRef<Entry>()
    store.entries.set(resource, pending)
  }
  const entry = pending
  return {
    pending: entry,
    async dispatch<T>(request: PendingAssociation, send: () => Promise<T>) {
      entry.value = { request: structuredClone(request), state: 'inFlight' }
      try {
        const result = await send()
        entry.value = undefined
        return result
      } catch (error) {
        const unknown =
          !isRssApiError(error) ||
          ['network', 'timeout', 'aborted', 'protocol'].includes(error.cause) ||
          ['operation_unknown', 'operation_rollback_unconfirmed'].includes(error.code)
        entry.value =
          unknown && JSON.stringify(deviceBinding(runtime)) === binding
            ? { request: structuredClone(request), state: 'unknown' }
            : undefined
        throw error
      }
    },
  }
}
