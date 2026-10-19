import { reactive, watch } from 'vue'
import type { IdentitySession } from '@rss/auth'
import { uuid } from '../../services/decode'
import { isRssApiError } from '@rss/api/mdm'

export interface SettingsOperation {
  id: string
  target: string
  action: string
  expectedRevision: number
  publicInput: string
  queried: boolean
  state: 'submitting' | 'unknown' | 'received' | 'conflict'
}
/** Non-secret domain operation locators only. No request closure, credentials, replay or persistence. */
export function createSettingsOperations(session: IdentitySession) {
  const records = reactive(new Map<string, SettingsOperation>())
  const binding = () => {
    const state = session.state.value
    return state.status === 'authenticated'
      ? [state.tenant, state.identity?.principalId, state.session?.id].join('/')
      : null
  }
  let generation = 0
  const stop = watch(
    binding,
    () => {
      generation++
      records.clear()
    },
    { flush: 'sync' },
  )
  return {
    records,
    async submit<T>(
      target: string,
      action: string,
      expectedRevision: number,
      publicInput: string,
      request: (id: string) => Promise<T>,
      replay = false,
      operationId?: string,
    ) {
      const previous = records.get(target)
      if (
        !binding() ||
        previous?.state === 'submitting' ||
        (!replay && previous && (previous.state === 'unknown' || previous.state === 'conflict'))
      )
        throw new Error('Operation requires resolution')
      if (replay && (!previous || previous.state !== 'unknown'))
        throw new Error('No unresolved original operation')
      if (
        replay &&
        (!previous!.queried ||
          previous!.action !== action ||
          previous!.expectedRevision !== expectedRevision ||
          previous!.publicInput !== publicInput)
      )
        throw new Error('Restore the original input before explicit replay')
      const id = replay ? previous!.id : uuid(operationId ?? crypto.randomUUID()),
        current = generation
      const metadata = { id, target, action, expectedRevision, publicInput, queried: false }
      records.set(target, { ...metadata, state: 'submitting' })
      try {
        const result = await request(id)
        if (generation !== current || records.get(target)?.id !== id)
          throw new Error('Stale operation')
        records.set(target, { ...metadata, state: 'received' })
        return result
      } catch (error) {
        if (generation === current && records.get(target)?.id === id) {
          const conflict = isRssApiError(error) && error.status === 409
          const unknown =
            !isRssApiError(error) ||
            ['network', 'timeout', 'aborted', 'protocol'].includes(error.cause) ||
            ['operation_unknown', 'operation_rollback_unconfirmed'].includes(error.code)
          if (conflict || unknown)
            records.set(target, {
              ...metadata,
              state: conflict && !replay ? 'conflict' : 'unknown',
            })
          else records.delete(target)
        }
        throw error
      }
    },
    confirm(target: string, id: string) {
      const current = records.get(target)
      if (current?.id === id && current.state !== 'submitting')
        records.set(target, { ...current, state: 'received' })
    },
    queried(target: string, id: string) {
      const current = records.get(target)
      if (current?.id === id) records.set(target, { ...current, queried: true })
    },
    resolveConflict(target: string) {
      if (records.get(target)?.state === 'conflict') records.delete(target)
    },
    dispose() {
      stop()
      generation++
      records.clear()
    },
  }
}
