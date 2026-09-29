import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createAdmissionClient } from '../clients/admission'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import SourcesView from './SourcesView.vue'
it('registers an immutable source, blocks ambiguous writes and explicitly replays the original request', async () => {
  const value = {
    source: { id: 'private', revision: '1', kind: 'private', location: null, publishers: [] },
    snapshot: { id: 'private', revision: '1', sha256: Array<number>(32).fill(1) },
    admission: {
      revision: 1,
      state: 'registered',
      evidence: [],
      operation: '22222222-2222-4222-8222-222222222222',
      actor: 'publisher',
      at: 1,
      digest: Array<number>(32).fill(1),
    },
  }
  let wrongOperation = true
  const request = vi
    .fn(async (o: RequestOptions<unknown>) =>
      o.decode({
        ...value,
        admission: {
          ...value.admission,
          operation: wrongOperation
            ? value.admission.operation
            : (o.body as { operationId: string }).operationId,
        },
      }),
    )
    .mockRejectedValueOnce(new Error('lost response'))
  const client = createAdmissionClient({ request } as unknown as HttpTransport)
  const changeSource = vi.fn(client.changeSource),
    source = vi.fn(async (id: string, revision: string) => ({
      ...value,
      source: { ...value.source, id, revision },
    }))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: SourcesView }],
  })
  await router.push('/')
  const wrapper = mount(SourcesView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          demo: true,
          software: {
            admission: { changeSource, source },
            catalog: {
              sources: vi.fn().mockResolvedValue({
                items: [{ ...value, source: { ...value.source, id: 'second' } }],
                bindings: [],
                nextCursor: null,
              }),
            },
          },
        },
      },
    },
  })
  await flushPromises()
  await wrapper.get('#source-id').setValue('private')
  await wrapper.findAll('form')[1]!.trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('提交结果未知')
  expect(
    wrapper.findAll('fieldset').every((fieldset) => fieldset.attributes('disabled') !== undefined),
  ).toBe(true)
  const button = (text: string) => wrapper.findAll('button').find((b) => b.text() === text)!
  expect(button('新建').attributes('disabled')).toBeDefined()
  await button('重放同一操作').trigger('click')
  await flushPromises()
  expect(changeSource.mock.calls[1]).toEqual(changeSource.mock.calls[0])
  expect(wrapper.text()).toContain('提交结果未知')
  expect(button('新建').attributes('disabled')).toBeDefined()
  wrongOperation = false
  await button('重放同一操作').trigger('click')
  await flushPromises()
  expect(changeSource.mock.calls[2]).toEqual(changeSource.mock.calls[0])
  expect(wrapper.text()).not.toContain('提交结果未知')
  expect(wrapper.text()).toContain('已登记，未准入')
  expect(wrapper.text()).toContain('不代表卸载')
  expect(wrapper.find('#source-kind').exists()).toBe(false)
  await wrapper.get('#source-evidence').setValue('First source evidence')
  await wrapper.get('li button').trigger('click')
  await flushPromises()
  expect(source).toHaveBeenLastCalledWith('second', '1')
  expect((wrapper.get('#source-evidence').element as HTMLInputElement).value).toBe('')
  wrapper.unmount()
})
