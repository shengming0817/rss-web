import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import BootstrapView from './BootstrapView.vue'
it('keeps installation separate from registration, links the existing owner, and fences unknown dispatch', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const policy = {
    id,
    revision: 1,
    operation: id,
    definition: {
      title: 'Agent to MDM',
      scope: id,
      platform: 'windows',
      enabled: true,
      action: { kind: 'request_mdm', instructions: 'Contact support' } as {
        kind: string
        instructions?: string
      },
    },
    scopeRevision: 1,
    targets: [
      {
        device: 'device-09',
        source: { source: 'agent.builtin', registrationId: id, generation: 1 },
        admission: 'eligible',
        target: null,
        binding: 'not_applicable',
        attempt: null,
      },
    ],
  }
  const change = vi.fn().mockRejectedValue(new Error('response lost'))
  let observed = false
  const read = vi.fn(async () => ({
    ...policy,
    operation: observed ? change.mock.calls[0]?.[1].operationId : id,
  }))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: BootstrapView },
      {
        path: '/:tenant/device/:device',
        name: 'device-detail',
        component: { template: '<div />' },
      },
      { path: '/:tenant/enroll', name: 'device-enroll', component: { template: '<div />' } },
      { path: '/downloads/agent', name: 'agent-downloads', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  const wrapper = mount(BootstrapView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { SoftwareFrame: { template: '<div><slot /></div>' } },
      provide: {
        [mdmKey as symbol]: {
          tenant: id,
          demo: true,
          software: {
            bootstrap: {
              list: vi.fn().mockResolvedValue({ items: [policy], nextCursor: null }),
              read,
              change,
            },
          },
        },
      },
    },
  })
  await flushPromises()
  await wrapper.get('[data-action="open-source-policy"]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('安装回执不表示已注册')
  expect(wrapper.findAll('a').some((a) => a.attributes('href')?.includes('tab=credentials'))).toBe(
    true,
  )
  expect(
    wrapper.findAll('a').some((a) => a.attributes('href')?.includes('source=mdm.windows')),
  ).toBe(true)
  expect(wrapper.find('input[type="password"]').exists()).toBe(false)
  await wrapper.get('[data-action="source-dispatch"]').trigger('click')
  await flushPromises()
  await wrapper.get('[data-action="read-source-policy"]').trigger('click')
  await flushPromises()
  expect(
    (wrapper.get('[data-action="source-dispatch"]').element as HTMLButtonElement).disabled,
  ).toBe(true)
  observed = true
  await wrapper.get('[data-action="read-source-policy"]').trigger('click')
  await flushPromises()
  expect(
    (wrapper.get('[data-action="source-dispatch"]').element as HTMLButtonElement).disabled,
  ).toBe(false)
  policy.definition.action = { kind: 'install_agent' }
  await wrapper.get('[data-action="read-source-policy"]').trigger('click')
  await flushPromises()
  expect(wrapper.findAll('a').some((a) => a.attributes('href') === '/downloads/agent')).toBe(true)
  expect(
    wrapper.findAll('a').some((a) => a.attributes('href')?.includes('source=agent.builtin')),
  ).toBe(false)
  expect(change).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})
