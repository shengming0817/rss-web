import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { shallowRef } from 'vue'
import { webcrypto } from 'node:crypto'
import { mdmI18n } from '../../../i18n'
import { mdmKey } from '../../../context'
import ValueMappingEditor from './ValueMappingEditor.vue'
import CollectionMappings from './CollectionMappings.vue'
import CollectionVersionEditor from './CollectionVersionEditor.vue'
import FieldTypeEditor from '../../telemetry/components/FieldTypeEditor.vue'
import { identityMapping } from '../collection-draft'
import { decodeResource } from '../clients/resources'
import { fieldDefinition } from '../../devices/clients/assets'
import blueprints from '../../../../demo/policies/blueprints.json'
import type { ValueMapping } from '../../../contracts/collection/generated/ResourceWrite'
const wrappers: VueWrapper[] = []
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  vi.unstubAllGlobals()
})
const field = (key = 'custom.extra') =>
  fieldDefinition({
    key,
    timeSeries: null,
    version: 1,
    valueType: { kind: 'string', allowEmpty: false, maxLength: 256 },
    nullable: true,
    manual: false,
    sources: { 'mdm.windows': 0 },
    platforms: ['windows'],
    sensitivity: 'standard',
    unit: null,
    searchable: false,
    itemKey: null,
    operations: [],
  })
const label = (w: VueWrapper, text: string) =>
  w.findAll('label').find((l) => l.text().startsWith(text))!
it('edits declared conversions, safe integer ratios, exact codes and nested columns without JSON', async () => {
  const update = (value: ValueMapping) => {
    void wrapper.setProps({ modelValue: value })
  }
  const wrapper = mount(ValueMappingEditor, {
    props: {
      modelValue: identityMapping(''),
      valueType: {
        kind: 'array',
        maxItems: 100,
        items: {
          kind: 'record',
          properties: {
            name: {
              required: true,
              valueType: { kind: 'string', maxLength: 256, allowEmpty: false },
            },
          },
        },
      },
      'onUpdate:modelValue': update,
    },
    global: { plugins: [mdmI18n()] },
  })
  wrappers.push(wrapper)
  const select = () => label(wrapper, '类型转换').get('select')
  await select().setValue('scale')
  await label(wrapper, '分子').get('input').setValue('9007199254740993')
  expect(
    (label(wrapper, '分子').get('input').element as HTMLInputElement).validationMessage,
  ).not.toBe('')
  await label(wrapper, '分子').get('input').setValue('1024')
  expect(wrapper.props('modelValue').conversion).toEqual({
    kind: 'scale',
    numerator: 1024,
    denominator: 1,
  })
  await select().setValue('array_member')
  await label(wrapper, '数组成员').get('input').setValue('7')
  expect(wrapper.props('modelValue').conversion).toMatchObject({ kind: 'array_member', member: 7 })
  for (const kind of ['enum', 'bitmask']) {
    await select().setValue(kind)
    await label(wrapper, '原始代码')
      .get('input')
      .setValue(kind === 'enum' ? 'active' : '3')
    await label(wrapper, '目标值').get('input').setValue('running')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '添加转换项')!
      .trigger('click')
    if (kind === 'bitmask') {
      expect(wrapper.find('[role=alert]').exists()).toBe(true)
      await label(wrapper, '原始代码').get('input').setValue('2')
      await wrapper
        .findAll('button')
        .find((b) => b.text() === '添加转换项')!
        .trigger('click')
    }
    expect(wrapper.text()).toContain('running')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '移除字段映射')!
      .trigger('click')
  }
  await select().setValue('identity')
  await label(wrapper, '输出属性').get('select').setValue('name')
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '添加属性映射')!
    .trigger('click')
  expect(wrapper.props('modelValue').columns.name!.pointer).toBe('/name')
  expect(wrapper.findAllComponents(ValueMappingEditor)).toHaveLength(1)
})
it('authors scalar and structured list field types using controls', async () => {
  const wrapper = mount(FieldTypeEditor, {
    props: {
      modelValue: { kind: 'number' },
      'onUpdate:modelValue': (value) => {
        void wrapper.setProps({ modelValue: value })
      },
    },
    global: { plugins: [mdmI18n()] },
  })
  wrappers.push(wrapper)
  for (const kind of ['string', 'integer', 'boolean', 'time', 'enum', 'record', 'array']) {
    await wrapper.find('select').setValue(kind)
    expect(wrapper.props('modelValue').kind).toBe(kind)
    if (kind === 'enum') {
      await label(wrapper, '状态词汇').get('input').setValue('ready')
      await wrapper
        .findAll('button')
        .find((b) => b.text() === '添加转换项')!
        .trigger('click')
      expect(wrapper.props('modelValue')).toMatchObject({ kind: 'enum', values: ['ready'] })
    }
    if (kind === 'record') {
      await label(wrapper, '输出属性').get('input').setValue('identifier')
      await wrapper
        .findAll('button')
        .find((b) => b.text() === '添加属性')!
        .trigger('click')
      expect(wrapper.props('modelValue')).toMatchObject({
        kind: 'record',
        properties: { identifier: { required: true } },
      })
    }
  }
  expect(wrapper.props('modelValue')).toMatchObject({
    kind: 'array',
    items: { properties: { id: { required: true } } },
  })
})
async function context() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<p />' } }],
  })
  await router.push('/')
  const catalog = vi.fn(async () => ({
    fields: [field(), { ...field('custom.secret'), sensitivity: 'secret' as const }],
  }))
  return {
    catalog,
    global: {
      plugins: [router, mdmI18n()],
      provide: {
        [mdmKey as symbol]: {
          tenant: '11111111-1111-4111-8111-111111111111',
          session: {
            state: shallowRef({
              status: 'authenticated',
              tenant: '11111111-1111-4111-8111-111111111111',
              session: { id: 'session' },
              identity: { principalId: 'principal' },
            }),
          },
          devices: { assets: { catalog } },
        },
      },
    },
  }
}

it('selects available catalog fields and removes only the selected draft mapping', async () => {
  const c = await context()
  const wrapper = mount(CollectionMappings, {
    props: {
      modelValue: {},
      source: 'mdm.windows',
      platform: 'windows',
      'onUpdate:modelValue': (value) => {
        void wrapper.setProps({ modelValue: value })
      },
    },
    global: c.global,
  })
  wrappers.push(wrapper)
  await flushPromises()
  expect(wrapper.find('option[value="custom.secret"]').exists()).toBe(false)
  await wrapper.get('select').setValue('custom.extra')
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '添加字段映射')!
    .trigger('click')
  expect(wrapper.props('modelValue')['custom.extra']).toEqual(identityMapping(''))
  expect(wrapper.text()).toContain('custom.extra')
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '移除字段映射')!
    .trigger('click')
  expect(wrapper.props('modelValue')).toEqual({})
})
it('preserves all variants and emits regenerated artifact bytes for a new collection version', async () => {
  vi.stubGlobal('crypto', webcrypto)
  const c = await context(),
    p = blueprints.packages.find((p) => p.id === 'windows.identity')!
  const declaration = {
    kind: 'native_collection',
    definition: JSON.parse(p.content),
    artifact: {
      reference: p.reference,
      length: new TextEncoder().encode(p.content).length,
      sha256: p.sha256,
    },
  }
  const resource = decodeResource(
    {
      id: 'resource',
      revision: 2,
      kind: 'native_collection',
      presentation: { name: 'Identity' },
      origin: null,
      versions: [
        {
          id: '1',
          state: 'active',
          digest: p.versionDigest,
          variants: [
            { platform: 'windows', architecture: 'x86_64', key: 'main', declaration },
            { platform: 'windows', architecture: 'aarch64', key: 'main', declaration },
          ],
        },
      ],
    },
    'resource',
  )
  const wrapper = mount(CollectionVersionEditor, {
    props: { resource, locked: false },
    global: c.global,
  })
  wrappers.push(wrapper)
  await label(wrapper, '基准版本').get('select').setValue('1')
  await label(wrapper, '新版本').get('input').setValue('2')
  await flushPromises()
  const picker = wrapper.findComponent(CollectionMappings)
  await picker.get('select').setValue('custom.extra')
  await picker
    .findAll('button')
    .find((b) => b.text() === '添加字段映射')!
    .trigger('click')
  const physical = label(wrapper, 'custom.extra · 物理读取来源').get('select')
  await physical.setValue((physical.findAll('option')[1]!.element as HTMLOptionElement).value)
  await wrapper.get('[data-testid=value-mapping] input').setValue('/value')
  await wrapper.get('form').trigger('submit')
  await vi.waitFor(() => expect(wrapper.emitted('prepare')).toHaveLength(1))
  const [input, files] = wrapper.emitted('prepare')![0] as [
    { variants: { declaration: { artifact: { sha256: number[]; length: number } } }[] },
    { file: File; target: { version: string } }[],
  ]
  expect(input.variants).toHaveLength(2)
  expect(files).toHaveLength(2)
  expect(input.variants[0]!.declaration.artifact.sha256).not.toEqual(p.sha256)
  expect(files[0]!.file.size).toBe(input.variants[0]!.declaration.artifact.length)
  expect(files[1]!.target.version).toBe('2')
  expect(input.variants[1]!.declaration).toEqual(input.variants[0]!.declaration)
})
it.each([
  blueprints.packages.find((p) => p.id === 'windows.identity')!,
  {
    ...blueprints.packages.find((p) => p.id === 'windows.identity')!,
    id: 'synthetic.apple-applications',
    platform: 'macos',
    content: JSON.stringify({
      ...JSON.parse(blueprints.packages.find((p) => p.id === 'windows.identity')!.content),
      adapter: 'apple_installed_applications',
      mappings: { 'custom.existing': { query: '', mapping: identityMapping('') } },
    }),
  },
])('can add a new mapping after deleting all mappings from $id', async (p) => {
  const c = await context()
  const d = {
    kind: 'native_collection',
    definition: JSON.parse(p.content),
    artifact: {
      reference: p.reference,
      length: new TextEncoder().encode(p.content).length,
      sha256: p.sha256,
    },
  }
  const resource = decodeResource(
    {
      id: 'resource',
      revision: 1,
      kind: 'native_collection',
      presentation: {},
      origin: null,
      versions: [
        {
          id: '1',
          state: 'active',
          digest: p.versionDigest,
          variants: [{ platform: p.platform, architecture: 'x86_64', key: 'main', declaration: d }],
        },
      ],
    },
    'resource',
  )
  const wrapper = mount(CollectionVersionEditor, {
    props: { resource, locked: false },
    global: c.global,
  })
  wrappers.push(wrapper)
  await label(wrapper, '基准版本').get('select').setValue('1')
  await flushPromises()
  const mapper = wrapper.findComponent(CollectionMappings)
  mapper.vm.$emit('update:modelValue', {})
  await flushPromises()
  mapper.vm.$emit('update:modelValue', { 'custom.extra': identityMapping('') })
  await flushPromises()
  expect(wrapper.findAllComponents(ValueMappingEditor)).toHaveLength(1)
  const query = label(wrapper, 'custom.extra · 物理读取来源').get('select')
  expect((query.element as HTMLSelectElement).value).toBe('')
  expect(query.findAll('option')).toHaveLength(
    1 +
      new Set(
        Object.values(d.definition.mappings).map((m: unknown) =>
          JSON.stringify((m as { query: unknown }).query),
        ),
      ).size,
  )
})
