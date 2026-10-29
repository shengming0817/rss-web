import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { mdmKey } from '../context'
import { mdmI18n } from '../i18n'
import EntryView from './EntryView.vue'
const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()))
async function setup(
  options: {
    platform?: boolean
    writable?: boolean
    completed?: boolean
    unavailable?: boolean
    pending?: boolean
  } = {},
) {
  const tenant = '11111111-1111-4111-8111-111111111111'
  const read = vi.fn(async () => ({
    saved: { intent: { completionRequested: !!options.completed } },
    complete: false,
    canComplete: false,
  }))
  const effective = vi.fn(async () => {
    if (options.unavailable) throw new Error('Unavailable')
    return {
      principalId: 'principal',
      grants: options.writable
        ? [{ operation: 'registration_configuration_write', scope: { kind: 'tenant' } }]
        : [],
    }
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'entry', component: EntryView },
      ...['workspace', 'settings-guide', 'settings-overview'].map((name) => ({
        path: '/' + name,
        name,
        component: { template: '<div/>' },
      })),
    ],
  })
  await router.push({ path: '/', query: options.pending ? { operation: tenant } : {} })
  const wrapper = mount(EntryView, {
    global: {
      plugins: [mdmI18n(), router],
      provide: {
        [mdmKey as symbol]: {
          tenant,
          realm: options.platform ? 'platform' : 'tenant',
          demo: false,
          session: { state: shallowRef({ identity: { principalId: 'principal' } }) },
          operations: { authorization: { effective } },
          settings: { firstUse: { read } },
        },
      },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return { router, wrapper, read, effective }
}
it('routes first-use administrators to the guide and completed administrators to daily work despite later degradation', async () => {
  expect((await setup({ writable: true })).router.currentRoute.value.name).toBe('settings-guide')
  expect((await setup({ writable: true, completed: true })).router.currentRoute.value.name).toBe(
    'workspace',
  )
  expect(
    (await setup({ writable: true, completed: true, pending: true })).router.currentRoute.value
      .name,
  ).toBe('settings-guide')
})
it('keeps readers and platform identities outside the mandatory guide and reports dependency failure', async () => {
  const reader = await setup()
  expect(reader.router.currentRoute.value.name).toBe('workspace')
  expect(reader.read).not.toHaveBeenCalled()
  const platform = await setup({ platform: true })
  expect(platform.router.currentRoute.value.name).toBe('settings-overview')
  expect(platform.effective).not.toHaveBeenCalled()
  const unavailable = await setup({ writable: true, unavailable: true })
  expect(unavailable.router.currentRoute.value.name).toBe('entry')
  expect(unavailable.read).not.toHaveBeenCalled()
  expect(unavailable.wrapper.text()).toContain('重新读取')
})
