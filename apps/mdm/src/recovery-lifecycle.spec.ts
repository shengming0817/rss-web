// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { act, createElement as h, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMaterialAuthorization, type OperationAuthorizationPort } from '@rss/auth-core'
import type { Material, RecoveryCredentials } from '@rss/mdm-recovery-credentials'
import type { ViewEndpoint } from '@rss/mdm-devices'
import type { Runtime } from './runtime'
import { createCeremonyHandoff } from './ceremony-handoff'
import { MaterialDisclosure } from './MaterialDisclosure'
import { RecoveryDisclosure } from './RecoveryDisclosure'
import { FileVaultCredentials } from './FileVaultCredentials'
import { NativeCredentialOperation } from './NativeCredentialOperation'
import { devicePermission } from './DeviceSecurity'
const id = '11111111-1111-4111-8111-111111111111',
  operationId = '22222222-2222-4222-8222-222222222222',
  registration = '33333333-3333-4333-8333-333333333333',
  target = { device: 'device-a', id, version: 2 }
const navigatorDescriptor = Object.getOwnPropertyDescriptor(navigator, 'credentials')
let host: HTMLDivElement, root: Root
class Authenticator {
  static parseRequestOptionsFromJSON(value: unknown) {
    return value
  }
  toJSON() {
    return { id: 'authenticator-response' }
  }
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('PublicKeyCredential', Authenticator)
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
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: { get: vi.fn(async () => new Authenticator()) },
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (navigatorDescriptor) Object.defineProperty(navigator, 'credentials', navigatorDescriptor)
  else Reflect.deleteProperty(navigator, 'credentials')
})
function inject<T>(methods: Partial<T>): T {
  return new Proxy(methods as T & object, {
    get(target, key) {
      if (!(key in target)) throw new Error(`Unexpected use case: ${String(key)}`)
      return Reflect.get(target, key)
    },
  }) as T
}
async function render(node: ReactNode) {
  await act(async () => root.render(node))
}
function button(text: string) {
  const value = [...host.querySelectorAll('button')].find(
    (node) => node.textContent === text && !node.closest('[hidden]'),
  )
  if (!value) throw new Error(`Missing button: ${text}`)
  return value
}
async function click(text: string) {
  await act(async () => button(text).click())
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { resolve, promise }
}
const material = (login = false): Material => ({
  id,
  version: 2,
  binding: {
    device: target.device,
    registration,
    generation: 3,
    subject: login
      ? {
          kind: 'rss_login',
          binding: operationId,
          bindingGeneration: 2,
          sid: 'S-1-5-21-1-2-3-1001',
        }
      : { kind: 'recovery_lock' },
  },
  current: true,
  validity: 'unverified',
  escrowed: true,
  operation: operationId,
  createdAt: 1700000000,
  invalidatedAt: null,
})
function fixture(overrides: Partial<OperationAuthorizationPort> = {}) {
  const port: OperationAuthorizationPort = {
      finish: vi.fn(async () => Math.floor(Date.now() / 1000) + 60),
      cancelCeremony: vi.fn(async () => {}),
      cancelAuthorization: vi.fn(async () => {}),
      classify: () => 'unknown',
      ...overrides,
    },
    authorization = createMaterialAuthorization(port, () => 'tenant/principal/session'),
    runtime = {
      materialAuthorization: authorization,
      ...createCeremonyHandoff(authorization, async () => {}),
    } as unknown as Runtime
  return { runtime, authorization, port }
}
function disclosure(
  runtime: Runtime,
  credentials: RecoveryCredentials,
  login = false,
  permitted = true,
) {
  return h(MaterialDisclosure, {
    runtime,
    credentials,
    target,
    rssLogin: login,
    permitted,
    locale: 'zh',
  })
}
function endpoint(): ViewEndpoint {
  return {
    id: target.device,
    status: 'active',
    assetState: 'active',
    platform: { state: 'known', values: ['macos'] },
    primaryMdmRegistration: { registrationId: registration, generation: 3, source: 'mdm.apple' },
    channels: [
      {
        channel: 'mdm',
        registrationId: registration,
        generation: 3,
        status: 'active',
        source: 'mdm.apple',
        platform: 'macos',
        lastCommunicationReceivedAt: null,
        children: [],
        userContext: null,
      },
    ],
    enrollments: [],
  }
}
const configuration = () => ({
  enabled: true,
  revision: 5,
  materialRevision: 12,
  custodyId: operationId,
  custodyEpoch: 8,
  recipientId: 'recipient',
  recipientCertificate: 'public certificate',
})
it('does not request directory metadata while disclosing and clears an ordinary secret on permission loss', async () => {
  const f = fixture(),
    reveal = vi
      .fn<RecoveryCredentials['reveal']>()
      .mockResolvedValue({ material: material(), secret: 'synthetic-sensitive-value' }),
    credentials = inject<RecoveryCredentials>({ reveal })
  await render(disclosure(f.runtime, credentials))
  await click('披露此精确材料')
  expect(host.textContent).toContain('synthetic-sensitive-value')
  await render(disclosure(f.runtime, credentials, false, false))
  expect(host.textContent).not.toContain('synthetic-sensitive-value')
  expect(reveal).toHaveBeenCalledOnce()
})
it('ignores late ordinary disclosure after hiding and never writes a secret to storage', async () => {
  const f = fixture(),
    response = deferred<{ material: Material; secret: string }>(),
    credentials = inject<RecoveryCredentials>({ reveal: vi.fn(() => response.promise) }),
    storage = vi.spyOn(Storage.prototype, 'setItem')
  await render(disclosure(f.runtime, credentials))
  await click('披露此精确材料')
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await act(async () => response.resolve({ material: material(), secret: 'late-sensitive-value' }))
  expect(host.textContent).not.toContain('late-sensitive-value')
  expect(storage).not.toHaveBeenCalled()
})
it('authorizes the formal RSS Login purpose without automatically disclosing, then consumes the exact operation', async () => {
  const f = fixture(),
    begin = vi
      .fn<RecoveryCredentials['beginLoginDisclosure']>()
      .mockResolvedValue({ id: registration, publicKey: { challenge: 'public' } }),
    reveal = vi
      .fn<RecoveryCredentials['revealLogin']>()
      .mockResolvedValue({ material: material(true), secret: 'synthetic-login-value' }),
    credentials = inject<RecoveryCredentials>({ beginLoginDisclosure: begin, revealLogin: reveal })
  await render(disclosure(f.runtime, credentials, true))
  await click('验证此精确披露用途')
  expect(reveal).not.toHaveBeenCalled()
  expect(f.authorization.getSnapshot().context).toMatchObject({
    purpose: 'mdm.device_access.disclose',
    device: target.device,
    material: id,
    version: 2,
  })
  await click('披露此精确材料')
  expect(reveal.mock.calls[0]![0]).toEqual(begin.mock.calls[0]![0])
  expect(f.authorization.getSnapshot().status).toBe('consumed')
  expect(host.textContent).toContain('synthetic-login-value')
})
it('retains the same UUID on unknown disclosure and recovers only after an explicit user action', async () => {
  const f = fixture(),
    begin = vi
      .fn<RecoveryCredentials['beginLoginDisclosure']>()
      .mockResolvedValue({ id: registration, publicKey: { challenge: 'public' } }),
    reveal = vi
      .fn<RecoveryCredentials['revealLogin']>()
      .mockRejectedValueOnce({ status: 503, code: 'operation_unknown' })
      .mockResolvedValueOnce({ material: material(true), secret: 'recovered-value' }),
    credentials = inject<RecoveryCredentials>({ beginLoginDisclosure: begin, revealLogin: reveal })
  await render(disclosure(f.runtime, credentials, true))
  await click('验证此精确披露用途')
  await click('披露此精确材料')
  expect(reveal).toHaveBeenCalledOnce()
  expect(host.textContent).toContain('原披露结果未知')
  await click('显式恢复原披露')
  expect(reveal.mock.calls[1]![0]).toEqual(reveal.mock.calls[0]![0])
  expect(begin).toHaveBeenCalledOnce()
  expect(host.textContent).toContain('recovered-value')
})
it('does not disclose after unknown authorization finish and exposes explicit cancellation', async () => {
  const f = fixture({
      finish: vi.fn(async () => {
        throw new Error('connection lost')
      }),
    }),
    begin = vi
      .fn<RecoveryCredentials['beginLoginDisclosure']>()
      .mockResolvedValue({ id: registration, publicKey: { challenge: 'public' } }),
    reveal = vi.fn<RecoveryCredentials['revealLogin']>(),
    credentials = inject<RecoveryCredentials>({ beginLoginDisclosure: begin, revealLogin: reveal })
  await render(disclosure(f.runtime, credentials, true))
  await click('验证此精确披露用途')
  expect(f.authorization.getSnapshot().status).toBe('unknown')
  expect(button('披露此精确材料').disabled).toBe(true)
  expect(reveal).not.toHaveBeenCalled()
  await click('取消用途认证')
  expect(f.port.cancelAuthorization).toHaveBeenCalledOnce()
  expect(f.authorization.getSnapshot().status).toBe('cancelled')
})
it('aborts a pending authenticator prompt and rejects its late result', async () => {
  const f = fixture(),
    response = deferred<Authenticator>(),
    begin = vi
      .fn<RecoveryCredentials['beginLoginDisclosure']>()
      .mockResolvedValue({ id: registration, publicKey: { challenge: 'public' } }),
    credentials = inject<RecoveryCredentials>({ beginLoginDisclosure: begin })
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: { get: vi.fn(() => response.promise) },
  })
  await render(disclosure(f.runtime, credentials, true))
  await click('验证此精确披露用途')
  await click('取消用途认证')
  await act(async () => response.resolve(new Authenticator()))
  expect(f.port.finish).not.toHaveBeenCalled()
  expect(f.port.cancelCeremony).toHaveBeenCalledWith(registration)
  expect(f.authorization.getSnapshot().status).toBe('cancelled')
})
it('expires completed purpose authorization and prevents later disclosure', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  const f = fixture({ finish: vi.fn(async () => Math.floor(Date.now() / 1000) + 1) }),
    credentials = inject<RecoveryCredentials>({
      beginLoginDisclosure: vi.fn(async () => ({
        id: registration,
        publicKey: { challenge: 'public' },
      })),
    })
  await render(disclosure(f.runtime, credentials, true))
  await click('验证此精确披露用途')
  await act(async () => vi.advanceTimersByTimeAsync(1100))
  expect(button('披露此精确材料').disabled).toBe(true)
  expect(host.textContent).toContain('用途认证已到期')
})
it('uses FileVault configuration CAS and keeps the original registration across generation changes', async () => {
  const configure = vi
      .fn<RecoveryCredentials['configure']>()
      .mockRejectedValue({ status: 409, code: 'operation_conflict' }),
    credentials = inject<RecoveryCredentials>({
      configuration: vi.fn(async () => configuration()),
      configure,
    }),
    device = endpoint()
  await render(
    h(FileVaultCredentials, { credentials, endpoint: device, locale: 'zh', permitted: true }),
  )
  await click('保存 FileVault 收集授权')
  expect(configure.mock.calls[0]![1]).toMatchObject({
    registration,
    generation: 3,
    expectedRevision: 5,
  })
  const original = configure.mock.calls[0]![1]
  await render(
    h(FileVaultCredentials, {
      credentials,
      endpoint: {
        ...device,
        channels: device.channels.map((channel) => ({ ...channel, generation: 4 })),
      },
      locale: 'zh',
      permitted: true,
    }),
  )
  await click('显式重提原 FileVault 配置操作')
  expect(configure.mock.calls[1]![1]).toEqual(original)
})
it('freezes native material CAS and deadline without treating acceptance as device verification', async () => {
  const create = vi.fn<RecoveryCredentials['create']>().mockImplementation(async (intent) => ({
      operationId: intent.operationId,
      commandId: intent.operationId,
      revision: 1,
      accepted: true,
    })),
    read = vi.fn<RecoveryCredentials['operation']>(),
    credentials = inject<RecoveryCredentials>({
      configuration: vi.fn(async () => configuration()),
      create,
      operation: read,
    })
  await render(
    h(NativeCredentialOperation, {
      credentials,
      endpoint: endpoint(),
      selected: null,
      locale: 'zh',
      canOperate: true,
      canConfigure: false,
      canReadOperation: true,
    }),
  )
  await click('提交原生凭据操作')
  const original = create.mock.calls[0]![0]
  expect(original.action).toEqual({
    kind: 'collect_filevault',
    expectedRevision: 12,
    recipient: null,
  })
  expect(read).not.toHaveBeenCalled()
  expect(original.deadline).toBeGreaterThan(Date.now() / 1000)
  await click('显式重提原凭据操作')
  expect(create.mock.calls[1]![0]).toEqual(original)
})
it('keeps tenant grants and other-device grants from enabling a device-sensitive control', () => {
  expect(
    devicePermission(
      [{ operation: 'credentials', scope: { kind: 'tenant' } }],
      target.device,
      'credentials',
    ),
  ).toBe(false)
  expect(
    devicePermission(
      [{ operation: 'credentials', scope: { kind: 'device', id: 'other-device' } }],
      target.device,
      'credentials',
    ),
  ).toBe(false)
  expect(
    devicePermission(
      [{ operation: 'credentials', scope: { kind: 'device', id: target.device } }],
      target.device,
      'credentials',
    ),
  ).toBe(true)
  expect(
    devicePermission(
      [{ operation: 'credentials', scope: { kind: 'all_devices' } }],
      target.device,
      'credentials',
    ),
  ).toBe(true)
})

it('clears previously disclosed content when the next explicit disclosure is refused', async () => {
  const f = fixture(),
    reveal = vi
      .fn<RecoveryCredentials['reveal']>()
      .mockResolvedValueOnce({ material: material(), secret: 'previous-sensitive-value' })
      .mockRejectedValueOnce({ cause: 'http', status: 403, code: 'forbidden' }),
    credentials = inject<RecoveryCredentials>({ reveal })
  await render(disclosure(f.runtime, credentials))
  await click('披露此精确材料')
  expect(host.textContent).toContain('previous-sensitive-value')
  await click('披露此精确材料')
  expect(host.textContent).not.toContain('previous-sensitive-value')
  expect(host.querySelector('[aria-label="恢复凭据秘密"]')).toBeNull()
  expect(reveal).toHaveBeenCalledTimes(2)
})
it('makes exact disclosure reachable with only a device Credentials grant and no device-view reader', async () => {
  const f = fixture(),
    reveal = vi
      .fn<RecoveryCredentials['reveal']>()
      .mockResolvedValue({ material: material(), secret: 'exact-only-sensitive-value' }),
    credentials = inject<RecoveryCredentials>({ reveal }),
    effective = vi
      .fn()
      .mockResolvedValueOnce({
        grants: [{ operation: 'credentials', scope: { kind: 'device', id: target.device } }],
      })
      .mockResolvedValue({ grants: [] }),
    runtime = {
      ...f.runtime,
      administration: () => ({
        binding: 'exact-only-session',
        recoveryCredentials: credentials,
        authorization: { effective },
      }),
    } as unknown as Runtime
  await render(h(RecoveryDisclosure, { runtime, locale: 'zh' }))
  async function fill(name: string, value: string) {
    const label = [...host.querySelectorAll('label')].find((node) => node.textContent === name)!
    const input = document.getElementById(label.htmlFor) as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  await fill('精确设备 ID', target.device)
  await fill('材料 UUID', target.id)
  await fill('精确材料版本', String(target.version))
  await click('选择精确披露坐标')
  await click('披露此精确材料')
  expect(reveal).toHaveBeenCalledWith(target, expect.any(AbortSignal))
  expect(host.textContent).toContain('exact-only-sensitive-value')
  await click('读取当前披露权限')
  expect(host.textContent).not.toContain('exact-only-sensitive-value')
  expect(button('披露此精确材料').disabled).toBe(true)
})
