import { VSelect, VTextField, VTextarea } from 'vuetify/components'
import { createFeatureRouter as createRouter } from '../../../../tests/feature-router'
import { decodeMdmError } from '@rss/api/mdm'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref, type Component } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { expect, it, onTestFinished, vi } from 'vitest'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import SourcesView from './SourcesView.vue'
import PublicationsView from './PublicationsView.vue'
import ImportsView from './ImportsView.vue'
import CatalogView from './CatalogView.vue'
import VersionLifecycle from '../components/VersionLifecycle.vue'
import SoftwareResourceSelect from '../components/SoftwareResourceSelect.vue'
import { operation, request, softwareResource } from '../../../../demo/software/fixtures'
const id = '11111111-1111-4111-8111-111111111111',
  sha = Array<number>(32).fill(1)
const life = { revision: 1, state: 'enabled', operation: id, actor: 'operator', at: 1, digest: sha }
const source = {
  id: 'enterprise',
  revision: '1',
  protocol: 'private',
  state: 'enabled',
  source: { id: 'enterprise', revision: '1', protocol: { kind: 'private' } },
  snapshot: { id: 'enterprise', revision: '1', sha256: sha },
  lifecycle: life,
}
function publication(outcome = 'pending') {
  return {
    id,
    revision: 1,
    target: 'internal',
    resource: 'app',
    version: '1',
    publication: sha,
    contentDigest: sha,
    manifestDigest: sha,
    targetDigest: sha,
    attempt: 1,
    outcome,
    withdrawn: false,
    withdrawal: null,
  }
}
async function fixture(component: Component, owners: object, props = {}, query = {}, path = '/') {
  const session = ref({
    status: 'authenticated',
    tenant: id,
    identity: { principalId: id },
    session: { id },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:execution?', component }],
  })
  await router.push({ path, query })
  const wrapper = mount(component, {
    attachTo: document.body,
    props,
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: { template: '<a><slot /></a>' }, CatalogLocator: true },
      provide: { [mdmKey as symbol]: { tenant: id, session: { state: session }, ...owners } },
    },
  })
  await flushPromises()
  return { wrapper, session, router }
}
const button = (w: VueWrapper, name: string) => w.findAll('button').find((b) => b.text() === name)!
const field = (w: VueWrapper, text: string) => {
  const controls = [
    ...w.findAllComponents(VSelect),
    ...w.findAllComponents(VTextField),
    ...w.findAllComponents(VTextarea),
  ]
  const control = controls.find((s) => String(s.props().label).startsWith(text))
  if (!control) throw new Error(`Missing software field: ${text}`)
  return control
}
it('registers a source directly and uses the displayed lifecycle CAS for disable and enable', async () => {
  const changeSource = vi.fn(async (_id, _revision, body) => ({
    ...source,
    lifecycle: {
      ...life,
      state: body.input.action === 'disable' ? 'disabled' : 'enabled',
      revision: body.expectedRevision + 1,
      operation: body.operationId,
    },
  }))
  const { wrapper } = await fixture(SourcesView, {
    software: {
      lifecycle: {
        sources: vi.fn(async () => ({ items: [source], nextCursor: null })),
        source: vi.fn(async () => source),
        changeSource,
      },
    },
  })
  await field(wrapper, '企业来源 ID').setValue('enterprise')
  await wrapper.findAll('form')[1]!.trigger('submit')
  await flushPromises()
  expect(changeSource.mock.calls[0]).toMatchObject([
    'enterprise',
    '1',
    { expectedRevision: 0, input: { action: 'register', definition: source.source } },
  ])
  await button(wrapper, '停用').trigger('click')
  await flushPromises()
  expect(changeSource.mock.calls[1]?.[2]).toMatchObject({
    expectedRevision: 1,
    input: { action: 'disable' },
  })
  await button(wrapper, '启用').trigger('click')
  await flushPromises()
  expect(changeSource.mock.calls[2]?.[2]).toMatchObject({
    expectedRevision: 2,
    input: { action: 'enable' },
  })
  wrapper.unmount()
})
it('does not unlock an unknown source write from an unrelated read or replay it after session changes', async () => {
  const changeSource = vi.fn().mockRejectedValue(new Error('lost')),
    read = vi.fn().mockResolvedValue(source)
  const { wrapper, session } = await fixture(SourcesView, {
    software: {
      lifecycle: {
        sources: vi.fn(async () => ({ items: [], nextCursor: null })),
        source: read,
        changeSource,
      },
    },
  })
  await field(wrapper, '企业来源 ID').setValue('enterprise')
  await wrapper.findAll('form')[0]!.trigger('submit')
  await flushPromises()
  await button(wrapper, '停用').trigger('click')
  await flushPromises()
  await button(wrapper, '核对状态').trigger('click')
  await flushPromises()
  expect(button(wrapper, '停用').attributes('disabled')).toBeDefined()
  const sourceCard = () =>
    wrapper.findAll('.v-card').find((card) => card.find('.v-card-title').exists())
  expect(sourceCard()?.get('.v-card-title').text()).toBe('enterprise / 1')
  expect(sourceCard()?.text()).toContain(life.operation)
  session.value = { ...session.value, identity: { principalId: crypto.randomUUID() } }
  await flushPromises()
  expect(sourceCard()).toBeUndefined()
  expect(changeSource).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})
it('publishes the exact resource and target then recovers without client attempt coordinates', async () => {
  const publish = vi.fn(async (_body: unknown) => publication()),
    change = vi.fn(async (_id: string, _body: unknown) => publication('published'))
  const { wrapper } = await fixture(PublicationsView, {
    policies: { resources: { read: vi.fn(async () => ({ kind: 'software', revision: 7 })) } },
    software: {
      lifecycle: { version: vi.fn(async () => ({ resourceDigest: sha })) },
      publication: {
        publish,
        change,
        list: vi.fn(async () => ({ items: [], nextCursor: null })),
        targets: vi.fn(async () => ({
          items: [{ id: 'internal', digest: sha, protocol: 'winget' }],
          nextCursor: null,
        })),
      },
    },
  })
  const picker = wrapper.findComponent(SoftwareResourceSelect)
  picker.vm.$emit('update:resource', 'app')
  picker.vm.$emit('update:version', '1')
  await button(wrapper, '读取实际目标').trigger('click')
  await flushPromises()
  await field(wrapper, '发布目标 ID').setValue('internal')
  await wrapper.get('[data-testid=publication-create]').trigger('submit')
  await flushPromises()
  expect(publish.mock.calls[0]?.[0]).toMatchObject({
    expectedRevision: 0,
    input: {
      action: 'publish',
      resource: 'app',
      version: '1',
      expectedResourceRevision: 7,
      resourceDigest: sha,
      target: 'internal',
      targetDigest: sha,
    },
  })
  await button(wrapper, '恢复发布操作').trigger('click')
  await flushPromises()
  expect(change.mock.calls[0]).toMatchObject([
    id,
    { expectedRevision: 1, input: { action: 'recover' } },
  ])
  expect(wrapper.text()).toContain('已发布')
  wrapper.unmount()
})
for (const outcome of ['published', 'not_applied'])
  it(`keeps an unknown write locked through a terminal ${outcome} lookup and replays only its confirmed original body`, async () => {
    const change = vi
        .fn()
        .mockRejectedValueOnce(new Error('lost'))
        .mockResolvedValue(publication(outcome)),
      list = vi.fn(async () => ({ items: [publication()], nextCursor: null })),
      read = vi.fn().mockResolvedValueOnce(publication()).mockResolvedValue(publication(outcome))
    const { wrapper, session } = await fixture(PublicationsView, {
      software: { publication: { change, list, read } },
    })
    await button(wrapper, 'app / 1').trigger('click')
    await flushPromises()
    await button(wrapper, '恢复发布操作').trigger('click')
    await flushPromises()
    const original = structuredClone(change.mock.calls[0])
    await button(wrapper, '查询原操作').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid=publication-unknown]').exists()).toBe(true)
    expect(button(wrapper, '恢复发布操作')).toBeUndefined()
    expect(button(wrapper, '撤回').attributes('disabled')).toBeDefined()
    if (outcome === 'not_applied')
      expect(button(wrapper, '重试').attributes('disabled')).toBeDefined()
    expect(change).toHaveBeenCalledTimes(1)
    await wrapper.get('[data-testid=publication-unknown] input[type=checkbox]').setValue(true)
    await button(wrapper, '重放同一操作').trigger('click')
    await flushPromises()
    expect(change.mock.calls[1]).toEqual(original)
    session.value = { ...session.value, session: { id: crypto.randomUUID() } }
    await flushPromises()
    expect(wrapper.find('[data-testid=publication-detail]').exists()).toBe(false)
    wrapper.unmount()
  })
it('pins source and complete import operation across a lost response and explicit replay', async () => {
  const imported = vi.fn().mockRejectedValue(new Error('lost')),
    { definition } = softwareResource()
  const selected = {
    ...source,
    source: {
      ...source.source,
      protocol: { kind: 'winget_rest', location: 'https://source.test/', identifier: 'enterprise' },
    },
  }
  const { wrapper, session } = await fixture(ImportsView, {
    software: {
      lifecycle: {
        sources: vi.fn(async () => ({ items: [selected], nextCursor: null })),
        source: vi.fn().mockResolvedValue(selected),
      },
      imports: { import: imported },
    },
    policies: { resources: { read: vi.fn().mockResolvedValue({ id: 'app', revision: 1 }) } },
  })
  await field(wrapper, '企业来源 ID').setValue('enterprise/1')
  await flushPromises()
  await button(wrapper, '继续').trigger('click')
  await field(wrapper, '软件资源').setValue('app')
  await field(wrapper, '包标识').setValue('Example.App')
  await field(wrapper, '来源包版本').setValue('1.0')
  await field(wrapper, '原生安装行为').setValue(JSON.stringify(definition.behavior))
  await button(wrapper, '继续').trigger('click')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  const original = structuredClone(imported.mock.calls[0]?.[0])
  expect(original).toMatchObject({
    expectedRevision: 0,
    input: { source: source.snapshot, resource: 'app', selection: { installerType: 'msi' } },
  })
  await button(wrapper, '核实状态').trigger('click')
  await flushPromises()
  expect(button(wrapper, '导入').element.matches(':disabled')).toBe(true)
  expect(imported).toHaveBeenCalledTimes(1)
  await wrapper.get('section[role=status] input[type=checkbox]').setValue(true)
  await button(wrapper, '重放同一操作').trigger('click')
  await flushPromises()
  expect(imported.mock.calls[1]?.[0]).toEqual(original)
  session.value = { ...session.value, session: { id: crypto.randomUUID() } }
  await flushPromises()
  expect(wrapper.find('section[role=status]').exists()).toBe(false)
  expect(imported).toHaveBeenCalledTimes(2)
  wrapper.unmount()
})
it('uses Resource pages and reads versions only after selection without inventing directory metadata', async () => {
  const list = vi.fn().mockResolvedValue({
      items: [
        {
          id: 'app',
          presentation: { name: 'Example App' },
          revision: 2,
          kind: 'software',
          activeVersion: '1',
        },
      ],
      nextCursor: 'YXBw',
    }),
    read = vi.fn().mockResolvedValue({
      id: 'app',
      presentation: {},
      origin: null,
      revision: 2,
      kind: 'software',
      versions: [],
    })
  const { wrapper, session } = await fixture(CatalogView, {
    policies: { resources: { list, read } },
  })
  expect(list).toHaveBeenCalledWith(
    expect.objectContaining({ cursor: undefined, filter: "(kind=='software')", limit: 50 }),
  )
  expect(read).not.toHaveBeenCalled()
  await wrapper.get('tbody button').trigger('click')
  await flushPromises()
  expect(read).toHaveBeenCalledWith('app')
  await button(wrapper, '← 企业软件资源').trigger('click')
  await flushPromises()
  await button(wrapper, '下一页').trigger('click')
  await flushPromises()
  expect(list).toHaveBeenLastCalledWith(
    expect.objectContaining({ cursor: 'YXBw', filter: "(kind=='software')", limit: 50 }),
  )
  session.value = { ...session.value, session: { id: crypto.randomUUID() } }
  await flushPromises()
  expect(wrapper.find('[data-testid=resource-locator]').exists()).toBe(false)
  wrapper.unmount()
})
it('filters and clears the current Resource page without detail requests, then explicitly reloads the directory', async () => {
  const app = {
      id: 'app',
      presentation: { name: 'Example Editor' },
      revision: 2,
      kind: 'software',
      activeVersion: '1',
    },
    tools = { ...app, id: 'tools', presentation: { name: 'Enterprise Tools' } },
    list = vi
      .fn()
      .mockResolvedValueOnce({ items: [app, tools], nextCursor: null })
      .mockResolvedValue({ items: [tools], nextCursor: null }),
    read = vi.fn()
  const { wrapper } = await fixture(CatalogView, {
    policies: { resources: { list, read } },
  })
  onTestFinished(() => wrapper.unmount())
  const search = field(wrapper, '当前页搜索')
  await search.setValue('EXAMPLE')
  await flushPromises()
  expect(wrapper.get('tbody').text()).toContain('Example Editor')
  expect(wrapper.get('tbody').text()).not.toContain('Enterprise Tools')
  expect(list).toHaveBeenCalledTimes(1)
  expect(read).not.toHaveBeenCalled()

  await search.get('[role="button"][aria-label="清除 当前页搜索"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('tbody').text()).toContain('Example Editor')
  expect(wrapper.get('tbody').text()).toContain('Enterprise Tools')
  expect(list).toHaveBeenCalledTimes(1)
  expect(read).not.toHaveBeenCalled()

  await button(wrapper, '重新读取').trigger('click')
  await flushPromises()
  expect(list.mock.calls).toHaveLength(2)
  expect(list.mock.calls[1]?.[0]).toMatchObject({
    cursor: undefined,
    filter: "(kind=='software')",
    limit: 50,
  })
  expect(wrapper.get('tbody').text()).not.toContain('Example Editor')
  expect(wrapper.get('tbody').text()).toContain('Enterprise Tools')
  expect(read).not.toHaveBeenCalled()
})
it('opens an explicit Resource ID and binds admission to the newly selected exact version', async () => {
  const { resources, definition } = softwareResource(),
    original = resources.read('app')!
  expect(
    resources.handle(
      request(
        '/api/v1/resources/app',
        operation(
          {
            action: 'version',
            version: '2',
            kind: 'software',
            variants: original.versions[0]!.variants.map((variant) => ({
              ...variant,
              declaration: {
                kind: 'software',
                definition: { ...definition, version: '2.0' },
              },
            })),
          },
          original.revision,
        ),
      ),
      'normal',
    )?.status,
  ).toBe(200)
  const resource = resources.read('app')!,
    read = vi.fn(async () => resource),
    versionRead = vi.fn(async (resource: string, version: string) => ({
      resource,
      version,
      resourceDigest: sha,
      lifecycle: version === '1' ? life : null,
    })),
    changeVersion = vi.fn(
      async (
        _resource: string,
        _version: string,
        body: { operationId: string; expectedRevision: number; input: { action: string } },
      ) => ({ lifecycle: { ...life, operation: body.operationId } }),
    )
  const { wrapper } = await fixture(CatalogView, {
    policies: {
      resources: { list: vi.fn(async () => ({ items: [], nextCursor: null })), read },
    },
    software: { lifecycle: { version: versionRead, changeVersion } },
  })
  onTestFinished(() => wrapper.unmount())
  await button(wrapper, '原始标识与技术信息').trigger('click')
  await field(wrapper, '软件资源').setValue('app')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(read.mock.calls).toEqual([['app']])
  expect(versionRead.mock.calls).toEqual([['app', '1']])
  expect(wrapper.get('[data-testid=resource-locator]').text()).toBe(`app · ${resource.revision}`)

  await field(wrapper, '精确包版本').setValue('2')
  await flushPromises()
  expect(versionRead.mock.calls).toEqual([
    ['app', '1'],
    ['app', '2'],
  ])
  expect(wrapper.findAll('h3').map((heading) => heading.text())).toContain('版本准入 · 2')
  expect(wrapper.text().replace(/\s+/g, ' ')).toContain('Example.App / 2.0')
  expect(read).toHaveBeenCalledOnce()
  expect(changeVersion).not.toHaveBeenCalled()
  await button(wrapper, '启用').trigger('click')
  await flushPromises()
  expect(changeVersion).toHaveBeenCalledWith('app', '2', {
    operationId: expect.any(String),
    expectedRevision: 0,
    input: { action: 'enable' },
  })

  await field(wrapper, '精确包版本').setValue('1')
  await flushPromises()
  expect(versionRead).toHaveBeenLastCalledWith('app', '1')
  expect(wrapper.findAll('h3').map((heading) => heading.text())).toContain('版本准入 · 1')
  expect(changeVersion).toHaveBeenCalledOnce()
  expect(read).toHaveBeenCalledOnce()
})
it('selects a Resource header before reading real versions and clears the previous version', async () => {
  const list = vi.fn().mockResolvedValue({
      items: [{ id: 'app', presentation: {}, activeVersion: '1' }],
      nextCursor: null,
    }),
    read = vi.fn().mockResolvedValue({ kind: 'software', versions: [{ id: '1', state: 'active' }] })
  const { wrapper } = await fixture(
    defineComponent({
      setup() {
        const resource = ref(''),
          version = ref('')
        return () =>
          h(SoftwareResourceSelect, {
            resource: resource.value,
            version: version.value,
            'onUpdate:resource': (v: string) => {
              resource.value = v
            },
            'onUpdate:version': (v: string) => {
              version.value = v
            },
          })
      },
    }),
    { policies: { resources: { list, read } } },
  )
  await button(wrapper, '企业软件资源').trigger('click')
  await flushPromises()
  expect(read).not.toHaveBeenCalled()
  await wrapper.findAllComponents(VSelect)[0]!.setValue('app')
  await flushPromises()
  expect(read).toHaveBeenCalledWith('app')
  await wrapper.findAllComponents(VSelect)[1]!.setValue('1')
  expect(wrapper.findComponent(SoftwareResourceSelect).emitted('update:version')?.at(-1)).toEqual([
    '1',
  ])
  wrapper.unmount()
})
it('reads nullable draft lifecycle and reconciles only the original operation before allowing more writes', async () => {
  const read = vi
      .fn()
      .mockResolvedValue({ resource: 'app', version: '1', resourceDigest: sha, lifecycle: null }),
    change = vi.fn().mockRejectedValue(new Error('lost'))
  const { wrapper } = await fixture(
    VersionLifecycle,
    { software: { lifecycle: { version: read, changeVersion: change } } },
    { resource: 'app', version: '1' },
  )
  await button(wrapper, '启用').trigger('click')
  await flushPromises()
  await button(wrapper, '核对状态').trigger('click')
  await flushPromises()
  expect(button(wrapper, '启用').attributes('disabled')).toBeDefined()
  const body = change.mock.calls[0]?.[2]
  read.mockResolvedValue({
    resource: 'app',
    version: '1',
    resourceDigest: sha,
    lifecycle: { ...life, operation: body.operationId },
  })
  await button(wrapper, '核对状态').trigger('click')
  await flushPromises()
  expect(button(wrapper, '撤回').attributes('disabled')).toBeUndefined()
  change.mockResolvedValue({ lifecycle: { ...life, state: 'withdrawn', revision: 2 } })
  await button(wrapper, '撤回').trigger('click')
  await flushPromises()
  expect(change.mock.calls[1]?.[2]).toMatchObject({
    expectedRevision: 1,
    input: { action: 'withdraw' },
  })
  wrapper.unmount()
})
for (const protocol of [
  { kind: 'winget_rest', location: 'https://packages.example.test/', identifier: 'enterprise' },
  {
    kind: 'winget_community',
    repository: 'https://github.com/example/packages',
    commit: 'a'.repeat(40),
  },
  {
    kind: 'brew_tap',
    repository: 'https://github.com/example/tap',
    commit: 'b'.repeat(40),
    tap: 'example/tap',
  },
])
  it(`registers the exact ${protocol.kind} form without legacy publisher or approval fields`, async () => {
    const changeSource = vi.fn(async (_id, _revision, body) => ({
      ...source,
      source: body.input.definition,
      lifecycle: { ...life, operation: body.operationId },
    }))
    const { wrapper } = await fixture(SourcesView, { software: { lifecycle: { changeSource } } })
    await wrapper.findAll('form')[0]!.findAll('input')[0]!.setValue('enterprise')
    await wrapper.findAll('form')[0]!.findAll('input')[1]!.setValue('2')
    await wrapper.getComponent(VSelect).setValue(protocol.kind)
    if ('location' in protocol) {
      await field(wrapper, 'HTTPS 源地址').setValue(protocol.location)
      await field(wrapper, '标识').setValue(protocol.identifier)
    } else {
      await field(wrapper, '仓库地址').setValue(protocol.repository)
      await field(wrapper, '固定提交').setValue(protocol.commit)
      if ('tap' in protocol) await field(wrapper, 'Tap').setValue(protocol.tap)
    }
    await wrapper.findAll('form')[1]!.trigger('submit')
    await flushPromises()
    expect(changeSource.mock.calls[0]).toMatchObject([
      'enterprise',
      '2',
      {
        expectedRevision: 0,
        input: { action: 'register', definition: { id: 'enterprise', revision: '2', protocol } },
      },
    ])
    wrapper.unmount()
  })
it('submits a complete synchronous import with explicit target and auxiliary material choices', async () => {
  const { definition } = softwareResource(),
    imported = vi
      .fn()
      .mockRejectedValueOnce(decodeMdmError(501, { code: 'action_not_supported' }))
      .mockResolvedValue({
        resource: 'imported',
        version: '2',
        resourceDigest: sha,
        storageRevision: 5,
      })
  const selected = {
    ...source,
    source: {
      ...source.source,
      revision: '2',
      protocol: { kind: 'winget_rest', location: 'https://source.test/', identifier: 'enterprise' },
    },
    id: 'enterprise',
    revision: '2',
    protocol: 'private',
    state: 'enabled',
    snapshot: { ...source.snapshot, revision: '2' },
  }
  const { wrapper } = await fixture(ImportsView, {
    software: {
      lifecycle: {
        sources: vi.fn(async () => ({ items: [selected], nextCursor: null })),
        source: vi.fn().mockResolvedValue(selected),
      },
      imports: { import: imported },
    },
  })
  await field(wrapper, '企业来源 ID').setValue('enterprise/2')
  await flushPromises()
  await button(wrapper, '继续').trigger('click')
  for (const [label, value] of [
    ['软件资源', 'imported'],
    ['精确包版本', '2'],
    ['版本', 4],
    ['包标识', 'Example.App'],
    ['来源包版本', '2.0'],
    ['平台', 'windows'],
    ['架构', 'aarch64'],
    ['变体', 'arm'],
    ['安装产物字节数', 123],
  ] as const)
    await field(wrapper, label).setValue(value)
  await field(wrapper, '安装器标识').setValue('installer-arm')
  await field(wrapper, '清单文件').setValue('installer.yaml')
  await button(wrapper, '继续').trigger('click')
  const selection = {
    kind: 'winget',
    installerType: 'msi',
    scope: 'machine',
    installerId: 'installer-arm',
    files: ['installer.yaml'],
  }
  const artifact = { reference: 'verify', origin: null, length: 3, sha256: sha },
    dependency = {
      package: 'Runtime',
      packageVersion: '2',
      resource: 'runtime',
      version: '2',
      sha256: sha,
    },
    signature = { artifact: 'installer', mechanism: 'authenticode', publisher: 'Example Publisher' }
  for (const [label, value] of [
    ['原生安装行为', definition.behavior],
    ['辅助文件定义', { verify: artifact }],
    ['固定依赖', [dependency]],
    ['签名要求', [signature]],
  ] as const)
    await field(wrapper, label).setValue(JSON.stringify(value))
  await field(wrapper, '重启策略').setValue('forbid')
  await wrapper.findAll('input[type=checkbox]')[0]!.setValue(true)
  await wrapper.findAll('input[type=checkbox]')[1]!.setValue(true)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(imported.mock.calls[0]?.[0]).toMatchObject({
    expectedRevision: 4,
    input: {
      resource: 'imported',
      resourceVersion: '2',
      package: 'Example.App',
      packageVersion: '2.0',
      architecture: 'aarch64',
      variant: 'arm',
      installerLength: 123,
      selection,
      additionalArtifacts: { verify: artifact },
      dependencies: [dependency],
      signatures: [signature],
      reboot: 'forbid',
      downgrade: 'allow',
      nativeExport: true,
    },
  })
  expect(wrapper.text()).toContain('内容后端未启用或此操作不可用')
  expect(wrapper.find('section[role=status]').exists()).toBe(false)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('imported / 2 · 5')
  wrapper.unmount()
})
it('keeps the pinned Catalog version while admission is unknown and refuses mismatched private bytes', async () => {
  const { resources } = softwareResource(),
    read = vi.fn().mockResolvedValue(resources.read('app')),
    content = vi.fn().mockResolvedValue(new Uint8Array([9, 9, 9]).buffer),
    change = vi.fn().mockRejectedValue(new Error('lost'))
  const { wrapper } = await fixture(
    CatalogView,
    {
      policies: { resources: { read, list: vi.fn(async () => ({ items: [], nextCursor: null })) } },
      software: {
        content: { read: content },
        lifecycle: {
          version: vi.fn(async () => ({
            resource: 'app',
            version: '1',
            resourceDigest: sha,
            resourceRevision: 2,
            presentation: {},
            lifecycle: null,
          })),
          changeVersion: change,
        },
      },
    },
    {},
    { resource: 'app', version: '1' },
  )
  await button(wrapper, '下载并核验私有安装包').trigger('click')
  await flushPromises()
  expect(content.mock.calls[0]).toEqual([
    'app',
    { version: '1', platform: 'windows', architecture: 'x86_64', variant: 'main' },
  ])
  expect(wrapper.text()).toContain('输入或响应无效，操作未确认。')
  await button(wrapper, '启用').trigger('click')
  await flushPromises()
  expect(wrapper.getComponent(VSelect).props('disabled')).toBe(true)
  expect(button(wrapper, '← 企业软件资源').attributes('disabled')).toBeDefined()
  const original = structuredClone(change.mock.calls[0])
  await wrapper.get('section[role=status] input[type=checkbox]').setValue(true)
  await button(wrapper, '重放同一操作').trigger('click')
  await flushPromises()
  expect(change.mock.calls[1]).toEqual(original)
  wrapper.unmount()
})
