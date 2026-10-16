import { expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { identityI18n } from './i18n'
import { runtimeKey } from './context'
import { fixture } from '../tests/support'
import { useSessionLifecycle } from './useSessionLifecycle'
it('observes trusted activity at document capture for portal content and removes its listeners', async () => {
  const f = fixture(false),
    activity = vi.spyOn(f.session, 'activity').mockResolvedValue(undefined)
  const add = vi.spyOn(document, 'addEventListener'),
    remove = vi.spyOn(document, 'removeEventListener')
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: {} }],
  })
  await router.push('/')
  const Host = defineComponent({
    setup() {
      useSessionLifecycle()
    },
    template: '<div><Teleport to="body"><button data-portal>Portal task</button></Teleport></div>',
  })
  const wrapper = mount(Host, {
    global: { plugins: [router, identityI18n()], provide: { [runtimeKey as symbol]: f } },
  })
  const pointer = add.mock.calls.find(
    ([type, , capture]) => type === 'pointerdown' && capture === true,
  )![1] as EventListener
  const key = add.mock.calls.find(
    ([type, , capture]) => type === 'keydown' && capture === true,
  )![1] as EventListener
  document
    .querySelector('[data-portal]')!
    .dispatchEvent(new Event('pointerdown', { bubbles: true }))
  expect(activity).not.toHaveBeenCalled()
  pointer({ isTrusted: true } as Event)
  key({ isTrusted: true } as Event)
  expect(activity).toHaveBeenCalledTimes(2)
  wrapper.unmount()
  expect(remove).toHaveBeenCalledWith('pointerdown', pointer, true)
  expect(remove).toHaveBeenCalledWith('keydown', key, true)
  f.session.clear()
  router.options.history.destroy()
  vi.restoreAllMocks()
})
