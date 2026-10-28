import { describe, it, expect, vi } from 'vitest'
import { defineComponent, reactive, ref } from 'vue'
import { mount } from '@vue/test-utils'
const state = vi.hoisted(() => ({
  route: { fullPath: '/' },
  binding: ['tenant', 'actor', 'session'],
}))
vi.mock('../context', () => ({ useMdm: () => ({}) }))
vi.mock('vue-router', () => ({ useRoute: () => state.route }))
vi.mock('../features/devices/useDeviceBinding', () => ({ deviceBinding: () => state.binding }))
import { useDirectoryQuery } from './useDirectoryQuery'
function setup() {
  state.route = reactive({ fullPath: '/' })
  let q!: ReturnType<typeof useDirectoryQuery<'id' | 'name'>>
  const wrapper = mount(
    defineComponent({
      setup() {
        q = useDirectoryQuery(['id', 'name'], 100)
        return () => null
      },
    }),
  )
  return { q, wrapper }
}
describe('accepted directory navigation', () => {
  it('keeps draft off continuation and previous-first, and commits navigation only on success', async () => {
    const { q, wrapper } = setup(),
      fetch = vi.fn().mockResolvedValue({ items: [], nextCursor: 'cDI' })
    await q.read(undefined, fetch)
    q.draft.filter = "name=='draft'"
    q.draft.limit = 1
    await q.read('cDI', async (query) => {
      expect(query.filter).toBeUndefined()
      expect(query.limit).toBe(50)
      return { items: [], nextCursor: null }
    })
    expect(q.trail.value).toEqual([undefined])
    expect(q.cursor.value).toBe('cDI')
    q.navigate()
    await expect(
      q.read(q.previous.value, async () => {
        throw new Error('offline')
      }),
    ).rejects.toThrow()
    expect(q.cursor.value).toBe('cDI')
    expect(q.trail.value).toEqual([undefined])
    q.navigate()
    await q.read(q.previous.value, async (query) => {
      expect(query.filter).toBeUndefined()
      return { items: [], nextCursor: null }
    })
    expect(q.trail.value).toEqual([])
    await q.read(undefined, async (query) => {
      expect(query.filter).toBe("(name=='draft')")
      expect(query.limit).toBe(1)
      return { items: [], nextCursor: null }
    })
    wrapper.unmount()
  })
  it('rejects repeated cursors and isolates late responses after permission or identity changes', async () => {
    const { q, wrapper } = setup(),
      allowed = ref(true)
    q.restrict(allowed)
    await q.read(undefined, async () => ({ nextCursor: 'cDI' }))
    await expect(q.read('cDI', async () => ({ nextCursor: 'cDI' }))).rejects.toThrow('Repeated')
    expect(q.cursor.value).toBeUndefined()
    let finish!: (v: { nextCursor: null }) => void
    const pending = q.read(
      'cDI',
      () =>
        new Promise<{ nextCursor: null }>((resolve) => {
          finish = resolve
        }),
    )
    allowed.value = false
    finish({ nextCursor: null })
    await expect(pending).rejects.toThrow('Stale')
    expect(q.applied.value).toBeUndefined()
    allowed.value = true
    const pending2 = q.read(
      undefined,
      () =>
        new Promise<{ nextCursor: null }>((resolve) => {
          finish = resolve
        }),
    )
    state.route.fullPath = '/other'
    finish({ nextCursor: null })
    await expect(pending2).rejects.toThrow('Stale')
    wrapper.unmount()
  })
  it('omits all-field selection beyond the server name budget, and rejects oversized partial selection', async () => {
    let q!: ReturnType<typeof useDirectoryQuery<string>>
    const columns = Array.from({ length: 21 }, (_, i) => 'f' + i)
    const wrapper = mount(
      defineComponent({
        setup() {
          q = useDirectoryQuery(columns)
          return () => null
        },
      }),
    )
    expect(q.request().fields).toBeUndefined()
    q.draft.fields = columns.slice(0, 17)
    expect(() => q.request()).toThrow('Invalid field set')
    wrapper.unmount()
  })
})
