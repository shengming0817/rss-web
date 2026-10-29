import { computed, shallowReactive, watch } from 'vue'
import type { IdentitySession } from '@rss/auth'
import { isRssApiError } from '@rss/api/mdm'
import { useMdm } from '../context'
import { useOperation } from './useOperation'

interface Intent {
  id: string
  input: unknown
  state: 'submitting' | 'unknown' | 'conflict'
}
const sessions = new WeakMap<IdentitySession, { binding: string; intents: Map<string, Intent> }>()
/** Only non-secret domain input lives here. Requests remain explicit and domain-owned. */
export function useOriginalOperation(key: () => string) {
  const runtime = useMdm()
  const binding = () => {
    const s = runtime.session.state.value
    return s.status === 'authenticated'
      ? [s.tenant, s.identity?.principalId, s.session?.id].join('/')
      : ''
  }
  let store = sessions.get(runtime.session)
  if (!store) {
    store = { binding: binding(), intents: shallowReactive(new Map<string, Intent>()) }
    sessions.set(runtime.session, store)
  }
  const owner = store
  function sync() {
    const stamp = binding()
    if (owner.binding !== stamp) {
      owner.intents.clear()
      owner.binding = stamp
    }
  }
  sync()
  watch(binding, sync, { flush: 'sync' })
  const op = useOperation([], () => [binding(), key()])
  const pending = computed(() => {
    sync()
    return owner.intents.get(key())
  })
  const locked = computed(() => op.busy.value || op.uncertain.value || !!pending.value)
  async function submit<T, I>(
    input: I,
    request: (id: string, input: I) => Promise<T>,
    apply: (value: T) => void,
    replay = false,
  ) {
    sync()
    if (!binding() || op.busy.value || (!replay && (pending.value || op.uncertain.value)))
      return false
    const previous = pending.value
    if (replay && previous?.state !== 'unknown') return false
    const target = key(),
      stamp = binding(),
      id = replay ? previous!.id : crypto.randomUUID()
    const original = replay ? (previous!.input as I) : structuredClone(input)
    owner.intents.set(target, { id, input: original, state: 'submitting' })
    return op.runWrite(async () => {
      try {
        const value = await request(id, original)
        if (binding() !== stamp) throw new Error('Requester changed')
        owner.intents.delete(target)
        return value
      } catch (error) {
        if (binding() === stamp) {
          const unknown =
            !isRssApiError(error) ||
            ['network', 'timeout', 'protocol', 'aborted'].includes(error.cause) ||
            ['operation_unknown', 'operation_rollback_unconfirmed'].includes(error.code)
          if (isRssApiError(error) && (error.status === 401 || error.status === 403))
            owner.intents.delete(target)
          else if (unknown || replay)
            owner.intents.set(target, { id, input: original, state: 'unknown' })
          else if (isRssApiError(error) && error.status === 409)
            owner.intents.set(target, { id, input: original, state: 'conflict' })
          else owner.intents.delete(target)
        }
        throw error
      }
    }, apply)
  }
  function resolvedConflict() {
    if (pending.value?.state === 'conflict') owner.intents.delete(key())
  }
  function confirmOriginal(id: string) {
    if (pending.value?.id === id && pending.value.state === 'unknown') {
      owner.intents.delete(key())
      op.uncertain.value = false
    }
  }
  return { ...op, pending, locked, submit, resolvedConflict, confirmOriginal }
}
