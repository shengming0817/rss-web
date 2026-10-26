import { ref, shallowRef, watch, onBeforeUnmount } from 'vue'
import type { Page } from '@rss/device-access/model'
import { useDa, identityKey } from '../context'
import { errorMessage } from './status'
/** Draft fields remain owned by the editor; a freshly read baseline needs explicit acceptance. */
export function useRevisionReview<T extends { id: string; revision: number }>(
  initial: T | null,
  load: (cursor: string | null, signal: AbortSignal) => Promise<Page<T>>,
) {
  const r = useDa(),
    revision = ref(initial?.revision ?? 0),
    current = shallowRef<T>(),
    busy = ref(false),
    error = ref('')
  let controller: AbortController | undefined,
    epoch = 0
  function clear() {
    epoch++
    controller?.abort()
    current.value = undefined
    busy.value = false
    error.value = ''
  }
  watch(() => identityKey(r.session), clear, { flush: 'sync' })
  onBeforeUnmount(clear)
  async function refresh() {
    clear()
    if (!initial || !identityKey(r.session)) return
    const version = epoch
    controller = new AbortController()
    busy.value = true
    let cursor: string | null = null
    const seen = new Set<string>()
    try {
      for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
        const page = await load(cursor, controller.signal)
        if (version !== epoch) return
        const value = page.items.find((item) => item.id === initial.id)
        if (value) {
          current.value = value
          return
        }
        if (!page.nextCursor) {
          error.value = '当前授权目录中未找到此对象，请保留草稿并联系管理员核对。'
          return
        }
        if (seen.has(page.nextCursor)) break
        seen.add(page.nextCursor)
        cursor = page.nextCursor
      }
      error.value = '当前目录尚未完整读取，无法更新编辑基准。请缩小目录后重试。'
    } catch (e) {
      if (version === epoch) error.value = errorMessage(e)
    } finally {
      if (version === epoch) busy.value = false
    }
  }
  function accept() {
    if (!current.value) return false
    revision.value = current.value.revision
    current.value = undefined
    return true
  }
  return { revision, current, busy, error, refresh, accept }
}
