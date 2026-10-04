import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import { createAutomationDemo } from '../../../../demo/policies/state'
import { createDeviceDemo } from '../../../../demo/devices/state'
import { seedScriptPolicies } from '../../../../demo/policies/seed'
import PoliciesView from './PoliciesView.vue'
import type { PolicyRead } from '../clients/model'
async function fixture(unknown = false, configuration = false) {
  const automation = createAutomationDemo(createDeviceDemo()),
    seed = seedScriptPolicies(automation)
  const actor = {
    principalId: '22222222-2222-4222-8222-222222222222',
    sessionId: crypto.randomUUID(),
  }
  const original = automation.handle(
    {
      path: `/api/v1/policies/${seed.ids[1]}`,
      method: 'GET',
      body: undefined,
      actor,
      headers: {},
      query: new URLSearchParams(),
    },
    'normal',
  )!.body as PolicyRead
  const nativeResource = {
    id: 'native-camera',
    revision: 3,
    kind: 'configuration',
    versions: [
      {
        id: '1',
        state: 'active',
        digest: Array(32).fill(1),
        variants: [
          {
            platform: 'windows',
            architecture: 'x86_64',
            key: 'default',
            declaration: {
              kind: 'configuration',
              artifact: { reference: 'native.json', length: 30, sha256: Array(32).fill(1) },
            },
          },
        ],
      },
    ],
  }
  const old: PolicyRead = configuration
    ? {
        ...original,
        definition: {
          scope: original.definition.scope,
          action: {
            kind: 'configuration',
            resource: {
              id: nativeResource.id,
              version: '1',
              platform: 'windows',
              architecture: 'x86_64',
              variant: 'default',
            },
            exit: 'retain',
          },
        },
      }
    : original
  const preview = vi.fn().mockResolvedValue({
      action: old.definition.action,
      scopeResult: crypto.randomUUID(),
      items: [
        {
          device: 'device-01',
          eligibility: { state: 'eligible', entry: 1 },
          taskAdmission: null,
        },
      ],
      nextCursor: null,
    }),
    devices = vi.fn().mockResolvedValue({
      items: [
        {
          device: 'device-01',
          assignment: 'eligible',
          taskAdmission: null,
          operationIds: [crypto.randomUUID(), crypto.randomUUID()],
          diagnoses: ['configuration_conflict', 'removing'],
        },
      ],
      nextCursor: null,
    })
  const read = vi.fn().mockResolvedValue(old),
    list = vi.fn().mockResolvedValue({ items: [old], nextCursor: null })
  const change = vi.fn(async (_id: string, body: { input: { definition?: unknown } }) => {
    if (unknown) throw new Error('lost response')
    return {
      ...old,
      revision: old.revision + 1,
      definition: body.input.definition ?? old.definition,
    }
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: PoliciesView }],
  })
  await router.push(`/?id=${old.id}`)
  const wrapper = mount(PoliciesView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          policies: {
            policies: { read, list, change, preview, devices },
            resources: {
              read: vi
                .fn()
                .mockResolvedValue(
                  configuration ? nativeResource : automation.resources.read(seed.resource),
                ),
            },
          },
        },
      },
    },
  })
  await flushPromises()
  const button = (text: string) => wrapper.findAll('button').find((b) => b.text() === text)!
  await button('加载资源版本').trigger('click')
  await flushPromises()
  return { wrapper, change, read, button, router, preview, devices }
}
it('reads a deep-linked formal Policy, retains false/1 and saves Resource parameter sources without schema copies', async () => {
  const f = await fixture()
  expect(f.read).toHaveBeenCalledTimes(1)
  expect((f.wrapper.get('[data-field="allowAi"]').element as HTMLInputElement).checked).toBe(false)
  expect((f.wrapper.get('[data-field="riskLevel"]').element as HTMLSelectElement).value).toBe('1')
  expect(f.wrapper.find('#value-label').exists()).toBe(false)
  expect(f.wrapper.find('#value-detail').exists()).toBe(true)
  await f.wrapper.get('[data-field="published"]').setValue(false)
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(f.change.mock.calls[0]?.[1]).toMatchObject({
    input: {
      action: 'put',
      enabled: true,
      definition: {
        selfService: { published: false, allowAi: false, riskLevel: 1 },
        action: { parameters: { label: { kind: 'input' }, detail: { kind: 'fixed', value: 1 } } },
      },
    },
  })
  f.wrapper.unmount()
})
it('keeps an Unknown operation fenced after a configuration read and never replays it', async () => {
  const f = await fixture(true)
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(f.change).toHaveBeenCalledTimes(1)
  expect(f.button('新建').attributes('disabled')).toBeDefined()
  await f.button('重新载入配置（替换编辑）').trigger('click')
  await flushPromises()
  expect(f.read).toHaveBeenCalledTimes(2)
  expect(f.button('新建').attributes('disabled')).toBeDefined()
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(f.change).toHaveBeenCalledTimes(1)
  f.wrapper.unmount()
})

it('shows Resource bounds, starts numeric fixed values within bounds, and follows query locators', async () => {
  const f = await fixture()
  expect(f.wrapper.get('#value-detail').attributes()).toMatchObject({ min: '1', max: '3' })
  await f.wrapper.get('#policy-variant').setValue('0')
  expect((f.wrapper.get('#value-detail').element as HTMLInputElement).value).toBe('1')
  expect(f.wrapper.get('#value-label').attributes()).toMatchObject({
    minlength: '1',
    maxlength: '80',
  })
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(f.change).not.toHaveBeenCalled()
  const next = crypto.randomUUID()
  f.read.mockImplementation(async (id: string) => ({
    ...(await f.read.mock.results[0]!.value),
    id,
  }))
  await f.router.push({ query: { id: next } })
  await flushPromises()
  expect(f.read).toHaveBeenLastCalledWith(next)
  expect((f.wrapper.get('#policy-id').element as HTMLInputElement).value).toBe(next)
  const first = f.wrapper.findAll('li button')[0]!
  await first.trigger('click')
  await flushPromises()
  expect(f.router.currentRoute.value.query['id']).toBe(
    (f.wrapper.get('#policy-id').element as HTMLInputElement).value,
  )
  f.wrapper.unmount()
})

it.each(['not found', 'denied', 'network', 'invalid DTO'])(
  'invalidates A before B read and keeps failed B unwritable (%s)',
  async (reason) => {
    const f = await fixture()
    const old = (f.wrapper.get('#policy-id').element as HTMLInputElement).value
    f.read.mockRejectedValueOnce(new Error(reason))
    const target = crypto.randomUUID()
    await f.router.push({ query: { id: target } })
    await flushPromises()
    expect((f.wrapper.get('#policy-id').element as HTMLInputElement).value).toBe(target)
    expect(f.wrapper.find('#value-detail').exists()).toBe(false)
    expect(f.wrapper.findAll('button').some((b) => b.text() === '停用')).toBe(false)
    expect(f.wrapper.get('form > fieldset').attributes('disabled')).toBeDefined()
    await f.wrapper.get('form').trigger('submit')
    expect(f.change).not.toHaveBeenCalled()
    f.router.back()
    await flushPromises()
    expect((f.wrapper.get('#policy-id').element as HTMLInputElement).value).toBe(old)
    expect(f.wrapper.get('form > fieldset').attributes('disabled')).toBeUndefined()
    f.wrapper.unmount()
  },
)
it('fences pending and late B reads when navigating to C', async () => {
  const f = await fixture()
  const old = await f.read.mock.results[0]!.value
  let finish!: (value: PolicyRead) => void
  f.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const b = crypto.randomUUID(),
    c = crypto.randomUUID()
  await f.router.push({ query: { id: b } })
  expect(f.wrapper.get('form > fieldset').attributes('disabled')).toBeDefined()
  await f.wrapper.get('form').trigger('submit')
  expect(f.change).not.toHaveBeenCalled()
  f.read.mockResolvedValueOnce({ ...old, id: c })
  await f.router.push({ query: { id: c } })
  await flushPromises()
  finish({ ...old, id: b })
  await flushPromises()
  expect((f.wrapper.get('#policy-id').element as HTMLInputElement).value).toBe(c)
  expect(f.wrapper.get('form > fieldset').attributes('disabled')).toBeUndefined()
  f.wrapper.unmount()
})

it('authors continuous configuration with an exact Resource and exit behavior through the shared Policy client', async () => {
  const f = await fixture(false, true)
  expect((f.wrapper.get('#policy-action').element as HTMLSelectElement).value).toBe('configuration')
  expect(f.wrapper.find('[data-field="published"]').exists()).toBe(false)
  expect(f.wrapper.find('#policy-frequency').exists()).toBe(false)
  await f.wrapper.get('#policy-exit').setValue('remove')
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(f.change.mock.calls[0]![1]).toMatchObject({
    input: {
      action: 'put',
      enabled: true,
      definition: {
        action: {
          kind: 'configuration',
          resource: {
            id: 'native-camera',
            version: '1',
            platform: 'windows',
            architecture: 'x86_64',
            variant: 'default',
          },
          exit: 'remove',
        },
      },
    },
  })
  expect(f.change.mock.calls[0]![1].input.definition).not.toHaveProperty('selfService')
  f.wrapper.unmount()
})

it('offers configuration creation in the Policy page and sends current exact bindings with revision zero', async () => {
  const f = await fixture(false, true)
  await f.button('新建').trigger('click')
  await flushPromises()
  await f.wrapper.get('#policy-action').setValue('configuration')
  await f.wrapper.get('#policy-resource').setValue('native-camera')
  await f.wrapper.get('#policy-scope').setValue(crypto.randomUUID())
  await f.button('加载资源版本').trigger('click')
  await flushPromises()
  await f.wrapper.get('#policy-variant').setValue('0')
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(f.change.mock.calls[0]![1]).toMatchObject({
    expectedRevision: 0,
    input: {
      action: 'put',
      enabled: false,
      definition: { action: { kind: 'configuration', exit: 'retain' } },
    },
  })
  f.wrapper.unmount()
})

it('shows the current configuration preview and all progress operations and diagnoses', async () => {
  const f = await fixture(false, true)
  await f.button('预览').trigger('click')
  await flushPromises()
  expect(f.preview).toHaveBeenCalledTimes(1)
  expect(f.preview.mock.calls[0]![0].action.kind).toBe('configuration')
  await f.button('刷新进度（保留编辑）').trigger('click')
  await flushPromises()
  expect(f.devices).toHaveBeenCalledTimes(1)
  const row = (await f.devices.mock.results[0]!.value).items[0]!
  for (const fact of [...row.operationIds, ...row.diagnoses])
    expect(f.wrapper.text()).toContain(fact)
  f.wrapper.unmount()
})
