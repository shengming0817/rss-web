import { flushPromises, mount, DOMWrapper } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import ArchiveView from './ArchiveView.vue'
const tenant = '11111111-1111-4111-8111-111111111111'
async function setup(overrides: object = {}) {
  const client = {
    state: vi.fn().mockResolvedValue({ initialized: false, generation: 0, unlockedUntil: null }),
    list: vi.fn().mockResolvedValue({
      tenantId: tenant,
      items: [],
      nextCursor: null,
      asOf: 100,
      reminderDays: 30,
      alerts: { expired: 0, expiring: 0, notYetValid: 0 },
    }),
    settings: vi
      .fn()
      .mockResolvedValue({ revision: 0, value: { reminderDays: 30, categories: ['custom'] } }),
    initialize: vi.fn().mockResolvedValue({}),
    unlock: vi.fn().mockResolvedValue({
      initialized: true,
      generation: 1,
      unlockedUntil: Math.floor(Date.now() / 1000) + 900,
    }),
    lock: vi.fn().mockResolvedValue(true),
    operation: vi.fn().mockResolvedValue({}),
    ...overrides,
  }
  const session = {
    state: ref({
      status: 'authenticated',
      tenant,
      identity: { principalId: tenant },
      session: { id: tenant },
    }),
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: ArchiveView },
      { path: '/elsewhere', component: { template: '<p>Elsewhere</p>' } },
    ],
  })
  await router.push('/')
  const wrapper = mount(ArchiveView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant,
          demo: false,
          session,
          security: { certificateArchive: client },
        },
      },
    },
  })
  await flushPromises()
  return { wrapper, router, client, session }
}
it('clears the submitted password and queries uncertain operations without replay', async () => {
  const initialize = vi.fn().mockRejectedValue(new Error('lost response')),
    { wrapper, client } = await setup({ initialize })
  await wrapper.get('#archive-password').setValue('first archive password')
  await wrapper
    .get('#archive-password')
    .element.closest('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flushPromises()
  expect((wrapper.get('#archive-password').element as HTMLInputElement).value).toBe('')
  expect(initialize).toHaveBeenCalledTimes(1)
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '查询操作结果')!
    .trigger('click')
  await flushPromises()
  expect(client.operation).toHaveBeenCalledWith(initialize.mock.calls[0]![0])
  expect(initialize).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})
it('clears unlock and password state on session change and fences pending responses', async () => {
  let complete: (value: unknown) => void = () => {}
  const unlock = vi.fn(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    ),
    { wrapper, session } = await setup({
      state: vi.fn().mockResolvedValue({ initialized: true, generation: 1, unlockedUntil: null }),
      unlock,
    })
  await wrapper.get('#archive-password').setValue('first archive password')
  await wrapper
    .get('#archive-password')
    .element.closest('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flushPromises()
  session.state.value = { ...session.state.value, status: 'anonymous' }
  complete({ initialized: true, generation: 1, unlockedUntil: Math.floor(Date.now() / 1000) + 900 })
  await flushPromises()
  expect(wrapper.text()).not.toContain('当前会话已解锁')
  wrapper.unmount()
})
it('keeps local file errors recoverable and sends each file format and password', async () => {
  const imported: unknown[] = []
  const importFile = vi.fn(async (_id, input) => {
    imported.push(JSON.parse(JSON.stringify(input)))
    return {}
  })
  const { wrapper } = await setup({
    state: vi.fn().mockResolvedValue({
      initialized: true,
      generation: 1,
      unlockedUntil: Math.floor(Date.now() / 1000) + 900,
    }),
    import: importFile,
  })
  await wrapper.get('#archive-name').setValue('CA with key')
  const select = async (files: File[]) => {
    Object.defineProperty(wrapper.get('#archive-file').element, 'files', {
      configurable: true,
      value: files,
    })
    await wrapper.get('#archive-file').trigger('change')
  }
  const submit = async () => {
    wrapper
      .get('#archive-name')
      .element.closest('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
  }
  const large = new File([], 'large.pem')
  Object.defineProperty(large, 'size', { value: 2 * 1024 * 1024 })
  await select([large])
  await submit()
  expect(importFile).not.toHaveBeenCalled()
  expect(wrapper.text()).not.toContain('查询操作结果')
  const cert = new File([], 'ca.pem'),
    key = new File([], 'key.pem')
  for (const file of [cert, key])
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => new TextEncoder().encode(file.name).buffer,
    })
  await select([cert, key])
  await wrapper.get('#archive-file-format-1').setValue('private_key')
  await wrapper.get('#archive-file-password-1').setValue('file password')
  await submit()
  expect(importFile).toHaveBeenCalledTimes(1)
  expect(imported).toEqual([
    expect.objectContaining({
      files: [
        expect.objectContaining({ name: 'ca.pem', format: 'certificate', password: null }),
        expect.objectContaining({
          name: 'key.pem',
          format: 'private_key',
          password: 'file password',
        }),
      ],
    }),
  ])
  expect(wrapper.find('#archive-file-password-1').exists()).toBe(false)
  wrapper.unmount()
})
const secondId = '22222222-2222-4222-8222-222222222222'
function archiveEntry(id: string, revision = 1) {
  return {
    id,
    revision,
    retired: false,
    recommendedVersion: null,
    latest: {
      entryId: id,
      version: revision,
      actor: tenant,
      instance: tenant,
      operationId: tenant,
      createdAt: 100,
      metadata: { name: id, category: 'custom', labels: [], usages: [], owner: '', notes: '' },
      facts: [],
      requestVersion: null,
      source: 'import',
    },
  }
}
it.each(['import', 'generate'] as const)(
  'blocks a lost second-page %s target after refresh and a successful append',
  async (mode) => {
    let revision = 1
    const list = vi.fn(async (query: { cursor?: string } = {}) => ({
      tenantId: tenant,
      items: [archiveEntry(query.cursor ? secondId : tenant, query.cursor ? revision : 1)],
      nextCursor: query.cursor ? null : 'YQ',
      asOf: 100,
      reminderDays: 30,
      alerts: { expired: 0, expiring: 0, notYetValid: 0 },
    }))
    const history = vi.fn(async (id: string) => [archiveEntry(id).latest])
    const write = vi.fn(async () => {
      revision++
      return {}
    })
    const { wrapper } = await setup({
      state: vi.fn().mockResolvedValue({
        initialized: true,
        generation: 1,
        unlockedUntil: Math.floor(Date.now() / 1000) + 900,
      }),
      list,
      history,
      [mode]: write,
    })
    const click = async (text: string) => {
      await wrapper
        .findAll('button')
        .find((b) => b.text() === text)!
        .trigger('click')
      await flushPromises()
    }
    await click('加载更多')
    await click(secondId)
    await wrapper.get('#archive-mode').setValue(mode)
    await click('刷新')
    expect((wrapper.get('#archive-target').element as HTMLSelectElement).value).toBe(secondId)
    const submit = async () => {
      if (mode === 'import') {
        const file = new File([], 'certificate.pem')
        Object.defineProperty(file, 'arrayBuffer', {
          value: async () => new TextEncoder().encode('fixture').buffer,
        })
        Object.defineProperty(wrapper.get('#archive-file').element, 'files', {
          configurable: true,
          value: [file],
        })
        await wrapper.get('#archive-file').trigger('change')
      }
      await wrapper
        .get('#archive-name')
        .element.closest('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flushPromises()
    }
    await submit()
    expect(write).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('对象或操作不存在')
    await click('加载更多')
    await submit()
    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0]).toEqual([
      expect.any(String),
      expect.objectContaining({ entryId: secondId, expectedRevision: 1 }),
    ])
    await submit()
    expect(write).toHaveBeenCalledTimes(1)
    await click('加载更多')
    await submit()
    expect(write).toHaveBeenCalledTimes(2)
    expect(write.mock.calls[1]).toEqual([
      expect.any(String),
      expect.objectContaining({ entryId: secondId, expectedRevision: 2 }),
    ])
    wrapper.unmount()
  },
)
it.each(['success', 'unknown'] as const)(
  'clears staged secrets before password rotation (%s)',
  async (result) => {
    let complete: () => void = () => {}
    const password = vi.fn(
      () =>
        new Promise((resolve, reject) => {
          complete = () => (result === 'success' ? resolve({}) : reject(new Error('lost response')))
        }),
    )
    const state = vi
      .fn()
      .mockResolvedValueOnce({
        initialized: true,
        generation: 1,
        unlockedUntil: Math.floor(Date.now() / 1000) + 900,
      })
      .mockResolvedValue({ initialized: true, generation: 2, unlockedUntil: null })
    const { wrapper } = await setup({ state, password })
    Object.defineProperty(wrapper.get('#archive-file').element, 'files', {
      configurable: true,
      value: [new File(['secret'], 'private.pfx')],
    })
    await wrapper.get('#archive-file').trigger('change')
    await wrapper.get('#archive-file-password-0').setValue('file password')
    await wrapper.get('#archive-old').setValue('old master password')
    await wrapper.get('#archive-new').setValue('new master password')
    await wrapper
      .get('#archive-old')
      .element.closest('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(password).toHaveBeenCalledWith(
      expect.any(String),
      'old master password',
      'new master password',
    )
    expect(wrapper.find('#archive-file-password-0').exists()).toBe(false)
    expect((wrapper.get('#archive-file').element as HTMLInputElement).value).toBe('')
    expect((wrapper.get('#archive-old').element as HTMLInputElement).value).toBe('')
    expect((wrapper.get('#archive-new').element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).not.toContain('当前会话已解锁')
    complete()
    await flushPromises()
    expect(wrapper.find('#archive-file-password-0').exists()).toBe(false)
    wrapper.unmount()
  },
)
it('edits certificate metadata, explicit issuance inputs, recommendation, export and reminder settings', async () => {
  const base = archiveEntry(tenant, 2)
  const entry = {
    ...base,
    latest: {
      ...base.latest,
      facts: [
        {
          name: 'fixture.pem',
          format: 'certificate',
          containsPrivateKey: true,
          publicKeys: ['a'.repeat(64)],
          certificates: [
            {
              subject: 'CN=fixture',
              issuer: 'CN=fixture CA',
              sans: ['fixture.example'],
              serial: '01',
              fingerprint: 'a'.repeat(64),
              algorithm: 'RSA/2048',
              notBefore: 50,
              notAfter: 200,
              publicKey: 'a'.repeat(64),
            },
          ],
        },
      ],
    },
  }
  const old = {
    ...archiveEntry(tenant).latest,
    metadata: { ...entry.latest.metadata, name: 'Previous certificate' },
  }
  const generate = vi.fn().mockResolvedValue({}),
    saveMetadata = vi.fn().mockResolvedValue({}),
    manage = vi.fn().mockResolvedValue({}),
    saveSettings = vi.fn().mockResolvedValue({}),
    exported = vi.fn().mockResolvedValue([{ name: 'synthetic.pem', data: 'c3ludGhldGlj' }])
  const objectUrl = vi.fn().mockReturnValue('blob:synthetic-archive'),
    revoke = vi.fn()
  const OriginalURL = URL
  vi.stubGlobal(
    'URL',
    class extends OriginalURL {
      static override createObjectURL = objectUrl
      static override revokeObjectURL = revoke
    },
  )
  const { wrapper } = await setup({
    state: vi.fn().mockResolvedValue({
      initialized: true,
      generation: 1,
      unlockedUntil: Math.floor(Date.now() / 1000) + 900,
    }),
    list: vi.fn().mockResolvedValue({
      tenantId: tenant,
      items: [entry],
      nextCursor: null,
      asOf: 100,
      reminderDays: 30,
      alerts: { expired: 0, expiring: 1, notYetValid: 0 },
    }),
    history: vi.fn().mockResolvedValue({ items: [entry.latest, old], nextCursor: null }),
    generate,
    saveMetadata,
    manage,
    saveSettings,
    export: exported,
  })
  const click = async (text: string) => {
    const button =
      wrapper.findAll('button').find((b) => b.text() === text) ??
      new DOMWrapper(
        [...document.querySelectorAll<HTMLButtonElement>('button')].find(
          (b) => b.textContent?.trim() === text,
        )!,
      )
    await button.trigger('click')
    await flushPromises()
  }
  try {
    await click(tenant)
    await wrapper.get('#archive-comparison').setValue(1)
    expect(wrapper.text()).toContain('Previous certificate')
    await wrapper.get('#archive-filter').setValue('all')
    await wrapper.get('#archive-name').setValue('HTTPS service')
    await wrapper.get('#archive-category').setValue('custom')
    await wrapper.get('#archive-labels').setValue('edge, service')
    await wrapper.get('#archive-usages').setValue('HTTPS\nInternal')
    await wrapper.get('#archive-owner').setValue('Platform')
    await wrapper.get('#archive-notes').setValue('Explicitly issued')
    await wrapper.get('#archive-mode').setValue('generate')
    await wrapper.get('#archive-profile').setValue('https')
    await wrapper.get('#archive-algorithm').setValue('p256')
    await wrapper.get('#archive-common-name').setValue('mdm.example.test')
    await wrapper.get('#archive-organization').setValue('Example')
    await wrapper.get('#archive-sans').setValue('mdm.example.test, endpoint.example.test')
    await wrapper.get('#archive-days').setValue(90)
    await wrapper.get('#archive-issuer').setValue(`${tenant}:2`)
    await new DOMWrapper(wrapper.get('#archive-name').element.closest('form')!).trigger('submit')
    await flushPromises()
    expect(generate.mock.calls[0]?.[1]).toMatchObject({
      entryId: tenant,
      expectedRevision: 2,
      profile: 'https',
      algorithm: 'p256',
      commonName: 'mdm.example.test',
      organization: 'Example',
      sans: ['mdm.example.test', 'endpoint.example.test'],
      days: 90,
      issuer: { entryId: tenant, version: 2 },
      metadata: {
        labels: ['edge', 'service'],
        usages: ['HTTPS', 'Internal'],
        owner: 'Platform',
        notes: 'Explicitly issued',
      },
    })
    await wrapper.get('#archive-target').setValue('')
    await wrapper.get('#archive-profile').setValue('scep_template')
    await wrapper.get('#archive-scep').setValue('https://scep.example.test/')
    await new DOMWrapper(wrapper.get('#archive-name').element.closest('form')!).trigger('submit')
    await flushPromises()
    expect(generate.mock.calls[1]?.[1]).toMatchObject({
      expectedRevision: 0,
      profile: 'scep_template',
      scepUrl: 'https://scep.example.test/',
      issuer: null,
    })
    await click(tenant)
    await wrapper.get('#archive-mode').setValue('metadata')
    await new DOMWrapper(wrapper.get('#archive-name').element.closest('form')!).trigger('submit')
    await flushPromises()
    expect(saveMetadata).toHaveBeenCalledWith(
      expect.any(String),
      tenant,
      2,
      expect.objectContaining({ name: tenant }),
    )
    await click('标为推荐版本')
    await click('确认')
    expect(manage).toHaveBeenLastCalledWith(expect.any(String), tenant, 2, false, 2)
    await click('授权导出本版本')
    await click('确认')
    expect(exported).toHaveBeenCalledWith(expect.any(String), { entryId: tenant, version: 2 })
    expect(wrapper.find('a[download="synthetic.pem"]').exists()).toBe(true)
    await click('清除导出材料')
    expect(revoke).toHaveBeenCalledWith('blob:synthetic-archive')
    await wrapper.get('#archive-reminder').setValue(14)
    await wrapper.get('#archive-category-settings').setValue('custom\nhttps')
    await new DOMWrapper(wrapper.get('#archive-reminder').element.closest('form')!).trigger(
      'submit',
    )
    await flushPromises()
    expect(saveSettings).toHaveBeenCalledWith(expect.any(String), 0, {
      reminderDays: 14,
      categories: ['custom', 'https'],
    })
    await click('标为退役')
    await click('确认')
    expect(manage).toHaveBeenLastCalledWith(expect.any(String), tenant, 2, true, null)
  } finally {
    wrapper.unmount()
    vi.unstubAllGlobals()
  }
})

it('preserves unedited metadata keys and the loaded revision when saving', async () => {
  const original = archiveEntry(tenant, 2)
  const entry = {
    ...original,
    latest: {
      ...original.latest,
      metadata: {
        ...original.latest.metadata,
        vendor: { help: ['中文', false] },
        tenant: 'untrusted',
      },
    },
  }
  const saveMetadata = vi.fn().mockResolvedValue({})
  const { wrapper } = await setup({
    state: vi.fn().mockResolvedValue({
      initialized: true,
      generation: 1,
      unlockedUntil: Math.floor(Date.now() / 1000) + 900,
    }),
    list: vi.fn().mockResolvedValue({
      tenantId: tenant,
      items: [entry],
      nextCursor: null,
      asOf: 100,
      reminderDays: 30,
      alerts: { expired: 0, expiring: 0, notYetValid: 0 },
    }),
    history: vi.fn().mockResolvedValue({ items: [entry.latest], nextCursor: null }),
    saveMetadata,
  })
  await wrapper
    .findAll('button')
    .find((button) => button.text() === entry.latest.metadata.name)!
    .trigger('click')
  await flushPromises()
  await wrapper.get('#archive-name').setValue('Edited')
  await wrapper.get('#archive-mode').setValue('metadata')
  wrapper
    .get('#archive-name')
    .element.closest('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flushPromises()
  expect(saveMetadata).toHaveBeenCalledWith(expect.any(String), tenant, 2, {
    ...entry.latest.metadata,
    name: 'Edited',
  })
  wrapper.unmount()
})
