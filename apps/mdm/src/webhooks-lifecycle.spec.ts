// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { act, createElement as h, useSyncExternalStore, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Delivery, Subscription, Webhooks as WebhookUseCases } from '@rss/mdm-webhooks'
import type { Runtime } from './runtime'
import type { GroupsUseCases } from './GroupPicker'
import { Webhooks } from './Webhooks'
import { WebhookSubscriptionAuthor } from './WebhookSubscriptionAuthor'
import { WebhookDeliveries } from './WebhookDeliveries'
import { WebhookSubscriptions } from './WebhookSubscriptions'
import { useWebhookCommand } from './WebhookCommand'
import { createWebhookMaterialRecovery } from './webhook-material-recovery'
import type { SessionOwner } from '@rss/auth-core'

const session = {
  status: 'authenticated',
  tenant: 'tenant',
  identity: { hasLocalPassword: true, principalId: 'principal' },
  session: { id: 'session' },
}
const id = '11111111-1111-4111-8111-111111111111',
  eventId = '22222222-2222-4222-8222-222222222222',
  operationId = '33333333-3333-4333-8333-333333333333'
let host: HTMLDivElement, root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const subscription: Subscription = {
  id,
  revision: 4,
  targetVersion: 2,
  enabled: true,
  deleted: false,
  settings: {
    presentation: { name: 'Saved subscription', vendor: { retained: true } },
    endpoint: 'https://receiver.example/events',
    eventTypes: ['device.registered'],
    selection: { kind: 'devices', ids: ['device'] },
    keyReference: 'key',
    networkReference: 'network',
  },
}
async function render(node: ReactNode) {
  await act(async () => root.render(node))
}
async function click(text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === text,
  )
  if (!button) throw new Error('Missing button: ' + text)
  await act(async () => button.click())
}
async function fill(label: string, value: string) {
  const node = [...host.querySelectorAll('label')].find((node) => node.textContent === label),
    input = node?.htmlFor
      ? (document.getElementById(node.htmlFor) as HTMLInputElement | null)
      : null
  if (!input) throw new Error('Missing input: ' + label)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function CommandHarness({ webhooks }: { webhooks: WebhookUseCases }) {
  const command = useWebhookCommand(webhooks, true)
  return h(
    'div',
    null,
    h('span', null, command.outcome),
    h(
      'button',
      {
        onClick: () =>
          void command.submit({
            kind: 'subscription',
            id,
            change: { operationId, expectedRevision: 0, input: { kind: 'enabled', value: true } },
          }),
      },
      'Invalid action',
    ),
  )
}
it('classifies a local invalid creation action as rejected without sending or retaining a write', async () => {
  const change = vi.fn<WebhookUseCases['change']>(),
    webhooks = { change } as unknown as WebhookUseCases
  await render(h(CommandHarness, { webhooks }))
  await click('Invalid action')
  expect(change).not.toHaveBeenCalled()
  expect(host.textContent).toContain('rejected')
  expect(host.textContent).not.toContain('unknown')
})
it('retains the exact unknown operation across effective-permission refresh without remounting its owner', async () => {
  const read = { operation: 'webhook_read', scope: { kind: 'tenant' } },
    write = { operation: 'webhook_write', scope: { kind: 'tenant' } },
    grants = { current: [read, write] },
    current = { value: subscription },
    change = vi
      .fn<WebhookUseCases['change']>()
      .mockRejectedValueOnce({ code: 'operation_unknown', status: 503 })
      .mockResolvedValue({ ...subscription, revision: 5, enabled: false }),
    webhooks = {
      eventTypes: vi.fn(async () => ({
        version: 1,
        items: [
          'device.registered',
          'device.retired',
          'policy.execution.terminal',
          'compliance.status.changed',
          'device.access.changed',
        ],
      })),
      subscriptions: vi.fn(async () => ({ items: [current.value], nextCursor: null })),
      subscription: vi.fn(async () => current.value),
      change,
    } as unknown as WebhookUseCases,
    runtime = {
      webhookMaterialRecovery: {
        available: () => false,
        take: async () => false,
        reauthenticate: async () => {},
      },
      owner: {
        subscribe: () => () => {},
        getSnapshot: () => session,
        reauthenticate: vi.fn(async () => {}),
      },
      administration: () => ({
        binding: 'tenant/principal/session',
        webhooks,
        groups: {} as GroupsUseCases,
        authorization: { effective: vi.fn(async () => ({ grants: grants.current })) },
      }),
    } as unknown as Runtime
  await render(
    h(
      MemoryRouter,
      { initialEntries: [`/webhooks?subscription=${id}`] },
      h(Webhooks, { runtime, locale: 'zh' }),
    ),
  )
  await click('停用订阅')
  expect(change).toHaveBeenCalledTimes(1)
  const original = change.mock.calls[0]![1]
  grants.current = [read]
  current.value = { ...subscription, revision: 5, enabled: false }
  await click('读取当前 Webhook 权限')
  grants.current = [read, write]
  await click('读取当前 Webhook 权限')
  await click('显式重提原 Webhook 请求')
  expect(change).toHaveBeenCalledTimes(2)
  expect(change.mock.calls[1]![1]).toEqual(original)
  expect(change.mock.calls[1]![1]).toMatchObject({
    expectedRevision: 4,
    input: { kind: 'enabled', value: false },
  })
})
it('clears a descriptive edit draft when write authority is removed and does not restore it later', async () => {
  const props = {
    webhooks: {} as WebhookUseCases,
    groups: {} as GroupsUseCases,
    initial: subscription,
    id,
    locale: 'zh' as const,
    permitted: true,
    onAccepted: () => {},
    onClose: () => {},
  }
  await render(h(MemoryRouter, null, h(WebhookSubscriptionAuthor, props)))
  await fill('订阅名称', 'draft-that-must-be-cleared')
  await render(h(MemoryRouter, null, h(WebhookSubscriptionAuthor, { ...props, permitted: false })))
  expect(
    [...host.querySelectorAll<HTMLInputElement>('input')].some(
      (input) => input.value === 'draft-that-must-be-cleared',
    ),
  ).toBe(false)
  await render(h(MemoryRouter, null, h(WebhookSubscriptionAuthor, props)))
  expect(
    [...host.querySelectorAll<HTMLInputElement>('input')].some(
      (input) => input.value === 'draft-that-must-be-cleared',
    ),
  ).toBe(false)
})
it('does not offer recovery for a pending delivery with ambiguous transport observation', async () => {
  const value = {
      id,
      eventId,
      subscriptionId: id,
      targetVersion: 2,
      sourceDelivery: null,
      recoveryVersion: 7,
      redriveWindowOpen: true,
      attempts: 1,
      status: 'pending',
      transportObservation: 'unknown',
      failureStage: 'transport',
      failureReason: null,
    },
    webhooks = {
      deliveries: vi.fn(async () => ({ items: [value], nextCursor: null })),
      delivery: vi.fn(async () => value),
    } as unknown as WebhookUseCases
  await render(
    h(
      MemoryRouter,
      { initialEntries: [`/webhooks?tab=deliveries&delivery=${id}`] },
      h(WebhookDeliveries, {
        webhooks,
        binding: 'tenant/principal/session',
        authority: 'current',
        locale: 'zh',
        canRead: true,
        canReplay: true,
        blocked: false,
      }),
    ),
  )
  for (const text of ['创建重放投递', '恢复原投递'])
    expect(
      [...host.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent === text,
      )?.disabled,
    ).toBe(true)
  expect(host.textContent).toContain('pending 或 unknown')
})

it('hides previous subscription directory facts when detail reread returns 403 without a grant refresh', async () => {
  const subscriptionRead = vi
      .fn<WebhookUseCases['subscription']>()
      .mockResolvedValueOnce(subscription)
      .mockRejectedValue({ code: 'forbidden', status: 403 }),
    subscriptions = vi
      .fn<WebhookUseCases['subscriptions']>()
      .mockResolvedValueOnce({ items: [subscription], nextCursor: null })
      .mockResolvedValue({ items: [], nextCursor: null }),
    webhooks = {
      subscription: subscriptionRead,
      subscriptions,
      eventTypes: vi.fn(async () => ({ version: 1, items: [] })),
    } as unknown as WebhookUseCases,
    runtime = {
      webhookMaterialRecovery: {
        available: () => false,
        take: async () => false,
        reauthenticate: async () => {},
      },
      owner: {
        subscribe: () => () => {},
        getSnapshot: () => session,
        reauthenticate: vi.fn(async () => {}),
      },
      administration: () => ({
        binding: 'tenant/principal/session',
        webhooks,
        groups: {} as GroupsUseCases,
        authorization: {
          effective: vi.fn(async () => ({
            grants: [{ operation: 'webhook_read', scope: { kind: 'tenant' } }],
          })),
        },
      }),
    } as unknown as Runtime
  await render(
    h(
      MemoryRouter,
      { initialEntries: [`/webhooks?subscription=${id}`] },
      h(Webhooks, { runtime, locale: 'zh' }),
    ),
  )
  expect(host.textContent).toContain('Saved subscription')
  await click('重新读取订阅详情')
  expect(host.textContent).not.toContain('Saved subscription')
  expect(host.textContent).toContain('已隐藏此前目录')
  await click('关闭订阅详情')
  expect(host.textContent).not.toContain('Saved subscription')
  expect(subscriptions).toHaveBeenCalledTimes(1)
  await click('读取订阅目录')
  expect(subscriptions).toHaveBeenCalledTimes(2)
  expect(subscriptionRead).toHaveBeenCalledTimes(2)
  expect(host.textContent).not.toContain('Saved subscription')
})

it('returns to a retained unknown material task after closing or authority refresh, reauthenticates in place and reads its exact original receipt', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  const read = { operation: 'webhook_read', scope: { kind: 'tenant' } },
    write = { operation: 'webhook_write', scope: { kind: 'tenant' } },
    grants = { current: [read, write] },
    reauthenticate = vi.fn(async (_password: string) => {}),
    prepare = vi
      .fn<WebhookUseCases['prepare']>()
      .mockRejectedValue({ code: 'operation_unknown', status: 503 }),
    materialOperation = vi.fn<WebhookUseCases['materialOperation']>(),
    webhooks = {
      prepare,
      materialOperation,
      materials: vi.fn(async () => ({
        configurationSha256: 'a'.repeat(64),
        heads: [],
        materials: [],
      })),
    } as unknown as WebhookUseCases,
    listeners = new Set<() => void>(),
    state = { current: session },
    owner = {
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      getSnapshot: () => state.current,
      reauthenticate: async (password: string) => {
        await reauthenticate(password)
        state.current = { ...session, session: { id: 'rotated-session' } }
        for (const listener of listeners) listener()
      },
    },
    recovery = createWebhookMaterialRecovery(owner as unknown as SessionOwner),
    runtime = {
      webhookMaterialRecovery: recovery,
      owner,
      administration: () => ({
        binding: `tenant/principal/${state.current.session.id}`,
        webhooks,
        groups: {} as GroupsUseCases,
        authorization: { effective: vi.fn(async () => ({ grants: grants.current })) },
      }),
    } as unknown as Runtime
  function BoundFeature() {
    const current = useSyncExternalStore(owner.subscribe, owner.getSnapshot)
    return h('div', { key: current.session.id }, h(Webhooks, { runtime, locale: 'zh' }))
  }
  await render(h(MemoryRouter, { initialEntries: ['/webhooks?tab=materials'] }, h(BoundFeature)))
  await click('管理签名材料')
  await fill('材料签名引用', 'original-signing')
  await click('采用当前读取的配置版本')
  await fill('确认接收地址', 'https://receiver.example/confirm')
  await fill('确认网络引用', 'network')
  await click('提交材料操作')
  expect(prepare).toHaveBeenCalledTimes(1)
  const [originalId, originalInput] = prepare.mock.calls[0]!
  const recorded = {
    operationId: originalId,
    reference: originalInput.reference,
    revision: 1,
    configurationSha256: originalInput.configurationSha256,
    endpoint: originalInput.endpoint,
    networkReference: originalInput.networkReference,
    keyDigest: 'b'.repeat(64),
    challenge: 'public',
    confirmed: false,
    revoked: false,
    attemptedAt: null,
    confirmedAt: null,
    failureReason: null,
  }
  materialOperation.mockResolvedValue(recorded)
  await click('关闭材料任务')
  await click('返回材料任务')
  expect(host.textContent).toContain(originalId)
  grants.current = [read]
  await click('读取当前 Webhook 权限')
  await click('返回材料任务')
  expect(
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === '读取冻结材料原操作',
    )?.disabled,
  ).toBe(false)
  grants.current = [read, write]
  await click('读取当前 Webhook 权限')
  await click('返回材料任务')
  await fill('材料操作重新认证密码', 'ephemeral-password')
  await click('重新认证并保留原操作')
  expect(reauthenticate).toHaveBeenCalledExactlyOnceWith('ephemeral-password')
  expect(
    host.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')?.value,
  ).toBe('')
  expect(host.querySelector('a[href="/security"]')).toBeNull()
  expect(prepare).toHaveBeenCalledTimes(1)
  expect(host.textContent).toContain(originalId)
  await click('读取冻结材料原操作')
  expect(materialOperation).toHaveBeenCalledExactlyOnceWith(originalId)
  expect(host.textContent).toContain('原操作记录已读取')
  expect(host.textContent).not.toContain('原材料操作回执已确认')
  expect(prepare).toHaveBeenCalledTimes(1)
  prepare.mockResolvedValueOnce(recorded)
  await click('显式重提原材料请求')
  expect(host.textContent).toContain('原材料操作回执已确认')
  expect(prepare).toHaveBeenCalledTimes(2)
  expect(prepare.mock.calls[1]).toEqual(prepare.mock.calls[0])
})

it('keeps denied delivery rows hidden after closing or selecting another detail and after a failed directory refresh', async () => {
  const value: Delivery = {
      id,
      eventId,
      subscriptionId: id,
      targetVersion: 2,
      sourceDelivery: null,
      recoveryVersion: 7,
      redriveWindowOpen: false,
      attempts: 1,
      status: 'pending',
      transportObservation: 'unknown',
      failureStage: null,
      failureReason: null,
    },
    deliveries = vi
      .fn<WebhookUseCases['deliveries']>()
      .mockResolvedValueOnce({ items: [value], nextCursor: null })
      .mockRejectedValueOnce({ code: 'forbidden', status: 403 })
      .mockResolvedValue({ items: [], nextCursor: null }),
    delivery = vi
      .fn<WebhookUseCases['delivery']>()
      .mockResolvedValueOnce(value)
      .mockRejectedValue({ code: 'forbidden', status: 403 }),
    webhooks = { deliveries, delivery } as unknown as WebhookUseCases
  await render(
    h(
      MemoryRouter,
      { initialEntries: [`/webhooks?tab=deliveries&delivery=${id}`] },
      h(WebhookDeliveries, {
        webhooks,
        binding: 'tenant/principal/session',
        authority: 'current',
        locale: 'zh',
        canRead: true,
        canReplay: false,
        blocked: false,
      }),
    ),
  )
  expect(host.querySelectorAll('tbody [data-row-key], tbody tr[data-row-key]').length).toBe(1)
  await click('重新读取投递详情')
  expect(host.querySelectorAll('tbody tr[data-row-key]').length).toBe(0)
  await click('关闭投递详情')
  expect(host.querySelectorAll('tbody tr[data-row-key]').length).toBe(0)
  expect(deliveries).toHaveBeenCalledTimes(1)
  await fill('已知投递 UUID', eventId)
  await click('定位精确投递')
  expect(host.querySelectorAll('tbody tr[data-row-key]').length).toBe(0)
  expect(deliveries).toHaveBeenCalledTimes(1)
  await click('读取投递目录')
  expect(host.querySelectorAll('tbody tr[data-row-key]').length).toBe(0)
  expect(host.textContent).toContain('已隐藏此前目录')
  await click('读取投递目录')
  expect(deliveries).toHaveBeenCalledTimes(3)
  expect(host.textContent).not.toContain('已隐藏此前目录')
})

it.each(['subscription', 'delivery'] as const)(
  'does not release the %s directory fence when a read started before denial finishes late',
  async (kind) => {
    const value: Delivery = {
      id,
      eventId,
      subscriptionId: id,
      targetVersion: 2,
      sourceDelivery: null,
      recoveryVersion: 7,
      redriveWindowOpen: false,
      attempts: 1,
      status: 'pending',
      transportObservation: 'unknown',
      failureStage: null,
      failureReason: null,
    }
    const page = { items: [kind === 'subscription' ? subscription : value], nextCursor: null }
    let finish!: (result: typeof page) => void
    const directory = vi
      .fn()
      .mockResolvedValueOnce(page)
      .mockImplementationOnce(
        () =>
          new Promise<typeof page>((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValue({ items: [], nextCursor: null })
    const detail = vi
      .fn()
      .mockResolvedValueOnce(kind === 'subscription' ? subscription : value)
      .mockRejectedValue({ code: 'forbidden', status: 403 })
    const webhooks = {
      subscriptions: directory,
      deliveries: directory,
      subscription: detail,
      delivery: detail,
      eventTypes: vi.fn(async () => ({ version: 1, items: [] })),
    } as unknown as WebhookUseCases
    const common = {
      webhooks,
      binding: 'tenant/principal/session',
      authority: 'current',
      locale: 'zh' as const,
      canRead: true,
      blocked: false,
    }
    await render(
      h(
        MemoryRouter,
        { initialEntries: [`/webhooks?${kind}=${id}`] },
        kind === 'subscription'
          ? h(WebhookSubscriptions, { ...common, groups: {} as GroupsUseCases, canWrite: false })
          : h(WebhookDeliveries, { ...common, canReplay: false }),
      ),
    )
    const title = kind === 'subscription' ? '订阅' : '投递'
    expect(host.querySelectorAll('tbody tr[data-row-key]').length).toBe(1)
    await click(`读取${title}目录`)
    expect(directory).toHaveBeenCalledTimes(2)
    await click(`重新读取${title}详情`)
    expect(host.textContent).toContain('已隐藏此前目录')
    await act(async () => finish(page))
    expect(host.querySelectorAll('tbody tr[data-row-key]').length).toBe(0)
    expect(host.textContent).toContain('已隐藏此前目录')
    await click(`关闭${title}详情`)
    expect(host.querySelectorAll('tbody tr[data-row-key]').length).toBe(0)
    await click(`读取${title}目录`)
    expect(directory).toHaveBeenCalledTimes(3)
    expect(host.textContent).not.toContain('已隐藏此前目录')
  },
)
