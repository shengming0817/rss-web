import { mount, flushPromises } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { defineComponent, ref, toRaw } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import SelfServiceSelectors from './SelfServiceSelectors.vue'
import type { SelfServiceSelector } from '../clients/self-service-access'
const id = '11111111-1111-4111-8111-111111111111'
const source = { providerId: id, issuer: 'https://idp.example.test', configurationVersion: 1 }
it('adds fixed user, department and active static group selections, rejects duplicates and unavailable departments', async () => {
  const effective = vi.fn(async () => ({ instanceId: id }))
  const groups = vi.fn(async () => ({
    items: [{ id, value: { name: 'Engineering', enabled: true } }],
    nextCursor: null,
  }))
  const departments = vi.fn(async () => ({
    status: 'available',
    source,
    snapshot: { nodes: [{ id: 'engineering', displayName: 'Engineering' }] },
  }))
  const selections = ref<SelfServiceSelector[]>([])
  const Host = defineComponent({
    components: { SelfServiceSelectors },
    setup: () => ({ selections }),
    template: '<SelfServiceSelectors v-model="selections" />',
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: Host }],
  })
  await router.push('/')
  const wrapper = mount(Host, {
    global: {
      plugins: [mdmI18n(), router],
      stubs: {
        TenantUserSelect: {
          template:
            "<button data-user @click=\"$emit('update:modelValue', '" + id + '\')">User</button>',
        },
      },
      provide: {
        [mdmKey as symbol]: {
          tenant: id,
          operations: { authorization: { effective, groups, departments } },
        },
      },
    },
  })
  await flushPromises()
  const add = () =>
    wrapper
      .findAll('button')
      .find((b) => b.text() === '添加')!
      .trigger('click')
  await wrapper.get('[data-user]').trigger('click')
  await add()
  expect(selections.value).toEqual([
    { kind: 'user', instanceId: id, tenantId: id, principalId: id },
  ])
  await add()
  expect(selections.value).toHaveLength(1)
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  await wrapper.get('select[id$="-kind"]').setValue('department')
  await flushPromises()
  await wrapper.get('select[id$="-department"]').setValue('engineering')
  await wrapper.get('select[id$="-matching"]').setValue('subtree')
  await add()
  expect(selections.value[1]).toEqual({
    kind: 'department',
    source,
    id: 'engineering',
    matching: 'subtree',
  })
  await wrapper.get('select[id$="-kind"]').setValue('user_group')
  await flushPromises()
  await wrapper.get('select[id$="-group"]').setValue(id)
  await add()
  expect(selections.value[2]).toEqual({ kind: 'user_group', id })
  expect(() => structuredClone(toRaw(selections.value))).not.toThrow()
  await wrapper.findAll('li')[0]!.get('button').trigger('click')
  expect(() => structuredClone(toRaw(selections.value))).not.toThrow()
  departments.mockRejectedValueOnce(new Error('not configured'))
  await wrapper.get('select[id$="-kind"]').setValue('department')
  await flushPromises()
  await add()
  expect(selections.value).toHaveLength(2)
  wrapper.unmount()
})
