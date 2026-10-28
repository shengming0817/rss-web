import { selectControl, hasChoice } from '../vuetify-test-controls'
import { createFeatureRouter as createRouter } from '../../../../tests/feature-router'
import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { shallowRef } from 'vue'
import { webcrypto } from 'node:crypto'
import { mdmI18n } from '../../../i18n'
import { mdmKey } from '../../../context'
import ValueMappingEditor from './ValueMappingEditor.vue'
import CollectionMappings from './CollectionMappings.vue'
import ScriptDefinitionEditor from './ScriptDefinitionEditor.vue'
import CollectionVersionEditor from './CollectionVersionEditor.vue'
import FieldTypeEditor from '../../telemetry/components/FieldTypeEditor.vue'
import { identityMapping } from '../collection-draft'
import { decodeResource, decodeScriptSpec, type ScriptSpec } from '../clients/resources'
import { fieldDefinition } from '../../devices/clients/assets'
import blueprints from '../../../../demo/policies/blueprints.json'
import type { ValueMapping } from '@rss/api/mdm-types'
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
    attachTo: document.body,
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
  const select = () => selectControl(label(wrapper, '类型转换'))
  await select().setValue('scale')
  await label(wrapper, '分子')
    .get('input:not([type=hidden]):not([role=combobox])')
    .setValue('9007199254740993')
  expect(
    (
      label(wrapper, '分子').get('input:not([type=hidden]):not([role=combobox])')
        .element as HTMLInputElement
    ).validationMessage,
  ).not.toBe('')
  await label(wrapper, '分子').get('input:not([type=hidden]):not([role=combobox])').setValue('1024')
  expect(wrapper.props('modelValue').conversion).toEqual({
    kind: 'scale',
    numerator: 1024,
    denominator: 1,
  })
  await select().setValue('array_member')
  await label(wrapper, '数组成员')
    .get('input:not([type=hidden]):not([role=combobox])')
    .setValue('7')
  expect(wrapper.props('modelValue').conversion).toMatchObject({ kind: 'array_member', member: 7 })
  for (const kind of ['enum', 'bitmask']) {
    await select().setValue(kind)
    await label(wrapper, '原始代码')
      .get('input:not([type=hidden]):not([role=combobox])')
      .setValue(kind === 'enum' ? 'active' : '3')
    await label(wrapper, '目标值')
      .get('input:not([type=hidden]):not([role=combobox])')
      .setValue('running')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '添加转换项')!
      .trigger('click')
    if (kind === 'bitmask') {
      expect(wrapper.find('[role=alert]').exists()).toBe(true)
      await label(wrapper, '原始代码')
        .get('input:not([type=hidden]):not([role=combobox])')
        .setValue('2')
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
  await selectControl(label(wrapper, '输出属性')).setValue('name')
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '添加属性映射')!
    .trigger('click')
  expect(wrapper.props('modelValue').columns.name!.pointer).toBe('/name')
  expect(wrapper.findAllComponents(ValueMappingEditor)).toHaveLength(1)
  await wrapper
    .get('[data-testid=value-mapping] [data-testid=value-mapping] input')
    .setValue('/display_name')
  expect(wrapper.props('modelValue').columns.name!.pointer).toBe('/display_name')
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '移除字段映射')!
    .trigger('click')
  expect(wrapper.props('modelValue')).toMatchObject({ pointer: '', columns: {} })
})
it('authors scalar and structured list field types using controls', async () => {
  const wrapper = mount(FieldTypeEditor, {
    attachTo: document.body,
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
    await selectControl(wrapper, 'select').setValue(kind)
    expect(wrapper.props('modelValue').kind).toBe(kind)
    if (kind === 'enum') {
      await label(wrapper, '状态词汇')
        .get('input:not([type=hidden]):not([role=combobox])')
        .setValue('ready')
      await wrapper
        .findAll('button')
        .find((b) => b.text() === '添加转换项')!
        .trigger('click')
      expect(wrapper.props('modelValue')).toMatchObject({ kind: 'enum', values: ['ready'] })
    }
    if (kind === 'record') {
      await label(wrapper, '输出属性')
        .get('input:not([type=hidden]):not([role=combobox])')
        .setValue('identifier')
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
    attachTo: document.body,
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
  const fields = selectControl(wrapper, 'select')
  expect(hasChoice(fields, 'custom.extra')).toBe(true)
  expect(hasChoice(fields, 'custom.secret')).toBe(false)
  await fields.setValue('custom.extra')
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
    attachTo: document.body,
    props: { resource, locked: false },
    global: c.global,
  })
  wrappers.push(wrapper)
  await selectControl(label(wrapper, '基准版本')).setValue('1')
  await label(wrapper, '新版本').get('input:not([type=hidden]):not([role=combobox])').setValue('2')
  await flushPromises()
  const picker = wrapper.findComponent(CollectionMappings)
  await selectControl(picker, 'select').setValue('custom.extra')
  await picker
    .findAll('button')
    .find((b) => b.text() === '添加字段映射')!
    .trigger('click')
  const physical = selectControl(label(wrapper, 'custom.extra · 物理读取来源'))
  await physical.setValue((physical.props('items') as { value: string }[])[1]!.value)
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
    attachTo: document.body,
    props: { resource, locked: false },
    global: c.global,
  })
  wrappers.push(wrapper)
  await selectControl(label(wrapper, '基准版本')).setValue('1')
  await flushPromises()
  const mapper = wrapper.findComponent(CollectionMappings)
  mapper.vm.$emit('update:modelValue', {})
  await flushPromises()
  mapper.vm.$emit('update:modelValue', { 'custom.extra': identityMapping('') })
  await flushPromises()
  expect(wrapper.findAllComponents(ValueMappingEditor)).toHaveLength(1)
  const query = selectControl(label(wrapper, 'custom.extra · 物理读取来源'))
  expect(query.props('modelValue')).toBe('')
  expect(query.props('items')).toHaveLength(
    1 +
      new Set(
        Object.values(d.definition.mappings).map((m: unknown) =>
          JSON.stringify((m as { query: unknown }).query),
        ),
      ).size,
  )
})

it('authors a script, switches to osquery collection and preserves edited catalog mappings in the generated contract', async () => {
  const c = await context()
  c.catalog.mockResolvedValue({
    fields: [{ ...field('custom.osquery.version'), sources: { 'agent.osquery': 0 } }],
  })
  const model: ScriptSpec = {
    profile: 'power_shell7',
    sql: null,
    runAs: 'system',
    encoding: 'utf8',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    bindings: {},
    output: { type: 'object', properties: {}, additionalProperties: false },
    purpose: { kind: 'action' },
    timeoutSeconds: 60,
    outputBytes: 16384,
    maxRows: 1,
  }
  const wrapper = mount(ScriptDefinitionEditor, {
    attachTo: document.body,
    props: {
      modelValue: model,
      'onUpdate:modelValue': (value) => {
        void wrapper.setProps({ modelValue: value })
      },
    },
    global: c.global,
  })
  wrappers.push(wrapper)
  await selectControl(wrapper, '[id$="-profile"]').setValue('bash')
  await selectControl(wrapper, '[id$="-run-as"]').setValue('logged_in_user')
  await wrapper.get('input[id$="-timeout"]').setValue(90)
  await wrapper.get('input[id$="-bytes"]').setValue(32768)
  await wrapper.get('input[id$="-rows"]').setValue(2)
  await wrapper
    .get('textarea[id$="-output"]')
    .setValue(JSON.stringify({ type: 'string', maxLength: 64 }))
  await wrapper.get('textarea[id$="-bindings"]').setValue('{}')
  expect(decodeScriptSpec(wrapper.props('modelValue'))).toMatchObject({
    profile: 'bash',
    sql: null,
    runAs: 'logged_in_user',
    timeoutSeconds: 90,
    outputBytes: 32768,
    maxRows: 2,
    output: { type: 'string', maxLength: 64 },
  })
  await selectControl(wrapper, '[id$="-profile"]').setValue('osquery')
  await flushPromises()
  expect(c.catalog).toHaveBeenCalled()
  expect(wrapper.props('modelValue')).toMatchObject({
    profile: 'osquery',
    sql: 'SELECT version FROM osquery_info',
    runAs: 'system',
    purpose: {
      kind: 'collection',
      mappings: { 'custom.osquery.version': identityMapping('/0/version') },
    },
  })
  await wrapper.get('[data-testid=value-mapping] input').setValue('/0/reported_version')
  const definition = decodeScriptSpec(wrapper.props('modelValue'))
  expect(definition.purpose).toMatchObject({
    kind: 'collection',
    mappings: { 'custom.osquery.version': identityMapping('/0/reported_version') },
  })
  await wrapper
    .findComponent(CollectionMappings)
    .findAll('button')
    .find((b) => b.text() === '移除字段映射')!
    .trigger('click')
  expect(wrapper.props('modelValue').purpose).toMatchObject({ kind: 'collection', mappings: {} })
  await wrapper.get('input[type=checkbox]').setValue(false)
  expect(wrapper.props('modelValue').purpose).toEqual({ kind: 'action' })
  expect(wrapper.find('[data-testid=collection-mappings]').exists()).toBe(false)
  await wrapper.get('input[type=checkbox]').setValue(true)
  expect(wrapper.props('modelValue').purpose).toMatchObject({ kind: 'collection', mappings: {} })
})
