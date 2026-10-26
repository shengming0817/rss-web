import { computed, reactive, ref, watch, onBeforeUnmount } from 'vue'
import { useDa, identityKey } from '../context'
import { uncertain, needsProof, errorMessage } from './status'
export interface WriteState {
  id: string
  state: 'idle' | 'busy' | 'unknown' | 'accepted'
  message: string
  proof: boolean
}
/** Registry stores only non-secret operation locators, scoped to the app session. */
export function useMutation(key: () => string) {
  const r = useDa(),
    local = ref(0)
  let controller: AbortController | undefined,
    epoch = 0
  function entry() {
    const k = [identityKey(r.session), key()].join('/')
    let value = r.writes.get(k)
    if (!value) {
      value = reactive<WriteState>({ id: '', state: 'idle', message: '', proof: false })
      r.writes.set(k, value)
    }
    return value
  }
  const state = computed(() => {
    void local.value
    return entry()
  })
  watch(
    [() => identityKey(r.session), key],
    () => {
      epoch++
      controller?.abort()
      local.value++
    },
    { flush: 'sync' },
  )
  onBeforeUnmount(() => {
    epoch++
    controller?.abort()
  })
  async function run<T>(
    work: (id: string, signal: AbortSignal) => Promise<T>,
    retain = false,
  ): Promise<T | undefined> {
    if (!identityKey(r.session) || ['busy', 'unknown', 'accepted'].includes(state.value.state))
      return
    const e = state.value,
      version = epoch
    e.id = e.proof && e.id ? e.id : crypto.randomUUID()
    e.state = 'busy'
    e.message = ''
    e.proof = false
    controller = new AbortController()
    try {
      const result = await work(e.id, controller.signal)
      if (epoch !== version) {
        e.state = 'unknown'
        return
      }
      e.state = retain ? 'accepted' : 'idle'
      e.message = '请求已确认；设备效果仍由实际观察决定。'
      return result
    } catch (error) {
      if (epoch === version) {
        e.state = uncertain(error) ? 'unknown' : 'idle'
        e.message = errorMessage(error)
        e.proof = needsProof(error)
      } else if (e.state === 'busy') e.state = uncertain(error) ? 'unknown' : 'idle'
      return undefined
    }
  }
  async function query<T>(
    work: (id: string, signal: AbortSignal) => Promise<T | null>,
    settled: (value: T) => boolean = () => false,
  ): Promise<T | undefined> {
    const e = state.value
    if (!e.id || e.state === 'busy') return
    const version = epoch
    controller = new AbortController()
    try {
      const result = await work(e.id, controller.signal)
      if (epoch !== version) return
      if (result === null) {
        e.message = '未查到原操作，结果仍未知。'
        return
      }
      e.state = settled(result) ? 'idle' : 'accepted'
      e.message = settled(result)
        ? '原操作已确认完成，可以开始新的明确编辑。'
        : '原操作已查到；请核对各阶段结果。'
      return result
    } catch (error) {
      if (epoch === version) e.message = errorMessage(error)
      return undefined
    }
  }
  return {
    state,
    run,
    query,
    cancel: () => controller?.abort(),
    locked: computed(() => state.value.state !== 'idle'),
  }
}
