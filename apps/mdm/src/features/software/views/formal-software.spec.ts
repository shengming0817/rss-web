import { decodeMdmError } from '@rss/api/mdm'
import { DOMWrapper, mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { expect, it, vi } from 'vitest'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import SourcesView from './SourcesView.vue'
import PublicationsView from './PublicationsView.vue'
import ImportsView from './ImportsView.vue'
import BootstrapView from './BootstrapView.vue'
import UpdatesView from './UpdatesView.vue'
import CatalogView from './CatalogView.vue'
import VersionLifecycle from '../components/VersionLifecycle.vue'
import SoftwareResourceSelect from '../components/SoftwareResourceSelect.vue'
import ExecutionDetailView from '../../policies/views/ExecutionDetailView.vue'
import { defaultSchedule } from '../../policies/clients/model'
import { softwareResource } from '../../../../demo/software/fixtures'
const id = '11111111-1111-4111-8111-111111111111',
  sha = Array<number>(32).fill(1)
const life = { revision: 1, state: 'enabled', operation: id, actor: 'operator', at: 1, digest: sha }
const source = {
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
  const label = w.findAll('label').find((l) => l.text().startsWith(text))!
  return label.attributes('for')
    ? w.get(`#${label.attributes('for')}`)
    : label.find('input,textarea,select')
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
  session.value = { ...session.value, identity: { principalId: crypto.randomUUID() } }
  await flushPromises()
  expect(wrapper.find('h2').exists()).toBe(false)
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
  await wrapper.get('#publication-target').setValue('internal')
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
      nextCursor: 'app',
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
  expect(list).toHaveBeenCalledWith({ cursor: undefined, filter: "kind=='software'" })
  expect(read).not.toHaveBeenCalled()
  await wrapper.get('tbody button').trigger('click')
  await flushPromises()
  expect(read).toHaveBeenCalledWith('app')
  await button(wrapper, '← 企业软件目录').trigger('click')
  await flushPromises()
  await button(wrapper, '下一页').trigger('click')
  await flushPromises()
  expect(list).toHaveBeenLastCalledWith({ cursor: 'app', filter: "kind=='software'" })
  session.value = { ...session.value, session: { id: crypto.randomUUID() } }
  await flushPromises()
  expect(wrapper.find('[data-testid=resource-locator]').exists()).toBe(false)
  wrapper.unmount()
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
  await button(wrapper, '企业软件目录').trigger('click')
  await flushPromises()
  expect(read).not.toHaveBeenCalled()
  await wrapper.get('select').setValue('app')
  await flushPromises()
  expect(read).toHaveBeenCalledWith('app')
  await wrapper.findAll('select')[1]!.setValue('1')
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
it('saves onboarding as the shared Policy and reads the formal execution directory', async () => {
  const change = vi.fn(async (id, body) => ({
      id,
      revision: 1,
      enabled: true,
      definition: body.input.definition,
    })),
    list = vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    directory = vi
      .fn()
      .mockResolvedValue({ items: [], nextCursor: null, statistics: { total: 0 }, asOf: 1 })
  const { wrapper } = await fixture(BootstrapView, {
    policies: { policies: { list, change }, executions: { directory } },
  })
  await wrapper.get('select').setValue('request_mdm_enrollment')
  await button(wrapper, '新建').trigger('click')
  await flushPromises()
  const inputs = wrapper.get('form').findAll('input')
  await inputs[0]!.setValue(id)
  await inputs[1]!.setValue(id)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(change.mock.calls[0]?.[1].input.definition).toEqual({
    scope: id,
    action: {
      kind: 'request_mdm_enrollment',
      organization: id,
      schedule: defaultSchedule(),
      runLifetimeSeconds: 1800,
    },
  })
  await button(wrapper, '执行中心').trigger('click')
  await flushPromises()
  expect(directory.mock.calls[0]?.[0].filter).toContain(change.mock.calls[0]?.[0])
  wrapper.unmount()
})
it('instantiates an update blueprint through Resource and exposes the existing Policy entry', async () => {
  const blueprints = vi.fn().mockResolvedValue({
      items: [
        {
          id: 'update-state',
          version: '1',
          category: 'updates',
          platform: 'windows',
          definition: { kind: 'native_collection' },
        },
        { id: 'hardware', version: '1', category: 'hardware' },
      ],
    }),
    change = vi.fn().mockResolvedValue({ resource: 'updates' })
  const { wrapper } = await fixture(UpdatesView, {
    policies: { resources: { blueprints, change } },
  })
  expect(wrapper.text()).not.toContain('hardware')
  await wrapper.get('select').setValue('update-state/1')
  await wrapper.get('input').setValue('updates')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(change.mock.calls[0]).toMatchObject([
    'updates',
    {
      expectedRevision: 0,
      input: { action: 'instantiate', blueprint: 'update-state', version: '1' },
    },
  ])
  expect(wrapper.text()).toContain('updates')
  wrapper.unmount()
})
it('opens an onboarding action run without sending a native command read', async () => {
  const run = {
    taskId: id,
    device: 'endpoint',
    registrationId: id,
    generation: 2,
    availableAt: 1,
    deadline: 1000,
    state: { delivery: { kind: 'queued' }, execution: 'succeeded', cancellation: 'none' },
    effect: 'unverified',
    userAction: null,
    result: { kind: 'enrollment', entryOutcome: 'opened' },
  }
  const read = vi.fn().mockResolvedValue(run),
    native = vi.fn()
  const { wrapper } = await fixture(
    ExecutionDetailView,
    { policies: { runs: { read }, native: { read: native } } },
    {},
    { policy: id },
    `/${id}`,
  )
  expect(read).toHaveBeenCalled()
  expect(native).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('opened')
  expect(wrapper.text()).toContain('尚未验证')
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
    await wrapper.get('select').setValue(protocol.kind)
    const inputs = wrapper.findAll('form')[1]!.findAll('input')
    if ('location' in protocol) {
      await inputs[0]!.setValue(protocol.location)
      await inputs[1]!.setValue(protocol.identifier)
    } else {
      await inputs[0]!.setValue(protocol.repository)
      await inputs[1]!.setValue(protocol.commit)
      if ('tap' in protocol) await inputs[2]!.setValue(protocol.tap)
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
it('binds explicit Agent releases in the common Policy and reads canonical registration progress', async () => {
  const targets = ['windows_x86_64', 'windows_aarch64', 'macos_x86_64', 'macos_aarch64']
  const releases = targets.map((target, i) => ({
    releaseId: `11111111-1111-4111-8111-${String(i + 1).padStart(12, '0')}`,
    target: {
      platform: target.split('_')[0],
      architecture: target.startsWith('windows') ? target.slice(8) : target.slice(6),
    },
    version: '1',
    format: target.startsWith('windows') ? 'exe' : 'pkg',
  }))
  let saved: { id: string; revision: number; enabled: boolean; definition: unknown } | undefined
  const change = vi.fn(async (id, body) => {
    saved = {
      id,
      revision: (saved?.revision ?? 0) + 1,
      enabled: body.input.action === 'put' ? body.input.enabled : body.input.action === 'enable',
      definition: body.input.definition ?? saved?.definition,
    }
    return saved
  })
  const assignments = vi.fn().mockResolvedValue({
    items: [
      {
        object: { kind: 'endpoint', id: 'endpoint' },
        channel: 'mdm',
        availability: 'ready',
        reason: null,
        target: { device: 'endpoint', channel: 'mdm', registrationId: id, generation: 2 },
        qualification: { state: 'eligible', entry: 1 },
        operationIds: [],
        sources: [],
      },
    ],
    nextCursor: null,
  })
  const directory = vi
    .fn()
    .mockResolvedValue({ items: [], statistics: { total: 0 }, asOf: 1, nextCursor: null })
  const { wrapper } = await fixture(BootstrapView, {
    onboarding: { packages: { list: vi.fn().mockResolvedValue(releases) } },
    policies: {
      policies: {
        list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
        change,
        assignments,
      },
      executions: { directory },
    },
  })
  await button(wrapper, '新建').trigger('click')
  await flushPromises()
  await wrapper.get('form input').setValue(id)
  await button(wrapper, '读取 Agent 发行包').trigger('click')
  await flushPromises()
  const selectors = wrapper
    .get('form')
    .findAll('select')
    .filter((s) => s.find('option[value=""]').exists())
  for (let i = 0; i < 4; i++) await selectors[i]!.setValue(releases[i]!.releaseId)
  const lifetime = wrapper.get('form input[max="604800"]')
  await lifetime.setValue(3600)
  await wrapper.get('form').findAll('input[type=checkbox]').at(-1)!.setValue(false)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(change.mock.calls[0]?.[1]).toMatchObject({
    input: {
      enabled: false,
      definition: {
        action: {
          kind: 'ensure_agent_installed',
          packages: Object.fromEntries(
            targets.map((target, i) => [target, releases[i]!.releaseId]),
          ),
          runLifetimeSeconds: 3600,
        },
      },
    },
  })
  await button(wrapper, '启用').trigger('click')
  await flushPromises()
  expect(change.mock.calls[1]?.[1]).toMatchObject({
    expectedRevision: 1,
    input: { action: 'enable' },
  })
  await button(wrapper, '刷新进度（保留编辑）').trigger('click')
  await flushPromises()
  await button(wrapper, '来源与历史证据').trigger('click')
  await flushPromises()
  expect(new DOMWrapper(document.body).get('[role=dialog]').text()).toContain(id)
  expect(new DOMWrapper(document.body).get('[role=dialog]').text()).toContain('2')
  await button(wrapper, '执行中心').trigger('click')
  await flushPromises()
  expect(directory.mock.calls[0]?.[0].filter).toContain(saved?.id)
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
  expect(wrapper.get('select').attributes('disabled')).toBeDefined()
  expect(button(wrapper, '← 企业软件目录').attributes('disabled')).toBeDefined()
  const original = structuredClone(change.mock.calls[0])
  await wrapper.get('section[role=status] input[type=checkbox]').setValue(true)
  await button(wrapper, '重放同一操作').trigger('click')
  await flushPromises()
  expect(change.mock.calls[1]).toEqual(original)
  wrapper.unmount()
})
