import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import VersionAdmission from './VersionAdmission.vue'
it('does not settle unknown approval from an unrelated approval receipt', async () => {
  const initial = { resource: 'app', version: '1', resourceDigest: [], admission: null }
  const version = vi.fn().mockResolvedValue(initial),
    changeVersion = vi.fn().mockRejectedValue(new Error('lost response'))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: VersionAdmission }],
  })
  await router.push('/')
  const wrapper = mount(VersionAdmission, {
    props: { resource: 'app', version: '1' },
    global: {
      plugins: [router, mdmI18n()],
      provide: { [mdmKey as symbol]: { software: { admission: { version, changeVersion } } } },
    },
  })
  await flushPromises()
  await wrapper.get('textarea').setValue('reviewed')
  const button = (text: string) => wrapper.findAll('button').find((b) => b.text() === text)!
  await button('批准企业准入').trigger('click')
  await flushPromises()
  const operation = changeVersion.mock.calls[0]![2].operationId
  version.mockResolvedValue({
    ...initial,
    admission: { state: 'approved', evidence: ['other approval'], operation: 'other', revision: 1 },
  })
  await button('核对状态').trigger('click')
  await flushPromises()
  expect(wrapper.get('textarea').attributes('disabled')).toBeDefined()
  version.mockResolvedValue({
    ...initial,
    admission: { state: 'approved', evidence: ['reviewed'], operation, revision: 1 },
  })
  await button('核对状态').trigger('click')
  await flushPromises()
  expect(wrapper.get('textarea').attributes('disabled')).toBeUndefined()
  expect(changeVersion).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})
