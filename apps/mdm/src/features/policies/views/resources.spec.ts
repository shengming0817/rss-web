import { webcrypto } from 'node:crypto'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import ResourcesView from './ResourcesView.vue'
afterEach(() => vi.unstubAllGlobals())
it('requires reselection of identical bytes after unknown upload and never retains bytes for replay', async () => {
  vi.stubGlobal('crypto', webcrypto)
  const upload = vi.fn().mockRejectedValueOnce(new Error('lost reply')).mockResolvedValue(undefined)
  const read = vi
    .fn()
    .mockResolvedValue({ id: 'script', revision: 1, kind: 'script', versions: [] })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ResourcesView }],
  })
  await router.push('/')
  const wrapper = mount(ResourcesView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          demo: true,
          policies: {
            resources: { read, upload },
            catalog: { list: async () => ({ items: [], nextCursor: null }) },
          },
        },
      },
    },
  })
  await flushPromises()
  await wrapper.get('#resource-id').setValue('script')
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '打开')!
    .trigger('click')
  await flushPromises()
  await wrapper.get('#resource-version').setValue('1')
  const input = wrapper.get<HTMLInputElement>('#resource-upload')
  async function select(text: string) {
    const file = new File([text], 'script.ps1')
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => {
        const result = new ArrayBuffer(text.length)
        new Uint8Array(result).set([...text].map((c) => c.charCodeAt(0)))
        return result
      },
    })
    Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
    await input.trigger('change')
  }
  const button = () => wrapper.findAll('button').find((b) => b.text() === '上传内容')!
  await select('first')
  await button().trigger('click')
  await flushPromises()
  await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1))
  await flushPromises()
  expect(button().attributes('disabled')).toBeDefined()
  await select('wrong')
  await button().trigger('click')
  await flushPromises()
  await vi.waitFor(() => expect(button().attributes('disabled')).toBeDefined())
  expect(upload).toHaveBeenCalledTimes(1)
  await select('first')
  await button().trigger('click')
  await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2))
  expect(upload.mock.calls[1]![0]).toBe('script')
  expect(upload.mock.calls[1]![1]).toEqual(upload.mock.calls[0]![1])
  wrapper.unmount()
})
