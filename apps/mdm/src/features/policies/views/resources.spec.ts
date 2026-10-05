import { createHash, webcrypto } from 'node:crypto'
import { File as NodeFile } from 'node:buffer'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import ResourcesView from './ResourcesView.vue'
afterEach(() => vi.unstubAllGlobals())
it('publishes all staged software variants in one immutable version at the current Resource revision', async () => {
  const change = vi.fn().mockResolvedValue({}),
    upload = vi.fn().mockResolvedValue(undefined)
  const read = vi
    .fn()
    .mockResolvedValue({ id: 'application', revision: 1, kind: 'software', versions: [] })
  const definition = {
    source: { id: 'private', revision: '1', sha256: Array<number>(32).fill(1) },
    package: 'App',
    version: '1',
    artifacts: {
      installer: {
        reference: 'content',
        length: 3,
        sha256: Array<number>(32).fill(1),
        origin: null,
      },
    },
    reboot: 'report',
    downgrade: 'deny',
    dependencies: [],
    provenance: { kind: 'private' },
    signatures: [],
    export: { kind: 'disabled' },
    behavior: {
      kind: 'msi',
      installer: 'installer',
      scope: 'system',
      install: {
        runAs: 'system',
        arguments: [],
        environment: {},
        timeoutSeconds: 60,
        outputBytes: 1024,
        exitCodes: { success: [0], reboot: [3010] },
      },
      upgradeInvocation: {
        runAs: 'system',
        arguments: [],
        environment: {},
        timeoutSeconds: 60,
        outputBytes: 1024,
        exitCodes: { success: [0], reboot: [3010] },
      },
      upgrade: 'in_place',
      uninstall: null,
      detect: {
        kind: 'msi_product',
        productCode: '{11111111-1111-4111-8111-111111111111}',
        version: '1',
      },
    },
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ResourcesView }],
  })
  await router.push('/?resource=application')
  const wrapper = mount(ResourcesView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: {
        RouterLink: true,
        SoftwareDefinitionEditor: {
          template: '<div />',
          setup(_, { expose }) {
            expose({ read: () => structuredClone(definition) })
            return {}
          },
        },
      },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          demo: true,
          policies: {
            resources: { read, change, upload },
            catalog: { list: async () => ({ items: [], nextCursor: null }) },
          },
        },
      },
    },
  })
  await flushPromises()
  expect(read).toHaveBeenCalledWith('application')
  await wrapper.get('[data-action="stage-variant"]').trigger('click')
  await wrapper.get('#resource-architecture').setValue('aarch64')
  await wrapper.get('[data-action="stage-variant"]').trigger('click')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(change).toHaveBeenCalledTimes(1)
  expect(
    change.mock.calls[0]![1].input.variants.map((v: { architecture: string }) => v.architecture),
  ).toEqual(['x86_64', 'aarch64'])
  expect(change.mock.calls[0]![1].expectedRevision).toBe(1)
  wrapper.unmount()
})
it('resumes the same upload after a lost chunk response, rejects different bytes, and verifies unknown completion', async () => {
  vi.stubGlobal('crypto', webcrypto)
  const digest = [...createHash('sha256').update('first').digest()]
  let offset = 0,
    upload = ''
  const binding = {
    purpose: {
      kind: 'resource',
      binding: {
        storage_class: 'artifact',
        resource: 'app',
        version: '1',
        variant: 'main',
        platform: 'windows',
        architecture: 'x86_64',
        resource_digest: Array(32).fill(1),
        source: null,
        origin: null,
      },
    },
    reference: 'content',
    length: 5,
    sha256: digest,
    actor: 'demo',
  }
  const value = () => ({ id: upload, binding, offset, expires: 4102444800, complete: false })
  const begin = vi.fn(async (_: string, id: string) => {
    upload = id
    return value()
  })
  const append = vi.fn(async () => {
    offset = 5
    throw new Error('lost chunk reply')
  })
  const complete = vi.fn().mockRejectedValue(new Error('lost completion reply'))
  const receipt = vi.fn(async () => ({
    operationId: upload,
    resource: 'app',
    version: '1',
    reference: 'content',
    length: 5,
    sha256: digest,
  }))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ResourcesView }],
  })
  await router.push('/?resource=app')
  const wrapper = mount(ResourcesView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          demo: true,
          policies: {
            resources: {
              read: vi
                .fn()
                .mockResolvedValue({ id: 'app', revision: 1, kind: 'software', versions: [] }),
              uploads: { begin, append, complete, receipt },
            },
            catalog: { list: async () => ({ items: [], nextCursor: null }) },
          },
        },
      },
    },
  })
  await flushPromises()
  const input = wrapper.get<HTMLInputElement>('#resource-upload')
  async function select(text: string) {
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [new NodeFile([text], 'app.msi')],
    })
    await input.trigger('change')
  }
  const button = () => wrapper.findAll('button').find((b) => b.text() === '上传内容')!
  await select('first')
  await button().trigger('click')
  await vi.waitFor(() => expect(append).toHaveBeenCalledTimes(1))
  await flushPromises()
  expect(wrapper.text()).toContain('结果未知')
  await select('wrong')
  await button().trigger('click')
  await vi.waitFor(() =>
    expect(wrapper.get('section.device-console').attributes('aria-busy')).toBe('false'),
  )
  await flushPromises()
  expect(wrapper.text()).toContain('所选文件与原上传内容不一致')
  expect(begin).toHaveBeenCalledTimes(1)
  await select('first')
  await button().trigger('click')
  await vi.waitFor(() => expect(begin).toHaveBeenCalledTimes(2))
  await flushPromises()
  expect(begin.mock.calls[0]![1]).toBe(begin.mock.calls[1]![1])
  expect(append).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).not.toContain('内容入库已确认')
  await wrapper.get('[data-action="complete-upload"]').trigger('click')
  await flushPromises()
  expect(complete).toHaveBeenCalledTimes(1)
  await wrapper.get('[data-action="verify-upload"]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('内容入库已确认')
  wrapper.unmount()
})

it('hashes metadata for a software artifact larger than one HTTP chunk without reading the whole file', async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ResourcesView }],
  })
  await router.push('/?resource=app')
  const wrapper = mount(ResourcesView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          demo: true,
          policies: {
            resources: {
              read: async () => ({ id: 'app', revision: 1, kind: 'software', versions: [] }),
            },
            catalog: { list: async () => ({ items: [], nextCursor: null }) },
          },
        },
      },
    },
  })
  await flushPromises()
  const bytes = new Uint8Array(16_777_217).fill(7),
    file = new NodeFile([bytes], 'package.msi')
  const fullRead = vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('whole file read'))
  const metadata = wrapper.get<HTMLInputElement>('#resource-metadata')
  Object.defineProperty(metadata.element, 'files', { configurable: true, value: [file] })
  await metadata.trigger('change')
  await vi.waitFor(() =>
    expect(wrapper.text()).toContain(createHash('sha256').update(bytes).digest('hex')),
  )
  expect(wrapper.text()).toContain('16777217')
  expect(fullRead).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('clears the software definition and artifact draft when opening another resource', async () => {
  const read = vi.fn(async (id: string) => ({ id, revision: 1, kind: 'software', versions: [] }))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ResourcesView }],
  })
  await router.push('/?resource=first')
  const wrapper = mount(ResourcesView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          demo: true,
          policies: {
            resources: { read },
            catalog: {
              list: async () => ({ items: [{ id: 'second', label: 'Second' }], nextCursor: null }),
            },
          },
        },
      },
    },
  })
  await flushPromises()
  await wrapper.get('input[id$="-package"]').setValue('First.Package')
  await wrapper.get('input[id$="-source"]').setValue('first-source')
  await wrapper.get('#resource-reference').setValue('first-artifact')
  await wrapper.get('#resource-variant').setValue('first-variant')
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '重新读取')!
    .trigger('click')
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'Second')!
    .trigger('click')
  await flushPromises()
  expect((wrapper.get('input[id$="-package"]').element as HTMLInputElement).value).toBe('')
  expect((wrapper.get('input[id$="-source"]').element as HTMLInputElement).value).toBe('')
  expect((wrapper.get('#resource-reference').element as HTMLInputElement).value).toBe('content')
  expect((wrapper.get('#resource-variant').element as HTMLInputElement).value).toBe('main')
  wrapper.unmount()
})

it.each([false, true])(
  'uploads bounded file slices and stops subsequent writes on navigation: abort=%s',
  async (abort) => {
    vi.stubGlobal('crypto', webcrypto)
    const bytes = new Uint8Array(4 * 1024 * 1024 + 3).fill(5),
      digest = [...createHash('sha256').update(bytes).digest()]
    let upload = '',
      offset = 0,
      release!: () => void
    const binding = {
      purpose: {
        kind: 'resource',
        binding: {
          storage_class: 'artifact',
          resource: 'app',
          version: '1',
          variant: 'main',
          platform: 'windows',
          architecture: 'x86_64',
          resource_digest: Array(32).fill(1),
          source: null,
          origin: null,
        },
      },
      reference: 'content',
      length: bytes.length,
      sha256: digest,
      actor: 'demo',
    }
    const value = () => ({ id: upload, binding, offset, expires: 4102444800, complete: false })
    const begin = vi.fn(async (_: string, id: string) => {
      upload = id
      return value()
    })
    const append = vi.fn(async (_: string, _id: string, expected: number, chunk: ArrayBuffer) => {
      expect(expected).toBe(offset)
      expect(chunk.byteLength).toBeLessThanOrEqual(4 * 1024 * 1024)
      if (abort)
        await new Promise<void>((resolve) => {
          release = resolve
        })
      offset += chunk.byteLength
      return value()
    })
    const complete = vi.fn().mockResolvedValue(undefined)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: ResourcesView }],
    })
    await router.push('/?resource=app')
    const wrapper = mount(ResourcesView, {
      global: {
        plugins: [router, mdmI18n()],
        stubs: { RouterLink: true },
        provide: {
          [mdmKey as symbol]: {
            tenant: 'tenant',
            demo: true,
            policies: {
              resources: {
                read: async (id: string) => ({ id, revision: 1, kind: 'software', versions: [] }),
                uploads: { begin, append, complete },
              },
              catalog: { list: async () => ({ items: [], nextCursor: null }) },
            },
          },
        },
      },
    })
    await flushPromises()
    const input = wrapper.get<HTMLInputElement>('#resource-upload'),
      file = new NodeFile([bytes], 'app.msi')
    const fullRead = vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('whole-file buffer'))
    Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
    await input.trigger('change')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '上传内容')!
      .trigger('click')
    await vi.waitFor(() => expect(append).toHaveBeenCalled())
    if (abort) {
      await router.push('/?resource=second')
      await flushPromises()
      release()
      await flushPromises()
      expect(append).toHaveBeenCalledTimes(1)
      expect(wrapper.find('[data-action="complete-upload"]').exists()).toBe(false)
      expect((wrapper.get('#resource-id').element as HTMLInputElement).value).toBe('second')
    } else {
      await vi.waitFor(() => expect(append).toHaveBeenCalledTimes(2))
      await flushPromises()
      expect(offset).toBe(bytes.length)
      expect(complete).not.toHaveBeenCalled()
      await wrapper.get('[data-action="complete-upload"]').trigger('click')
      await flushPromises()
      expect(complete).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain('内容入库已确认')
    }
    expect(fullRead).not.toHaveBeenCalled()
    wrapper.unmount()
  },
)
