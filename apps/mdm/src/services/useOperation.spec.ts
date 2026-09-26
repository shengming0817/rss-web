import { expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { networkErrorForTest, timeoutErrorForTest } from '@rss/api/testing'
import { decodeMdmError } from '@rss/api/mdm'
import { useOperation } from './useOperation'
it('ignores responses after route changes/unmount and keeps business error meanings distinct', async () => {
  let state!: ReturnType<typeof useOperation>
  const component = defineComponent({
    setup() {
      state = useOperation()
      return () => h('div')
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component },
      { path: '/next', component },
    ],
  })
  await router.push('/')
  const wrapper = mount(component, { global: { plugins: [router] } })
  let resolve!: (v: string) => void
  const apply = vi.fn(),
    pending = state.run(
      () =>
        new Promise<string>((r) => {
          resolve = r
        }),
      apply,
    )
  const ignored = vi.fn()
  await state.run(async () => {
    ignored()
  })
  expect(ignored).not.toHaveBeenCalled()
  await router.push('/next')
  resolve('old')
  await pending
  expect(apply).not.toHaveBeenCalled()
  for (const [status, code, key] of [
    [403, 'permission_denied', 'denied'],
    [409, 'operation_conflict', 'conflict'],
    [501, 'action_not_supported', 'unsupported'],
    [503, 'operation_unknown', 'unknownWrite'],
    [503, 'service_unavailable', 'unavailable'],
  ] as const) {
    await state.run(async () => {
      throw decodeMdmError(status, { code })
    })
    expect(state.failure.value).toBe(key)
  }
  await state.run(async () => {
    throw new Error('raw sensitive body')
  })
  expect(state.failure.value).toBe('invalidResponse')
  const last = state.run(
    () =>
      new Promise<string>((r) => {
        resolve = r
      }),
    apply,
  )
  wrapper.unmount()
  resolve('late')
  await last
  await flushPromises()
  expect(apply).not.toHaveBeenCalled()
})

it('keeps uncertain writes recoverable across reads and separates acknowledged writes from refresh failures', async () => {
  let state!: ReturnType<typeof useOperation>
  const component = defineComponent({
    setup() {
      state = useOperation()
      return () => h('div')
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component }],
  })
  await router.push('/')
  const wrapper = mount(component, { global: { plugins: [router] } })
  for (const error of [networkErrorForTest(), timeoutErrorForTest(), decodeMdmError(502, {})]) {
    expect(
      await state.runWrite(async () => {
        throw error
      }),
    ).toBe(false)
    expect(state.uncertain.value).toBe(true)
    expect(state.failure.value).toBe('unknownWrite')
    await state.run(async () => 'read')
    expect(state.uncertain.value).toBe(true)
    expect(await state.runWrite(async () => 'original receipt')).toBe(true)
    expect(state.uncertain.value).toBe(false)
  }
  expect(await state.runWrite(async () => 'ack')).toBe(true)
  await state.run(async () => {
    throw networkErrorForTest()
  })
  expect(state.failure.value).toBe('unavailable')
  expect(state.uncertain.value).toBe(false)
  wrapper.unmount()
})
