import { ref } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { VSelect, VTextField } from 'vuetify/components'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import { catalog } from '../../../../demo/devices/fixtures'
import type { Inventory, ReadScalar } from '../clients/asset-model'
import ScalarEditor from './ScalarEditor.vue'
import ManualPanel from './ManualPanel.vue'
import AssetItems from './AssetItems.vue'
import CopyDeepLink from '../../../components/CopyDeepLink.vue'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((clean) => clean())
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

it('keeps boolean, finite decimal, zero and UTC values typed while rejecting unsafe integers', async () => {
  const wrapper = mount(ScalarEditor, {
    props: { modelValue: { kind: 'integer', value: 1 } },
    global: { plugins: [mdmI18n()] },
  })
  cleanups.push(() => wrapper.unmount())
  await wrapper.get('input').setValue('0')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ kind: 'integer', value: 0 }])
  await wrapper.get('input').setValue('9007199254740993')
  expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  expect((wrapper.get('input').element as HTMLInputElement).validity.valid).toBe(false)
  await wrapper.setProps({ modelValue: { kind: 'boolean', value: true } })
  wrapper.getComponent(VSelect).vm.$emit('update:modelValue', false)
  await flushPromises()
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ kind: 'boolean', value: false }])
  await wrapper.setProps({ modelValue: { kind: 'number', value: 0 } })
  await wrapper.get('input').setValue('0.125')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ kind: 'number', value: 0.125 }])
  await wrapper.setProps({ modelValue: { kind: 'time', value: 0 } })
  await wrapper.get('input').setValue('2026-10-20T12:00:00')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
    { kind: 'time', value: Date.parse('2026-10-20T12:00:00Z') / 1000 },
  ])
  await wrapper.setProps({ disabled: true })
  expect(wrapper.get('input').attributes('disabled')).toBeDefined()
})

it('retains readonly recursive object values, false, zero and union columns in the asset table', () => {
  const items: ReadScalar[] = [
    {
      kind: 'object',
      value: { installed: { kind: 'boolean', value: false }, count: { kind: 'integer', value: 0 } },
    },
    {
      kind: 'object',
      value: {
        nested: {
          kind: 'array',
          value: [{ kind: 'object', value: { version: { kind: 'string', value: '1.2' } } }],
        },
      },
    },
  ]
  const original = structuredClone(items)
  const wrapper = mount(AssetItems, { props: { items }, global: { plugins: [mdmI18n()] } })
  cleanups.push(() => wrapper.unmount())
  expect(wrapper.findAll('th').map((column) => column.text())).toEqual([
    'installed',
    'count',
    'nested',
  ])
  expect(wrapper.text()).toContain('否')
  expect(wrapper.text()).toContain('0')
  expect(wrapper.text()).toContain('version: 1.2')
  expect(wrapper.find('input').exists()).toBe(false)
  expect(items).toEqual(original)
})

it('locks all manual controls after an unknown result and explicitly replays the exact original request', async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ManualPanel }],
  })
  await router.push('/')
  const inventory: Inventory = {
    device: 'endpoint',
    collectionScope: { kind: 'device' },
    channels: [],
    fields: {},
    lists: {},
    quality: [],
    revisions: { 'custom.is_loaner': 7 },
  }
  const assign = vi
    .fn()
    .mockRejectedValueOnce(new Error('response lost'))
    .mockResolvedValueOnce({ revision: 8 })
  const read = vi.fn().mockResolvedValue(inventory)
  const wrapper = mount(ManualPanel, {
    props: { device: 'endpoint', inventory, fields: catalog },
    global: {
      plugins: [router, mdmI18n()],
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated' }) },
          devices: { assets: { assign, inventory: read } },
        },
      },
    },
  })
  cleanups.push(() => wrapper.unmount())
  wrapper.getComponent(VSelect).vm.$emit('update:modelValue', 'custom.is_loaner')
  await flushPromises()
  wrapper.getComponent(ScalarEditor).getComponent(VSelect).vm.$emit('update:modelValue', false)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(assign).toHaveBeenCalledTimes(1)
  const original = structuredClone(assign.mock.calls[0]!)
  expect(original[2]).toMatchObject({
    expectedRevision: 7,
    input: { action: 'set', value: { kind: 'boolean', value: false } },
  })
  expect(wrapper.findAllComponents(VSelect).every((control) => control.props('disabled'))).toBe(
    true,
  )
  const button = (text: string) =>
    wrapper.findAll('button').find((control) => control.text() === text)!
  await button('重读服务器值并比较').trigger('click')
  await flushPromises()
  expect(assign).toHaveBeenCalledTimes(1)
  await button('明确重放原操作').trigger('click')
  await flushPromises()
  expect(assign).toHaveBeenCalledTimes(2)
  expect(assign.mock.calls[1]).toEqual(original)
})

it('selects the readonly Vuetify fallback after clipboard failure and clears it on a target change', async () => {
  vi.stubGlobal('navigator', {
    clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
  })
  const wrapper = mount(CopyDeepLink, {
    attachTo: document.body,
    props: {
      target: {
        kind: 'event',
        instance: '11111111-1111-4111-8111-111111111111',
        tenant: '22222222-2222-4222-8222-222222222222',
        event: 'test.event',
        device: 'endpoint',
      },
    },
    global: {
      plugins: [mdmI18n()],
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated' }) },
        },
      },
    },
  })
  cleanups.push(() => wrapper.unmount())
  await wrapper.get('button').trigger('click')
  await flushPromises()
  const field = wrapper.getComponent(VTextField)
  expect(field.props('readonly')).toBe(true)
  const input = field.get('input').element as HTMLInputElement
  input.focus()
  expect(input.selectionStart).toBe(0)
  expect(input.selectionEnd).toBe(input.value.length)
  await wrapper.setProps({
    target: {
      kind: 'event',
      instance: '11111111-1111-4111-8111-111111111111',
      tenant: '22222222-2222-4222-8222-222222222222',
      event: 'test.event',
      device: 'other-endpoint',
    },
  })
  expect(wrapper.findComponent(VTextField).exists()).toBe(false)
})

it('keeps unknown association recovery across remount and requires confirmation before exact replay', async () => {
  const { default: AssociationPanel } = await import('./AssociationPanel.vue')
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: AssociationPanel }],
  })
  await router.push('/')
  const association = {
    id: '11111111-1111-4111-8111-111111111111',
    version: 9,
    state: 'confirmed' as const,
    members: [
      {
        device: 'mdm-endpoint',
        channel: 'mdm' as const,
        registrationId: '22222222-2222-4222-8222-222222222222',
        generation: 4,
      },
      {
        device: 'agent-endpoint',
        channel: 'agent' as const,
        registrationId: '33333333-3333-4333-8333-333333333333',
        generation: 6,
      },
    ],
    evidence: 'Original evidence',
    confirmedBy: 'operator',
    confirmedAt: 0,
    revokedBy: null,
    revokedAt: null,
    reason: null,
  }
  const revoke = vi
    .fn()
    .mockRejectedValueOnce(new Error('response lost'))
    .mockResolvedValueOnce({ ...association, state: 'revoked' })
  const runtime = {
    tenant: 'tenant',
    session: { state: ref({ status: 'authenticated', identity: { principalId: 'operator' } }) },
    operations: {
      authorization: {
        effective: vi.fn().mockResolvedValue({
          tenantId: 'tenant',
          principalId: 'operator',
          grants: [{ operation: 'device_association_write', scope: { kind: 'all_devices' } }],
        }),
      },
    },
    devices: { associations: { revoke } },
  }
  const create = () =>
    mount(AssociationPanel, {
      props: { association },
      global: { plugins: [router, mdmI18n()], provide: { [mdmKey as symbol]: runtime } },
    })
  let wrapper = create()
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  await wrapper.findAll('textarea')[1]!.setValue('Verified separate instances')
  await wrapper.get('input[type=checkbox]').setValue(true)
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '解除关联')!
    .trigger('click')
  await flushPromises()
  expect(revoke).toHaveBeenCalledTimes(1)
  const original = structuredClone(revoke.mock.calls[0]!)
  expect(original[1]).toMatchObject({ expectedVersion: 9, reason: 'Verified separate instances' })
  wrapper.unmount()
  wrapper = create()
  await flushPromises()
  const replay = () =>
    wrapper.findAll('button').find((button) => button.text() === '幂等重放原关联操作')!
  expect(replay().attributes('disabled')).toBeDefined()
  expect(
    wrapper.findAll('textarea').every((control) => control.attributes('disabled') !== undefined),
  ).toBe(true)
  await wrapper.findAll('input[type=checkbox]')[0]!.setValue(true)
  await replay().trigger('click')
  await flushPromises()
  expect(revoke).toHaveBeenCalledTimes(2)
  expect(revoke.mock.calls[1]).toEqual(original)
})
