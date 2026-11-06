// @vitest-environment jsdom
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { decodeMdmError } from '@rss/api/mdm'
import { ReadEpoch, usePageRead, useAction, type ReadOptions } from './AdminUi'

let root: Root, host: HTMLDivElement
let state: ReturnType<typeof usePageRead<string>>
let action: ReturnType<typeof useAction>
const conflict = () => decodeMdmError(409, { code: 'query_read_conflict' })
function Probe({
  read,
  query,
  options,
}: {
  read: (signal: AbortSignal) => Promise<string>
  query: string
  options?: ReadOptions
}) {
  state = usePageRead(query, read, options)
  action = useAction()
  return h('output', null, state.value ?? '')
}
async function render(
  read: (signal: AbortSignal) => Promise<string>,
  query = 'first',
  options: ReadOptions | undefined = { retryReadConflict: true },
  epoch = 'session-a',
) {
  await act(async () =>
    root.render(h(ReadEpoch.Provider, { value: epoch }, h(Probe, { read, query, options }))),
  )
}
async function advance(ms: number) {
  await act(async () => vi.advanceTimersByTimeAsync(ms))
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
})
it('bounds canonical first-page conflicts to three reads with 150/300 ms spacing', async () => {
  const read = vi.fn<(signal: AbortSignal) => Promise<string>>().mockRejectedValue(conflict())
  await render(read)
  expect(read).toHaveBeenCalledTimes(1)
  await advance(149)
  expect(read).toHaveBeenCalledTimes(1)
  await advance(1)
  expect(read).toHaveBeenCalledTimes(2)
  await advance(299)
  expect(read).toHaveBeenCalledTimes(2)
  await advance(1)
  expect(read).toHaveBeenCalledTimes(3)
  expect(state.busy).toBe(false)
  expect(state.error).toMatchObject({ code: 'query_read_conflict' })
  await advance(30_000)
  expect(read).toHaveBeenCalledTimes(3)
  expect(read.mock.calls.every(([signal]) => signal === read.mock.calls[0]![0])).toBe(true)
})
it('publishes a successful retry and releases its total budget timer', async () => {
  const read = vi
    .fn<(signal: AbortSignal) => Promise<string>>()
    .mockRejectedValueOnce(conflict())
    .mockResolvedValue('current')
  await render(read)
  await advance(150)
  expect(state.value).toBe('current')
  await advance(30_000)
  expect(state.value).toBe('current')
  expect(read.mock.calls[0]![0].aborted).toBe(false)
})
it('shares thirty seconds across attempts and aborts a late second response', async () => {
  let reject!: (error: unknown) => void, resolve!: (value: string) => void
  const read = vi
    .fn<(signal: AbortSignal) => Promise<string>>()
    .mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
  await render(read)
  await advance(29_000)
  await act(async () => reject(conflict()))
  await advance(150)
  expect(read).toHaveBeenCalledTimes(2)
  await advance(850)
  expect(read.mock.calls[1]![0].aborted).toBe(true)
  expect(state.busy).toBe(false)
  expect(state.error).toMatchObject({ name: 'TimeoutError' })
  await act(async () => resolve('late'))
  expect(state.value).toBeUndefined()
  expect(read).toHaveBeenCalledTimes(2)
})
it.each([
  decodeMdmError(401, { code: 'permission_denied' }),
  decodeMdmError(403, { code: 'permission_denied' }),
  decodeMdmError(503, { code: 'query_read_conflict' }),
  decodeMdmError(503, { code: 'unavailable' }),
  decodeMdmError(409, { code: 'query_cursor_invalidated' }),
  decodeMdmError(409, { code: 'query_result_unavailable' }),
  decodeMdmError(409, { code: 'query_read_conflict', extra: 'invalid' }),
  { status: 409, code: 'query_read_conflict', cause: 'wire' },
  new TypeError('network failed'),
])(
  'does not replay other status, protocol, cursor, result or network failures: %o',
  async (error) => {
    const read = vi.fn().mockRejectedValue(error)
    await render(read)
    await advance(30_000)
    expect(read).toHaveBeenCalledTimes(1)
    expect(state.error).toBe(error)
  },
)
it('requires explicit opt-in and keeps continuation conflict on the original page', async () => {
  const read = vi.fn().mockRejectedValue(conflict())
  await render(read, 'cursor=page-2', { retryReadConflict: false })
  await advance(30_000)
  expect(read).toHaveBeenCalledTimes(1)
  await act(async () => state.reload())
  expect(read).toHaveBeenCalledTimes(2)
  await act(async () => root.render(h(Probe, { read, query: 'no-policy' })))
  await advance(30_000)
  expect(read).toHaveBeenCalledTimes(3)
})
it.each(['query', 'epoch'])(
  'cancels and fences stale responses after a %s change',
  async (change) => {
    let resolve!: (value: string) => void
    const read = vi
      .fn<(signal: AbortSignal) => Promise<string>>()
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done
          }),
      )
      .mockResolvedValue('fresh')
    await render(read)
    await render(
      read,
      change === 'query' ? 'new-filter' : 'first',
      { retryReadConflict: true },
      change === 'epoch' ? 'session-b' : 'session-a',
    )
    expect(read.mock.calls[0]![0].aborted).toBe(true)
    await act(async () => resolve('stale'))
    expect(host.textContent).toBe('fresh')
  },
)
it('cancels pending backoff on leaving the page', async () => {
  const read = vi.fn().mockRejectedValue(conflict())
  await render(read)
  await act(async () => root.render(null))
  await advance(30_000)
  expect(read).toHaveBeenCalledTimes(1)
})
it('clears previously displayed data on a denied refresh without retrying', async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce('private')
    .mockRejectedValue(decodeMdmError(403, { code: 'permission_denied' }))
  await render(read)
  expect(host.textContent).toBe('private')
  await act(async () => state.reload())
  await advance(30_000)
  expect(host.textContent).toBe('')
  expect(read).toHaveBeenCalledTimes(2)
})
it('never replays a write through the action lifecycle', async () => {
  await render(async () => 'ready')
  const write = vi.fn().mockRejectedValue(conflict())
  await act(async () => {
    await action.run(write)
  })
  await advance(30_000)
  expect(write).toHaveBeenCalledTimes(1)
})
