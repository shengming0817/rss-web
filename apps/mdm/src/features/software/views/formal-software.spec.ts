import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { ref, type Component } from 'vue'
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
import ExecutionsView from '../../policies/views/ExecutionsView.vue'
import ExecutionDetailView from '../../policies/views/ExecutionDetailView.vue'
import { defaultSchedule } from '../../policies/clients/model'
import { rings } from '../clients/publication'
import { softwareResource } from '../../../../demo/software/fixtures'
const id = '11111111-1111-4111-8111-111111111111',
  sha = Array<number>(32).fill(1)
const life = { revision: 1, state: 'enabled', operation: id, actor: 'operator', at: 1, digest: sha }
const source = {
  source: { id: 'enterprise', revision: '1', protocol: { kind: 'private' } },
  snapshot: { id: 'enterprise', revision: '1', sha256: sha },
  lifecycle: life,
}
function candidate(outcome?: string) {
  return {
    id: 'candidate',
    revision: outcome ? 1 : 0,
    disposition: 'active',
    contentDigest: sha,
    manifestDigest: sha,
    sourceSnapshot: sha,
    rings: rings.map((ring, i) => ({
      ring,
      state: i === 0 && outcome ? 'publication' : 'candidate',
      publication: i === 0 && outcome ? { id: sha, attempt: 3, outcome } : null,
    })),
  }
}
async function fixture(component: Component, owners: object, props = {}, query = {}) {
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
  await router.push({ path: '/', query })
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
const field = (w: VueWrapper, text: string) =>
  w
    .findAll('label')
    .find((l) => l.text().startsWith(text))!
    .find('input,textarea,select')
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
    software: { lifecycle: { source: vi.fn(async () => source), changeSource } },
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
    software: { lifecycle: { source: read, changeSource } },
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
it('authors a candidate from the exact Resource revision and digest, then keeps Publish pending until explicit recovery', async () => {
  const read = vi.fn().mockResolvedValue(candidate('pending')),
    change = vi.fn(async (_source, _id, body) =>
      body.input.action === 'candidate'
        ? candidate()
        : candidate(body.input.action === 'recover' ? 'not_applied' : 'pending'),
    )
  const resources = { read: vi.fn().mockResolvedValue({ revision: 7 }) },
    version = vi.fn().mockResolvedValue({ resourceDigest: sha })
  const { wrapper } = await fixture(PublicationsView, {
    policies: { resources },
    software: { publication: { read, change }, lifecycle: { version } },
  })
  const locators = wrapper.findAll('form')[0]!.findAll('input')
  await locators[0]!.setValue('binding')
  await locators[1]!.setValue('candidate')
  await field(wrapper, '软件资源').setValue('app')
  await wrapper.findAll('form')[1]!.trigger('submit')
  await flushPromises()
  expect(change.mock.calls[0]?.[2].input).toEqual({
    action: 'candidate',
    resource: 'app',
    version: '1',
    expectedResourceRevision: 7,
    resourceDigest: sha,
  })
  await button(wrapper, '发布').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('pending')
  expect(read).not.toHaveBeenCalled()
  expect(button(wrapper, '重试')).toBeUndefined()
  await wrapper
    .findAll('section.console-panel')
    .find((s) => s.text().includes('pending'))!
    .findAll('button')
    .find((b) => b.text() === '核对状态')!
    .trigger('click')
  await flushPromises()
  expect(change.mock.calls[2]?.[2].input).toEqual({
    action: 'recover',
    ring: 'test',
    publication: sha,
    attempt: 3,
  })
  await button(wrapper, '重试').trigger('click')
  await flushPromises()
  expect(change.mock.calls[3]?.[2].input).toEqual({ action: 'retry', ring: 'test', attempt: 3 })
  wrapper.unmount()
})
it('reconciles a lost Publish with the current publication and attempt while retaining write fencing', async () => {
  const read = vi.fn().mockResolvedValueOnce(candidate()).mockResolvedValue(candidate('unknown')),
    change = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost'))
      .mockResolvedValue(candidate('published'))
  const { wrapper } = await fixture(PublicationsView, {
    software: { publication: { read, change } },
  })
  const inputs = wrapper.findAll('form')[0]!.findAll('input')
  await inputs[0]!.setValue('binding')
  await inputs[1]!.setValue('candidate')
  await wrapper.findAll('form')[0]!.trigger('submit')
  await flushPromises()
  await button(wrapper, '发布').trigger('click')
  await flushPromises()
  await button(wrapper, '核对状态').trigger('click')
  await flushPromises()
  expect(button(wrapper, '发布').attributes('disabled')).toBeDefined()
  const recover = wrapper
    .findAll('section.console-panel')
    .find((s) => s.text().includes('unknown'))!
    .findAll('button')
    .find((b) => b.text() === '核对状态')!
  await recover.trigger('click')
  await flushPromises()
  expect(change.mock.calls[1]?.[2].input).toEqual({
    action: 'recover',
    ring: 'test',
    publication: sha,
    attempt: 3,
  })
  expect(change).toHaveBeenCalledTimes(2)
  wrapper.unmount()
})
it('imports synchronously with a source snapshot, and a Resource read cannot settle a lost import', async () => {
  const imported = vi.fn().mockRejectedValue(new Error('lost')),
    { definition } = softwareResource()
  const { wrapper } = await fixture(ImportsView, {
    software: {
      lifecycle: { source: vi.fn().mockResolvedValue(source) },
      imports: { import: imported },
    },
    policies: { resources: { read: vi.fn().mockResolvedValue({ id: 'app', revision: 1 }) } },
  })
  const inputs = wrapper.findAll('input')
  await inputs[0]!.setValue('enterprise')
  await inputs[2]!.setValue('app')
  await inputs[5]!.setValue('Example.App')
  await inputs[6]!.setValue('1.0')
  await wrapper.findAll('textarea')[1]!.setValue(JSON.stringify(definition.behavior))
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(imported.mock.calls[0]?.[0]).toMatchObject({
    expectedRevision: 0,
    input: { source: source.snapshot, resource: 'app', selection: { installerType: 'msi' } },
  })
  await button(wrapper, '核实状态').trigger('click')
  await flushPromises()
  expect(button(wrapper, '导入').element.matches(':disabled')).toBe(true)
  expect(imported).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})
it('uses Resource pages and reads versions only after selection without inventing directory metadata', async () => {
  const list = vi.fn().mockResolvedValue({
      items: [{ id: 'app', revision: 2, kind: 'software', activeVersion: '1' }],
      nextCursor: 'app',
    }),
    read = vi.fn().mockResolvedValue({ id: 'app', revision: 2, kind: 'software', versions: [] })
  const { wrapper, session } = await fixture(CatalogView, {
    policies: { resources: { list, read } },
  })
  expect(list).toHaveBeenCalledWith('software', undefined)
  expect(read).not.toHaveBeenCalled()
  await button(wrapper, 'app · 1').trigger('click')
  await flushPromises()
  expect(read).toHaveBeenCalledWith('app')
  await button(wrapper, '下一页').trigger('click')
  await flushPromises()
  expect(list).toHaveBeenLastCalledWith('software', 'app')
  session.value = { ...session.value, session: { id: crypto.randomUUID() } }
  await flushPromises()
  expect(wrapper.find('[data-testid=resource-locator]').exists()).toBe(false)
  wrapper.unmount()
})
it('selects a Resource header before reading real versions and clears the previous version', async () => {
  const list = vi
      .fn()
      .mockResolvedValue({ items: [{ id: 'app', activeVersion: '1' }], nextCursor: null }),
    read = vi.fn().mockResolvedValue({ kind: 'software', versions: [{ id: '1', state: 'active' }] })
  const { wrapper } = await fixture(
    SoftwareResourceSelect,
    { policies: { resources: { list, read } } },
    { resource: '', version: '' },
  )
  await button(wrapper, '企业软件目录').trigger('click')
  await flushPromises()
  expect(read).not.toHaveBeenCalled()
  await wrapper.get('select').setValue('app')
  await flushPromises()
  expect(read).toHaveBeenCalledWith('app')
  await wrapper.findAll('select')[1]!.setValue('1')
  expect(wrapper.emitted('update:version')?.at(-1)).toEqual(['1'])
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
  expect(directory.mock.calls[0]?.[0].policy).toBe(change.mock.calls[0]?.[0])
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
  )
  expect(read).toHaveBeenCalled()
  expect(native).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('opened')
  expect(wrapper.text()).toContain('尚未验证')
  wrapper.unmount()
})

for (const outcome of ['published', 'not_applied'])
  it(`reconciles lost Publish by explicit exact replay after a terminal ${outcome} read`, async () => {
    const read = vi.fn().mockResolvedValueOnce(candidate()).mockResolvedValue(candidate(outcome)),
      change = vi
        .fn()
        .mockRejectedValueOnce(new Error('lost'))
        .mockResolvedValue(candidate(outcome))
    const { wrapper } = await fixture(PublicationsView, {
      software: { publication: { read, change } },
    })
    const inputs = wrapper.findAll('form')[0]!.findAll('input')
    await inputs[0]!.setValue('binding')
    await inputs[1]!.setValue('candidate')
    await wrapper.findAll('form')[0]!.trigger('submit')
    await flushPromises()
    await button(wrapper, '发布').trigger('click')
    await flushPromises()
    const original = structuredClone(change.mock.calls[0])
    await button(wrapper, '核对状态').trigger('click')
    await flushPromises()
    expect(change).toHaveBeenCalledTimes(1)
    const confirmation = wrapper.findAll('section.console-panel').at(-1)!
    await confirmation.get('input[type=checkbox]').setValue(true)
    await confirmation.get('button').trigger('click')
    await flushPromises()
    expect(change.mock.calls[1]).toEqual(original)
    expect(wrapper.findAll('section.console-panel').some((s) => s.text().includes('原操作'))).toBe(
      false,
    )
    wrapper.unmount()
  })
it('invalidates dangerous confirmation and clears PIN when the action or target changes', async () => {
  const create = vi.fn().mockResolvedValue({ operationId: id }),
    directory = vi
      .fn()
      .mockResolvedValue({ items: [], statistics: { total: 0 }, asOf: 1, nextCursor: null })
  const { wrapper } = await fixture(ExecutionsView, {
    policies: { native: { create }, executions: { directory } },
  })
  await wrapper.get('#native-device').setValue('endpoint')
  await wrapper.get('#native-kind').setValue('lock')
  const control = wrapper.findAll('form')[1]!
  const inputs = control.findAll('input')
  await inputs[1]!.setValue(id)
  await inputs[2]!.setValue(1)
  await control.get('input[type=password]').setValue('123456')
  await control.get('input[type=checkbox]').setValue(true)
  await wrapper.get('#native-kind').setValue('wipe')
  expect((control.get('input[type=checkbox]').element as HTMLInputElement).checked).toBe(false)
  await control.get('input[type=checkbox]').setValue(true)
  await wrapper.get('#native-device').setValue('other')
  expect((control.get('input[type=checkbox]').element as HTMLInputElement).checked).toBe(false)
  expect(create).not.toHaveBeenCalled()
  wrapper.unmount()
})
