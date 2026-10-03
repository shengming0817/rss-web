import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import ArchiveView from './ArchiveView.vue'
const tenant = '11111111-1111-4111-8111-111111111111'
async function setup(overrides: object = {}) {
  const client = {
    state: vi.fn().mockResolvedValue({ initialized: false, generation: 0, unlockedUntil: null }),
    list: vi.fn().mockResolvedValue({
      tenantId: tenant,
      items: [],
      nextAfter: null,
      asOf: 100,
      reminderDays: 30,
      alerts: { expired: 0, expiring: 0, notYetValid: 0 },
    }),
    settings: vi
      .fn()
      .mockResolvedValue({ revision: 0, value: { reminderDays: 30, categories: ['custom'] } }),
    initialize: vi.fn().mockResolvedValue({}),
    unlock: vi.fn().mockResolvedValue({
      initialized: true,
      generation: 1,
      unlockedUntil: Math.floor(Date.now() / 1000) + 900,
    }),
    lock: vi.fn().mockResolvedValue(true),
    operation: vi.fn().mockResolvedValue({}),
    ...overrides,
  }
  const session = {
    state: ref({
      status: 'authenticated',
      tenant,
      identity: { principalId: tenant },
      session: { id: tenant },
    }),
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: ArchiveView },
      { path: '/elsewhere', component: { template: '<p>Elsewhere</p>' } },
    ],
  })
  await router.push('/')
  const wrapper = mount(ArchiveView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant,
          demo: false,
          session,
          security: { certificateArchive: client },
        },
      },
    },
  })
  await flushPromises()
  return { wrapper, router, client, session }
}
it('clears the submitted password and queries uncertain operations without replay', async () => {
  const initialize = vi.fn().mockRejectedValue(new Error('lost response')),
    { wrapper, client } = await setup({ initialize })
  await wrapper.get('#archive-password').setValue('first archive password')
  await wrapper
    .get('#archive-password')
    .element.closest('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flushPromises()
  expect((wrapper.get('#archive-password').element as HTMLInputElement).value).toBe('')
  expect(initialize).toHaveBeenCalledTimes(1)
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '查询操作结果')!
    .trigger('click')
  await flushPromises()
  expect(client.operation).toHaveBeenCalledWith(initialize.mock.calls[0]![0])
  expect(initialize).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})
it('clears unlock and password state on session change and fences pending responses', async () => {
  let complete: (value: unknown) => void = () => {}
  const unlock = vi.fn(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    ),
    { wrapper, session } = await setup({
      state: vi.fn().mockResolvedValue({ initialized: true, generation: 1, unlockedUntil: null }),
      unlock,
    })
  await wrapper.get('#archive-password').setValue('first archive password')
  await wrapper
    .get('#archive-password')
    .element.closest('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flushPromises()
  session.state.value = { ...session.state.value, status: 'anonymous' }
  complete({ initialized: true, generation: 1, unlockedUntil: Math.floor(Date.now() / 1000) + 900 })
  await flushPromises()
  expect(wrapper.text()).not.toContain('当前会话已解锁')
  wrapper.unmount()
})
it('keeps local file errors recoverable and sends each file format and password', async () => {
  const imported: unknown[] = []
  const importFile = vi.fn(async (_id, input) => {
    imported.push(JSON.parse(JSON.stringify(input)))
    return {}
  })
  const { wrapper } = await setup({
    state: vi.fn().mockResolvedValue({
      initialized: true,
      generation: 1,
      unlockedUntil: Math.floor(Date.now() / 1000) + 900,
    }),
    import: importFile,
  })
  await wrapper.get('#archive-name').setValue('CA with key')
  const select = async (files: File[]) => {
    Object.defineProperty(wrapper.get('#archive-file').element, 'files', {
      configurable: true,
      value: files,
    })
    await wrapper.get('#archive-file').trigger('change')
  }
  const submit = async () => {
    wrapper
      .get('#archive-name')
      .element.closest('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
  }
  const large = new File([], 'large.pem')
  Object.defineProperty(large, 'size', { value: 2 * 1024 * 1024 })
  await select([large])
  await submit()
  expect(importFile).not.toHaveBeenCalled()
  expect(wrapper.text()).not.toContain('查询操作结果')
  const cert = new File([], 'ca.pem'),
    key = new File([], 'key.pem')
  for (const file of [cert, key])
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => new TextEncoder().encode(file.name).buffer,
    })
  await select([cert, key])
  await wrapper.get('#archive-file-format-1').setValue('private_key')
  await wrapper.get('#archive-file-password-1').setValue('file password')
  await submit()
  expect(importFile).toHaveBeenCalledTimes(1)
  expect(imported).toEqual([
    expect.objectContaining({
      files: [
        expect.objectContaining({ name: 'ca.pem', format: 'certificate', password: null }),
        expect.objectContaining({
          name: 'key.pem',
          format: 'private_key',
          password: 'file password',
        }),
      ],
    }),
  ])
  expect(wrapper.find('#archive-file-password-1').exists()).toBe(false)
  wrapper.unmount()
})
