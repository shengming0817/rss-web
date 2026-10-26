import { ref, shallowRef, watch, onBeforeUnmount } from 'vue'
import type { Page } from '@rss/device-access/model'
import { useDa, identityKey } from '../context'
import { errorMessage } from './status'
/** Explicit one-page-at-a-time reads; incomplete directories cannot authorize a review step. */
export function useDirectory<T extends { id: string }>(
  load: (cursor: string | null, signal: AbortSignal) => Promise<Page<T>>,
) {
  const runtime = useDa(),
    items = shallowRef<T[]>([]),
    busy = ref(false),
    error = ref(''),
    complete = ref(false),
    blocked = ref(false)
  let cursor: string | null = null,
    epoch = 0,
    controller: AbortController | undefined
  const seen = new Set<string>()
  async function loadMore() {
    if (busy.value || complete.value || blocked.value || !identityKey(runtime.session)) return
    const version = epoch
    controller = new AbortController()
    busy.value = true
    error.value = ''
    try {
      const page = await load(cursor, controller.signal)
      if (version !== epoch) return
      if (
        (page.nextCursor && (page.nextCursor === cursor || seen.has(page.nextCursor))) ||
        items.value.length + page.items.length > 10000
      ) {
        blocked.value = true
        error.value = '设备目录分页异常或超出本次读取上限，请缩小服务端目录范围后重试。'
        return
      }
      if (cursor) seen.add(cursor)
      items.value = [
        ...new Map([...items.value, ...page.items].map((item) => [item.id, item])).values(),
      ]
      cursor = page.nextCursor
      complete.value = cursor === null
    } catch (e) {
      if (version === epoch) error.value = errorMessage(e)
    } finally {
      if (version === epoch) busy.value = false
    }
  }
  function reset() {
    epoch++
    controller?.abort()
    cursor = null
    seen.clear()
    items.value = []
    busy.value = false
    error.value = ''
    complete.value = false
    blocked.value = false
  }
  watch(
    () => identityKey(runtime.session),
    () => {
      reset()
      void loadMore()
    },
    { immediate: true, flush: 'sync' },
  )
  onBeforeUnmount(reset)
  return { items, busy, error, complete, blocked, loadMore }
}
