import { isRssApiError } from '@rss/api/identity'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { identityKey, useDa, useIdentity } from '../context'
import { errorMessage, needsProof, uncertain } from './status'
export type { WriteState } from '../context'
const notifications = new WeakMap<object, { version: number; listeners: Set<() => void> }>()
/** This registry contains operation locators only. Reloads and remounts cannot unlock unknown writes. */
export function useMutation(key: string) {
  const r = useDa()
  useIdentity()
  const identity = identityKey(r.session),
    scope = `${identity}/${key}`
  const active = useRef(scope)
  active.current = scope
  const lifetime = useRef(0),
    controller = useRef<AbortController | null>(null),
    querying = useRef(false)
  let changes = notifications.get(r.writes)
  if (!changes) {
    changes = { version: 0, listeners: new Set() }
    notifications.set(r.writes, changes)
  }
  const events = changes
  useSyncExternalStore(
    (listener) => {
      events.listeners.add(listener)
      return () => {
        events.listeners.delete(listener)
      }
    },
    () => events.version,
  )
  const update = () => {
    events.version++
    events.listeners.forEach((listener) => listener())
  }
  let state = r.writes.get(scope)
  if (!state) {
    state = { id: '', state: 'idle', message: '', proof: false, review: false }
    r.writes.set(scope, state)
  }
  const entry = state
  useEffect(() => {
    if (entry.state === 'idle' && entry.proof) {
      entry.proof = false
      entry.id = ''
      update()
    }
  }, [entry])
  const live = (bound: string, version: number) =>
    active.current === bound && lifetime.current === version && identityKey(r.session) === identity
  useEffect(
    () => () => {
      lifetime.current++
      controller.current?.abort()
      querying.current = false
    },
    [scope],
  )
  async function run<T>(
    work: (id: string, signal: AbortSignal) => Promise<T>,
    retain = false,
  ): Promise<T | undefined> {
    if (
      !identity ||
      identityKey(r.session) !== identity ||
      active.current !== scope ||
      querying.current ||
      entry.state !== 'idle' ||
      entry.review
    )
      return
    const version = lifetime.current
    entry.id = entry.proof && entry.id ? entry.id : crypto.randomUUID()
    entry.state = 'busy'
    entry.message = ''
    entry.proof = false
    const control = new AbortController()
    controller.current = control
    update()
    try {
      const value = await work(entry.id, control.signal)
      if (!live(scope, version) || control.signal.aborted) {
        entry.state = 'unknown'
        return
      }
      entry.state = retain ? 'accepted' : 'idle'
      entry.message = '请求已确认；设备效果仍由实际观察决定。'
      return value
    } catch (error) {
      entry.state = uncertain(error) ? 'unknown' : 'idle'
      if (live(scope, version)) {
        entry.message = errorMessage(error)
        entry.proof = needsProof(error)
        entry.review = isRssApiError(error) && error.status === 409
      }
      return undefined
    } finally {
      update()
    }
  }
  async function query<T>(
    work: (id: string, signal: AbortSignal) => Promise<T | null>,
    settled: (value: T) => boolean = () => false,
  ): Promise<T | undefined> {
    if (
      !identity ||
      identityKey(r.session) !== identity ||
      active.current !== scope ||
      querying.current ||
      !entry.id ||
      entry.state === 'busy'
    )
      return
    const version = lifetime.current,
      original = entry.id,
      control = new AbortController()
    controller.current = control
    querying.current = true
    update()
    try {
      const value = await work(original, control.signal)
      if (!live(scope, version) || control.signal.aborted || entry.id !== original) return
      if (value === null) {
        entry.message = '未查到原操作，结果仍未知。'
        return
      }
      entry.state = settled(value) ? 'idle' : 'accepted'
      entry.message = settled(value)
        ? '原操作已确认完成，可以明确开始新编辑。'
        : '原操作已查到；请核对各阶段结果。'
      return value
    } catch (error) {
      if (live(scope, version)) entry.message = errorMessage(error)
      return undefined
    } finally {
      if (live(scope, version)) {
        querying.current = false
        update()
      }
    }
  }
  return {
    state: entry,
    run,
    query,
    acceptRevision: () => {
      if (entry.state === 'idle') {
        entry.review = false
        entry.message = '已核对当前版本；草稿保留，请明确提交。'
        update()
      }
    },
    cancel: () => controller.current?.abort(),
    locked: querying.current || entry.state !== 'idle',
  }
}
