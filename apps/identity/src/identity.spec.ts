import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Presentation } from '@rss/core'
import { createFlows, createSession, type IdentityProvider } from '@rss/auth-core'
import { createAuthPort } from '@rss/auth-http'
import {
  decodeIdentityError,
  type HttpTransport,
  type NoContentRequest,
  type RequestOptions,
} from '@rss/api/identity'
import { networkErrorForTest } from '@rss/api/testing'
import { IdentityApp } from './App'
import { Runtime, tenantLocator, type IdentityRuntime } from './runtime'
import { editedProviderSettings } from './ProvidersPage'

const tenant = '11111111-1111-4111-8111-111111111111'
const principal = '22222222-2222-4222-8222-222222222222'
const session = '33333333-3333-4333-8333-333333333333'
const providerId = '44444444-4444-4444-8444-444444444444'
const targetId = '55555555-5555-4555-8555-555555555555'
const nextSession = '66666666-6666-4666-8666-666666666666'
const account = {
  principalId: targetId,
  login: 'colleague',
  enabled: true,
  memberActive: true,
  hasLocalPassword: true,
}
const provider: IdentityProvider = {
  id: providerId,
  version: 7,
  enabled: false,
  revocationEpoch: 3,
  credentialVersion: 2,
  settings: {
    issuer: 'https://login.example.com',
    clientId: 'existing',
    redirectUri: 'https://identity.example.com/api/v1/identity/oidc/callback',
    scopes: ['openid', 'profile', 'email'],
    jit: false,
    claims: {
      subject: { kind: 'entra', tenant },
      profile: { extensionsClaim: 'custom', maxAgeSeconds: 600 },
      groups: 'groups',
      departmentSnapshot: { claim: 'departments', maxAgeSeconds: 90 },
    },
  },
}
type Request = NoContentRequest | RequestOptions<unknown>
function fixture(
  options: {
    authenticated?: boolean
    oidc?: boolean
    accounts?: boolean
    providers?: boolean
  } = {},
) {
  let authenticated = options.authenticated ?? true
  const calls: Request[] = []
  const now = Math.floor(Date.now() / 1000)
  const sessionRow = {
    id: session,
    issuedAt: now - 10,
    idleExpiresAt: now + 3600,
    absoluteExpiresAt: now + 7200,
  }
  const envelope = {
    session: sessionRow,
    identity: { principalId: principal, hasLocalPassword: true },
    csrfToken: 'a'.repeat(64),
  }
  let custom: ((request: Request) => Promise<unknown> | unknown) | null = null
  const transport = {
    async request(request: Request) {
      calls.push(request)
      let value: unknown
      if (custom) value = await custom(request)
      if (value === undefined) {
        const path = request.path
        if (path.endsWith('/session')) {
          if (!authenticated) throw decodeIdentityError(401, { code: 'invalid_credential' })
          value = envelope
        } else if (path.endsWith('/login')) {
          authenticated = true
          value = envelope
        } else if (path.endsWith('/context'))
          value = {
            tenantId: tenant,
            principalId: principal,
            sessionId: session,
            navigation: {
              manageAccounts: options.accounts ?? true,
              manageProviders: options.providers ?? true,
            },
          }
        else if (path.endsWith('/session/security'))
          value = {
            sessionId: session,
            authentication: {
              source: 'local_password',
              authTime: now - 10,
              acr: 'unspecified',
              amr: ['pwd'],
            },
            eligibleStepUpProviders: [],
          }
        else if (path.endsWith('/login-options'))
          value = { providers: [{ providerId, label: 'Organization' }] }
        else if (path.endsWith('/sessions')) value = { sessions: [sessionRow], nextCursor: null }
        else if (path.endsWith('/session/logout') || path.endsWith('/sessions/logout-all')) {
          authenticated = false
          return
        } else if (path.endsWith('/session/reauthenticate') || path.endsWith('/session/refresh'))
          value = envelope
        else if (path.endsWith('/accounts') && request.method === 'GET')
          value = { accounts: [account], nextCursor: null }
        else if (path.endsWith('/accounts') && request.method === 'POST') value = account
        else if (path.includes('/accounts/') && path.endsWith('/profile'))
          value = {
            revision: 4,
            value: {
              displayName: 'Original',
              username: null,
              email: null,
              extensions: { untouched: { value: true } },
              maxAgeSeconds: 600,
            },
          }
        else if (path.includes('/accounts/')) value = account
        else if (path.endsWith('/providers') && request.method === 'GET')
          value = { providers: [provider] }
        else throw new Error(`Unexpected fixture path: ${path}`)
      }
      if (request.decode) return request.decode(value)
      return undefined
    },
  } as HttpTransport
  const owner = createSession(createAuthPort(transport), { oidcEnabled: options.oidc ?? true })
  const runtime: IdentityRuntime = {
    owner,
    transport,
    config: { canonicalOrigin: 'https://identity.example.com', oidcEnabled: options.oidc ?? true },
    flows: createFlows(sessionStorage),
  }
  return {
    runtime,
    calls,
    sessionRow,
    override(handler: (request: Request) => Promise<unknown> | unknown) {
      custom = handler
    },
  }
}
let root: Root | undefined
let container: HTMLDivElement
const owners: IdentityRuntime['owner'][] = []
async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}
async function mount(runtime: IdentityRuntime, path: string) {
  owners.push(runtime.owner)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      createElement(
        Presentation,
        null,
        createElement(Runtime, {
          value: runtime,
          children: createElement(
            MemoryRouter,
            { initialEntries: [path] },
            createElement(IdentityApp),
          ),
        }),
      ),
    )
    await flush()
  })
}
async function input(id: string, value: string) {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement))
    throw new Error(`Missing field ${id}`)
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
  })
}
async function click(label: string, within: ParentNode = document) {
  const button = [...within.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === label && !element.disabled,
  )
  if (!button) throw new Error(`Missing button ${label}`)
  await act(async () => {
    button.click()
    await flush()
  })
}
async function submit(id: string) {
  const form = document.getElementById(id)?.closest('form')
  if (!form) throw new Error(`Missing form for ${id}`)
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
  })
}
async function closeTask() {
  const close = [
    ...document.querySelectorAll<HTMLButtonElement>('.ant-drawer-close,.ant-modal-close'),
  ].at(-1)
  if (!close) throw new Error('Missing close control')
  await act(async () => {
    close.click()
    await flush()
  })
}
async function tab(label: string) {
  const target = [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (node) => node.textContent === label,
  )
  if (!target) throw new Error(`Missing tab ${label}`)
  await act(async () => {
    target.click()
    await flush()
  })
}
async function choose(id: string, label: string) {
  const target = document.getElementById(id)
  if (!target) throw new Error(`Missing select ${id}`)
  await act(async () => {
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flush()
  })
  const option = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(
    (node) => node.textContent === label,
  )
  if (!option) throw new Error(`Missing option ${label}`)
  await act(async () => {
    option.click()
    await flush()
  })
}
function field(id: string) {
  return document.getElementById(id) as HTMLInputElement | null
}
function requests(calls: Request[], suffix: string, method?: string) {
  return calls.filter((call) => call.path.endsWith(suffix) && (!method || call.method === method))
}
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  document.documentElement.dataset['theme'] = 'light'
})
afterEach(async () => {
  await act(async () => {
    root?.unmount()
    await flush()
  })
  root = undefined
  for (const owner of owners.splice(0)) owner.dispose()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('Identity React journeys with the shared owner and strict HTTP decoders', () => {
  it('logs in with stable form semantics and never calls OIDC endpoints when disabled', async () => {
    const f = fixture({ authenticated: false, oidc: false })
    await mount(f.runtime, `/tenants/${tenant}/login`)
    await input('login-name', 'operator')
    await input('login-password', 'unpersisted login secret')
    await submit('login-password')
    expect(requests(f.calls, '/login', 'POST')[0]?.body).toEqual({
      login: 'operator',
      password: 'unpersisted login secret',
    })
    expect(container.textContent).toContain('我的会话')
    expect(document.getElementById('login-password')).toBeNull()
    expect(f.calls.some((call) => /oidc|login-options|security|providers/.test(call.path))).toBe(
      false,
    )
    expect(sessionStorage.length).toBe(0)
  })
  it('clears a password synchronously on submit and when the document is hidden', async () => {
    const f = fixture({ authenticated: false, oidc: false })
    let rejectLogin: ((reason: unknown) => void) | undefined
    f.override((request) =>
      request.path.endsWith('/login')
        ? new Promise((_, reject) => {
            rejectLogin = reject
          })
        : undefined,
    )
    await mount(f.runtime, `/tenants/${tenant}/login`)
    await input('login-name', 'operator')
    await input('login-password', 'temporary')
    await submit('login-password')
    expect(field('login-password')?.value).toBe('')
    await act(async () => {
      rejectLogin?.(decodeIdentityError(403, { code: 'reauthentication_failed' }))
      await flush()
    })
    await input('login-password', 'another temporary')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await flush()
    })
    expect(field('login-password')?.value).toBe('')
  })
  it('resumes only a live per-tab locator by checking the session and consumes it once', async () => {
    const f = fixture()
    f.runtime.flows.save('link', tenant)
    await mount(f.runtime, '/auth/resume?code=must-never-be-exchanged')
    expect(container.textContent).toContain('我的会话')
    expect(requests(f.calls, '/session').length).toBe(1)
    expect(
      f.calls.every((call) => !call.path.includes('callback') && !call.path.endsWith('/link')),
    ).toBe(true)
    expect(f.runtime.flows.read()).toBeNull()
  })
  it('rejects missing flow locators without using query tenants as authority', async () => {
    const f = fixture()
    await mount(f.runtime, `/auth/resume?tenant=${tenant}`)
    expect(container.textContent).toContain('从租户入口开始登录')
    expect(f.calls).toHaveLength(0)
  })
  it('shows safe errors for entry, unknown paths and malformed tenant locators', async () => {
    const f = fixture()
    await mount(f.runtime, '/tenants/not-a-tenant/sessions')
    expect(container.textContent).toContain('从租户入口开始登录')
    expect(f.calls).toHaveLength(0)
    expect(tenantLocator('00000000-0000-0000-0000-000000000000')).toBeNull()
    expect(tenantLocator(tenant.toUpperCase())).toBe(tenant)
  })
  it.each(['accounts', 'providers'])(
    'waits for an explicit %s read after navigation recovers',
    async (kind) => {
      const f = fixture()
      let unavailable = true
      f.override((request) => {
        if (unavailable && request.path.endsWith('/context')) throw networkErrorForTest()
        return undefined
      })
      await mount(f.runtime, `/tenants/${tenant}/${kind}`)
      expect(requests(f.calls, `/${kind}`, 'GET')).toHaveLength(0)
      unavailable = false
      await click('重试导航')
      expect(container.textContent).toContain('列表尚未加载')
      expect(requests(f.calls, `/${kind}`, 'GET')).toHaveLength(0)
      await click('加载列表')
      expect(requests(f.calls, `/${kind}`, 'GET')).toHaveLength(1)
    },
  )
  it('keeps provider and account navigation independent', async () => {
    const f = fixture({ accounts: false, providers: true })
    await mount(f.runtime, `/tenants/${tenant}/sessions`)
    const navigation = container.querySelector('nav')
    expect(navigation?.textContent).toContain('身份提供方')
    expect(navigation?.textContent).not.toContain('账户管理')
  })
  it('does not enter account tasks without the account navigation hint', async () => {
    const f = fixture({ accounts: false, providers: true })
    await mount(f.runtime, `/tenants/${tenant}/accounts`)
    expect(container.textContent).toContain('当前账户没有执行此操作的权限')
    expect(requests(f.calls, '/accounts')).toHaveLength(0)
  })
  it('does not call any provider endpoint from a disabled OIDC route', async () => {
    const f = fixture({ oidc: false })
    await mount(f.runtime, `/tenants/${tenant}/providers`)
    expect(f.calls).toHaveLength(0)
    expect(container.textContent).toContain('从租户入口开始登录')
  })
  it('keeps an unknown sign-out result visible and only rechecks on explicit reload', async () => {
    const f = fixture({ oidc: false })
    let logoutCalls = 0
    f.override((request) => {
      if (request.path.endsWith('/session/logout')) {
        logoutCalls++
        throw networkErrorForTest()
      }
      return undefined
    })
    await mount(f.runtime, `/tenants/${tenant}/sessions`)
    await click('退出当前会话')
    expect(container.textContent).toContain('退出结果尚未确认')
    expect(f.runtime.owner.getSnapshot().status).toBe('anonymous')
    expect(logoutCalls).toBe(1)
    await click('重新读取')
    expect(f.runtime.owner.getSnapshot().status).toBe('authenticated')
    expect(logoutCalls).toBe(1)
  })
  it('paginates sessions using the accepted query size', async () => {
    const f = fixture({ oidc: false })
    f.override((request) =>
      request.path.endsWith('/sessions')
        ? {
            sessions: [{ ...f.sessionRow, id: request.query?.['cursor'] ? nextSession : session }],
            nextCursor: request.query?.['cursor'] ? null : nextSession,
          }
        : undefined,
    )
    await mount(f.runtime, `/tenants/${tenant}/sessions`)
    await click('下一页')
    expect(requests(f.calls, '/sessions').at(-1)?.query).toEqual({
      limit: '50',
      cursor: nextSession,
    })
    expect(container.textContent).toContain(nextSession)
    await click('上一页')
    expect(requests(f.calls, '/sessions').at(-1)?.query).toEqual({ limit: '50' })
  })
  it('reads authentication facts and submits reauthentication without retaining the password', async () => {
    const f = fixture()
    await mount(f.runtime, `/tenants/${tenant}/sessions`)
    const tab = [...container.querySelectorAll('[role="tab"]')].find(
      (element) => element.textContent === '可信认证事实',
    )
    if (!(tab instanceof HTMLElement)) throw new Error('Missing security tab')
    await act(async () => {
      tab.click()
      await flush()
    })
    expect(container.textContent).toContain('未证明 MFA')
    expect(container.textContent).toContain('密码')
    await input('reauth-password', 'reauthentication secret')
    await submit('reauth-password')
    expect(requests(f.calls, '/session/reauthenticate')[0]?.body).toEqual({
      password: 'reauthentication secret',
    })
    expect(field('reauth-password')?.value ?? '').toBe('')
    expect(requests(f.calls, '/session/security').length).toBeGreaterThanOrEqual(2)
  })
  it('confirms all-session logout before dispatching exactly one write', async () => {
    const f = fixture({ oidc: false })
    await mount(f.runtime, `/tenants/${tenant}/sessions`)
    await click('退出全部会话')
    expect(requests(f.calls, '/sessions/logout-all')).toHaveLength(0)
    await click('确认')
    expect(requests(f.calls, '/sessions/logout-all')).toHaveLength(1)
    expect(document.getElementById('login-name')).not.toBeNull()
  })
  it('creates accounts, destroys the submitted password task and reads authoritative details', async () => {
    const f = fixture({ oidc: false })
    await mount(f.runtime, `/tenants/${tenant}/accounts`)
    await click('创建本地账户')
    await input('account-login', 'new-account')
    await input('account-password', 'new account password')
    await submit('account-password')
    expect(requests(f.calls, '/accounts', 'POST')[0]?.body).toEqual({
      login: 'new-account',
      password: 'new account password',
    })
    expect(field('account-password')?.value ?? '').toBe('')
    await click('读取详情')
    expect(requests(f.calls, `/accounts/${targetId}`)).toHaveLength(1)
    expect(document.body.textContent).toContain('colleague')
  })
  it('blocks account writes after an unknown outcome until an explicit read', async () => {
    const f = fixture({ oidc: false })
    f.override((request) => {
      if (request.path.endsWith('/accounts') && request.method === 'POST')
        throw networkErrorForTest()
      return undefined
    })
    await mount(f.runtime, `/tenants/${tenant}/accounts`)
    await click('创建本地账户')
    await input('account-login', 'new-account')
    await input('account-password', 'new account password')
    await submit('account-password')
    expect(field('account-password')?.value).toBe('')
    expect(field('account-password')?.disabled).toBe(true)
    expect(requests(f.calls, '/accounts', 'POST')).toHaveLength(1)
  })
  it('confirms membership changes and resets passwords as separate tasks', async () => {
    const f = fixture({ oidc: false })
    f.override((request) => {
      if (request.path.endsWith(`/accounts/${targetId}/membership`))
        return { ...account, memberActive: false }
      if (request.path.endsWith(`/accounts/${targetId}/password`)) return account
      return undefined
    })
    await mount(f.runtime, `/tenants/${tenant}/accounts`)
    await click('读取详情')
    await click('停用成员')
    expect(requests(f.calls, `/accounts/${targetId}/membership`)).toHaveLength(0)
    await click('确认')
    expect(requests(f.calls, `/accounts/${targetId}/membership`)[0]?.body).toEqual({
      enabled: false,
    })
    await click('重置密码')
    await input('reset-password', 'replacement password')
    await submit('reset-password')
    expect(requests(f.calls, `/accounts/${targetId}/password`)[0]?.body).toEqual({
      password: 'replacement password',
    })
    expect(field('reset-password')?.value ?? '').toBe('')
  })
  it('enables a provider with its read revision and displays independent connection facts', async () => {
    const f = fixture()
    f.override((request) => {
      if (request.path.endsWith(`/providers/${providerId}/enabled`))
        return { ...provider, enabled: true, version: 8 }
      if (request.path.endsWith(`/providers/${providerId}/test`))
        return {
          passed: true,
          report: {
            checks: ['binding', 'discovery', 'jwks'],
            tlsVerified: true,
            authorizationResponseIssuer: false,
          },
        }
      return undefined
    })
    await mount(f.runtime, `/tenants/${tenant}/providers`)
    await click('启用身份提供方')
    expect(requests(f.calls, `/providers/${providerId}/enabled`)[0]?.body).toEqual({
      expectedVersion: 7,
      enabled: true,
    })
    await click('测试连接')
    expect(container.textContent).toContain('连接测试通过')
    expect(container.textContent).toContain('binding · discovery · jwks')
    expect(container.textContent).toContain('授权响应 Issuer 已验证: false')
  })
  it('preserves provider subject, department and redirect coordinates while editing', async () => {
    const settings = editedProviderSettings(provider, 'https://another.example.com', {
      issuer: 'https://changed.example.com',
      client: 'changed',
      scopes: 'openid profile email',
      extensionsClaim: 'custom',
      profileAge: 600,
      groups: 'groups',
      jit: false,
    })
    expect(settings).toEqual({ ...provider.settings, clientId: 'changed' })
    const f = fixture()
    f.override((request) =>
      request.method === 'PUT' && request.path.endsWith(`/providers/${providerId}`)
        ? { ...provider, version: 8, settings }
        : undefined,
    )
    await mount(f.runtime, `/tenants/${tenant}/providers`)
    await click('编辑')
    expect(field('issuer')?.readOnly).toBe(true)
    expect(field('client-secret')?.value).toBe('')
    await input('client-id', 'changed')
    await input('client-secret', 'temporary provider secret')
    await input('ca-pem', 'temporary trust material')
    await submit('client-secret')
    expect(requests(f.calls, `/providers/${providerId}`, 'PUT')[0]?.body).toEqual({
      expectedVersion: 7,
      settings,
      clientSecret: 'temporary provider secret',
      caPem: 'temporary trust material',
    })
    expect(field('client-secret')?.value ?? '').toBe('')
    expect((document.getElementById('ca-pem') as HTMLTextAreaElement | null)?.value ?? '').toBe('')
  })
  it('restores an unknown local profile operation by its original UUID without replaying PUT', async () => {
    const f = fixture({ oidc: false })
    let operationId = ''
    let rechecking = false
    let completeCheck: ((value: unknown) => void) | undefined
    f.override((request) => {
      if (rechecking && request.path.endsWith('/session'))
        return new Promise((resolve) => {
          completeCheck = resolve
        })
      if (request.method === 'PUT' && request.path.endsWith('/profile')) {
        operationId = (request.body as { operationId: string }).operationId
        throw networkErrorForTest()
      }
      if (request.path.includes('/profile/operations/')) return { operationId, revision: 5 }
      return undefined
    })
    await mount(f.runtime, `/tenants/${tenant}/accounts`)
    await click('读取详情')
    await click('本地资料')
    await input('local-display', 'Edited profile')
    await submit('local-display')
    expect(requests(f.calls, '/profile', 'PUT')).toHaveLength(1)
    expect(field('local-display')?.value).toBe('')
    expect(field('local-display')?.disabled).toBe(true)
    expect(document.body.textContent).toContain(operationId)
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    visibility.mockReturnValue('hidden')
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    rechecking = true
    visibility.mockReturnValue('visible')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await flush()
    })
    expect(f.runtime.owner.getSnapshot().status).toBe('checking')
    expect(document.querySelector('.ant-drawer')?.closest('[hidden]')).toBeTruthy()
    await act(async () => {
      completeCheck?.({
        session: f.sessionRow,
        identity: { principalId: principal, hasLocalPassword: true },
        csrfToken: 'b'.repeat(64),
      })
      await flush()
    })
    expect(document.body.textContent).toContain(operationId)
    expect(field('local-display')?.value ?? '').toBe('')
    expect(requests(f.calls, '/profile', 'PUT')).toHaveLength(1)
    await click('查询原操作')
    expect(
      f.calls.some((request) => request.path.endsWith(`/profile/operations/${operationId}`)),
    ).toBe(true)
    expect(requests(f.calls, '/profile', 'PUT')).toHaveLength(1)
    expect(field('local-display')?.value).toBe('Original')
  })
  it('keeps accepted session pagination during revalidation and clears it when identity changes', async () => {
    const f = fixture({ oidc: false })
    let changed = false
    f.override((request) => {
      if (request.path.endsWith('/sessions'))
        return {
          sessions: [{ ...f.sessionRow, id: request.query?.['cursor'] ? nextSession : session }],
          nextCursor: request.query?.['cursor'] ? null : nextSession,
        }
      if (changed && request.path.endsWith('/session'))
        return {
          session: { ...f.sessionRow, id: nextSession },
          identity: { principalId: targetId, hasLocalPassword: true },
          csrfToken: 'b'.repeat(64),
        }
      if (changed && request.path.endsWith('/context'))
        return {
          tenantId: tenant,
          principalId: targetId,
          sessionId: nextSession,
          navigation: { manageAccounts: false, manageProviders: false },
        }
      return undefined
    })
    await mount(f.runtime, `/tenants/${tenant}/sessions`)
    await click('下一页')
    const reads = requests(f.calls, '/sessions').length
    await act(async () => {
      await f.runtime.owner.check(tenant)
      await flush()
    })
    expect(requests(f.calls, '/sessions')).toHaveLength(reads)
    expect(container.textContent).toContain(nextSession)
    changed = true
    await act(async () => {
      await f.runtime.owner.check(tenant)
      await flush()
    })
    expect(requests(f.calls, '/sessions')).toHaveLength(reads + 1)
    expect(requests(f.calls, '/sessions').at(-1)?.query).toEqual({ limit: '50' })
  })
  it('discards a late directory response after leaving the account page', async () => {
    const f = fixture({ oidc: false })
    let complete: ((value: unknown) => void) | undefined
    f.override((request) =>
      request.path.endsWith('/accounts') && request.method === 'GET'
        ? new Promise((resolve) => {
            complete = resolve
          })
        : undefined,
    )
    await mount(f.runtime, `/tenants/${tenant}/accounts`)
    const sessionsLink = container.querySelector(`a[href="/tenants/${tenant}/sessions"]`)
    if (!(sessionsLink instanceof HTMLAnchorElement)) throw new Error('Missing session navigation')
    await act(async () => {
      sessionsLink.click()
      await flush()
    })
    await act(async () => {
      complete?.({ accounts: [{ ...account, login: 'late-directory-result' }], nextCursor: null })
      await flush()
    })
    expect(container.textContent).not.toContain('late-directory-result')
    expect(container.textContent).toContain('我的会话')
  })
  it('clears hidden provider credentials and trust material', async () => {
    const f = fixture()
    await mount(f.runtime, `/tenants/${tenant}/providers`)
    await click('新增身份提供方')
    await input('client-secret', 'hidden secret')
    await input('ca-pem', 'hidden pem')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await flush()
    })
    expect(field('client-secret')?.value).toBe('')
    expect((document.getElementById('ca-pem') as HTMLTextAreaElement | null)?.value).toBe('')
  })
  it('applies account query drafts, follows accepted pages and confirms account state changes', async () => {
    const f = fixture({ oidc: false })
    f.override((request) => {
      if (request.path.endsWith('/accounts') && request.method === 'GET')
        return {
          accounts: [account],
          nextCursor: request.query?.['cursor'] ? null : 'YQ',
        }
      if (request.path.endsWith(`/accounts/${targetId}/enabled`))
        return { ...account, enabled: false }
      return undefined
    })
    await mount(f.runtime, `/tenants/${tenant}/accounts`)
    await input('account-source', 'local')
    const queryInputs = [...container.querySelectorAll('input')].filter(
      (node) => node.id !== 'account-source',
    )
    await input(queryInputs[0]!.id, "login=='colleague'")
    await input(queryInputs[1]!.id, '-login')
    await click('应用')
    expect(requests(f.calls, '/accounts').at(-1)?.query).toMatchObject({
      filter: "login=='colleague'",
      sort: '-login',
    })
    await click('下一页')
    await click('上一页')
    await click('首页')
    await click('读取详情')
    await click('停用账户')
    await click('取消')
    expect(requests(f.calls, `/accounts/${targetId}/enabled`)).toHaveLength(0)
    await click('停用账户')
    await click('确认')
    expect(requests(f.calls, `/accounts/${targetId}/enabled`)[0]?.body).toEqual({ enabled: false })
    await closeTask()
    await click('创建本地账户')
    await input('account-login', 'invalid')
    await input('account-password', 'short')
    await submit('account-password')
    expect(requests(f.calls, '/accounts', 'POST')).toHaveLength(0)
    await closeTask()
    expect(field('account-password')?.value ?? '').toBe('')
  })
  it('validates profile fields and explicitly adopts a reread version after a CAS conflict', async () => {
    const f = fixture({ oidc: false })
    f.override((request) => {
      if (request.path.endsWith('/profile') && request.method === 'PUT')
        throw decodeIdentityError(409, { code: 'configuration_changed' })
      if (request.path.includes('/profile/operations/')) return null
      return undefined
    })
    await mount(f.runtime, `/tenants/${tenant}/accounts`)
    await click('读取详情')
    await click('本地资料')
    await input('local-username', 'person')
    await input('local-email', 'person@example.com')
    await input('local-profile-age', '900')
    for (const id of ['local-display-missing', 'local-username-missing', 'local-email-missing']) {
      await act(async () => {
        field(id)!.click()
        await flush()
      })
    }
    await input('local-extensions', '{broken')
    await submit('local-display')
    expect(requests(f.calls, '/profile', 'PUT')).toHaveLength(0)
    await input('local-extensions', '{"team":"ops"}')
    await submit('local-display')
    expect(requests(f.calls, '/profile', 'PUT')).toHaveLength(1)
    const id = (requests(f.calls, '/profile', 'PUT')[0]?.body as { operationId: string })
      .operationId
    expect(document.body.textContent).toContain(id)
    await click('查询原操作')
    expect(document.body.textContent).toContain('尚未找到原操作回执')
    await click('重新读取', field('local-display')!.closest('section')!)
    await click('已比较，重新编辑')
    await click('删除本地资料')
    expect(requests(f.calls, '/profile', 'PUT').at(-1)?.body).toMatchObject({
      expectedRevision: 4,
      value: null,
    })
  })
  it('creates provider settings, clears cancelled drafts and confirms disabling a provider', async () => {
    const f = fixture()
    f.override((request) => {
      if (request.path.endsWith('/providers') && request.method === 'GET')
        return { providers: [{ ...provider, enabled: true }] }
      if (request.path.endsWith('/providers') && request.method === 'POST')
        return { ...provider, version: 1 }
      if (request.path.endsWith(`/providers/${providerId}/enabled`))
        return { ...provider, enabled: false, version: 8 }
      if (request.path.endsWith(`/providers/${providerId}/test`))
        return { passed: false, diagnostic: { stage: 'discovery', reason: 'unavailable' } }
      return undefined
    })
    await mount(f.runtime, `/tenants/${tenant}/providers`)
    await click('新增身份提供方')
    await input('issuer', 'https://new.example.com')
    await input('client-id', 'new-client')
    await input('client-secret', 'temporary')
    await input('scopes', 'openid email')
    await input('profile-claim', 'profile')
    await input('profile-age', '300')
    await input('groups-claim', 'teams')
    await act(async () => {
      field('jit')!.click()
      await flush()
    })
    await submit('client-secret')
    expect(requests(f.calls, '/providers', 'POST')[0]?.body).toMatchObject({
      settings: {
        issuer: 'https://new.example.com',
        clientId: 'new-client',
        jit: true,
        claims: { profile: { extensionsClaim: 'profile', maxAgeSeconds: 300 }, groups: 'teams' },
      },
    })
    await click('新增身份提供方')
    await input('client-secret', 'discard')
    await closeTask()
    expect(field('client-secret')?.value ?? '').toBe('')
    await click('停用身份提供方')
    await click('取消')
    await click('停用身份提供方')
    await click('确认')
    expect(requests(f.calls, `/providers/${providerId}/enabled`)[0]?.body).toEqual({
      expectedVersion: 7,
      enabled: false,
    })
    await click('测试连接')
    expect(container.textContent).toContain('discovery: unavailable')
    await click('重新读取')
  })
  it('keeps failed SSO and linking tasks local without replaying credentials', async () => {
    const f = fixture({ authenticated: false })
    f.override((request) => {
      if (request.path.includes('/oidc/')) throw networkErrorForTest()
      return undefined
    })
    await mount(f.runtime, `/tenants/${tenant}/login`)
    await click('组织 SSO · Organization')
    expect(f.runtime.flows.read()).toBeNull()
    expect(requests(f.calls, `/oidc/${providerId}/login`)).toHaveLength(1)
    await input('login-name', 'operator')
    await input('login-password', 'temporary')
    await submit('login-password')
    await tab('可信认证事实')
    await choose('link-provider', 'Organization')
    await input('link-password', 'temporary')
    await submit('link-password')
    expect(requests(f.calls, `/oidc/${providerId}/link`)[0]?.body).toMatchObject({
      returnTarget: 'resume',
      password: 'temporary',
    })
    expect(f.runtime.flows.read()).toBeNull()
    expect(field('link-password')?.value).toBe('')
  })
  it('changes an own password explicitly and clears closed security tasks', async () => {
    const f = fixture()
    f.override((request) => {
      if (request.path.endsWith('/password')) return null
      return undefined
    })
    await mount(f.runtime, `/tenants/${tenant}/sessions`)
    await input('session-limit', '25')
    await click('应用')
    await click('首页')
    expect(requests(f.calls, '/sessions').at(-1)?.query).toEqual({ limit: '25' })
    await click('退出全部会话')
    await click('取消')
    await tab('可信认证事实')
    await click('重新读取认证事实')
    await input('current-password', 'discard on close')
    const task = field('current-password')!.closest('details')!
    await act(async () => {
      task.open = false
      task.dispatchEvent(new Event('toggle'))
      await flush()
    })
    expect(field('current-password')?.value).toBe('')
    await input('current-password', 'old secret')
    await input('new-password', 'short')
    await submit('new-password')
    expect(requests(f.calls, '/password')).toHaveLength(0)
    await input('current-password', 'old secret')
    await input('new-password', 'a sufficiently long new password')
    await submit('new-password')
    expect(requests(f.calls, '/password')[0]?.body).toEqual({
      currentPassword: 'old secret',
      password: 'a sufficiently long new password',
    })
    expect(field('new-password')?.value ?? '').toBe('')
  })
  it('restarts a known-tenant error through its explicit login entry', async () => {
    const f = fixture({ authenticated: false, oidc: false })
    await mount(f.runtime, `/auth/error?reason=cancelled&tenant=${tenant}`)
    await click('登录')
    expect(field('login-name')).not.toBeNull()
  })
  it('continues an existing login in the selected language and theme', async () => {
    const f = fixture({ oidc: false })
    await mount(f.runtime, `/tenants/${tenant}/login`)
    await click('English')
    await click('Toggle theme')
    await click('Continue')
    expect(container.textContent).toContain('My sessions')
    await click('中文')
    expect(container.textContent).toContain('我的会话')
  })
})
