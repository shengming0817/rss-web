import { mount, flushPromises } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import ResourceIdentity from './ResourceIdentity.vue'
it('projects the exact version and fences a late prior-resource result without assuming system identity', async () => {
  const resource = (id: string, runAs = 'logged_in_user') => ({
    id,
    versions: [
      {
        id: '1',
        variants: [
          {
            platform: 'windows',
            architecture: 'x86_64',
            key: 'main',
            declaration: { kind: 'script', definition: { runAs } },
          },
        ],
      },
    ],
  })
  let complete!: (value: ReturnType<typeof resource>) => void
  const read = vi.fn((id: string) =>
    id === 'first'
      ? new Promise<ReturnType<typeof resource>>((resolve) => {
          complete = resolve
        })
      : Promise.resolve(resource(id)),
  )
  const binding = {
    id: 'first',
    version: '1',
    platform: 'windows' as const,
    architecture: 'x86_64' as const,
    variant: 'main',
  }
  const wrapper = mount(ResourceIdentity, {
    props: { binding },
    global: {
      plugins: [mdmI18n()],
      provide: { [mdmKey as symbol]: { policies: { resources: { read } } } },
    },
  })
  expect(wrapper.text()).toContain('精确资源版本')
  await wrapper.setProps({ binding: { ...binding, id: 'second' } })
  await flushPromises()
  expect(wrapper.text()).toContain('登录用户')
  complete(resource('first', 'system'))
  await flushPromises()
  expect(wrapper.text()).toContain('登录用户')
  await wrapper.setProps({ binding: { ...binding, id: 'second', version: 'missing' } })
  await flushPromises()
  expect(wrapper.text()).toContain('精确资源版本')
  read.mockRejectedValueOnce(new Error('unavailable'))
  await wrapper.setProps({ binding: { ...binding, id: 'third' } })
  await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  wrapper.unmount()
})
