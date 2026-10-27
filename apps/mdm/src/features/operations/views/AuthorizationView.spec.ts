import { afterEach, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { runtimeKey, type IdentitySession, type Runtime } from '@rss/auth'
import { decodeMdmError, type HttpTransport, type RequestOptions } from '@rss/api/mdm'
import { mdmKey, type MdmRuntime } from '../../../context'
import { mdmI18n } from '../../../i18n'
import { createSettingsOperations } from '../../settings/operations'
import {
  createAuthorizationClient,
  platformPermissions,
  type Rule,
  type Revision,
  type Grant,
} from '../clients/authorization'
import AuthorizationView from './AuthorizationView.vue'
const tenant = '11111111-1111-4111-8111-111111111111',
  actor = '22222222-2222-4222-8222-222222222222',
  instance = '33333333-3333-4333-8333-333333333333',
  target = '44444444-4444-4444-8444-444444444444',
  ruleId = '55555555-5555-4555-8555-555555555555'
const subject = (principalId = target) => ({
  kind: 'user' as const,
  user: { instanceId: instance, tenantId: tenant, principalId },
})
const definition = (operations: Grant['operation'][] = ['tenant_read']): Rule => ({
  subject: subject(),
  grants: operations.map((operation) => ({ operation, scope: { kind: 'tenant' } })),
})
const body = () => new DOMWrapper(document.body)
const disposers: (() => void)[] = []
afterEach(() => {
  disposers
    .splice(0)
    .reverse()
    .forEach((f) => f())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})
type Options = RequestOptions<unknown>
async function fixture(
  options: {
    realm?: 'platform' | 'tenant'
    permissions?: Grant['operation'][]
    rows?: Revision<Rule>[]
  } = {},
) {
  const realm = options.realm ?? 'platform',
    state = shallowRef({
      status: 'authenticated',
      tenant,
      identity: { principalId: actor },
      session: { id: instance },
    }),
    session = { state } as unknown as IdentitySession
  const operations = createSettingsOperations(session)
  disposers.push(() => operations.dispose())
  const rows = new Map(
      (options.rows ?? [{ id: ruleId, revision: 1, value: definition() }]).map((r) => [
        r.id,
        structuredClone(r),
      ]),
    ),
    calls: Options[] = [],
    receipts = new Map<string, { input: string; result: unknown }>()
  let intercept: ((o: Options, next: () => unknown) => unknown | Promise<unknown>) | undefined
  const permissions =
    options.permissions ??
    (realm === 'platform'
      ? [...platformPermissions]
      : ['authorization_read', 'authorization_write'])
  const transport = {
    async request(o: Options) {
      const { decode, ...request } = o
      calls.push({ ...structuredClone(request), decode })
      const next = () => {
        if (o.method === 'GET' && o.path.endsWith('/authorization'))
          return {
            instanceId: instance,
            tenantId: tenant,
            principalId: state.value.identity.principalId,
            grants: permissions.map((operation) => ({
              operation,
              scope: { kind: 'tenant' },
              ruleId,
              ruleRevision: 1,
              subject: subject(state.value.identity.principalId),
              observation: null,
            })),
          }
        if (o.method === 'GET' && o.pathParams?.['id'])
          return rows.get(o.pathParams['id'] as string)
        if (o.method === 'GET') {
          const after = o.query?.['cursor']
          const sorted = [...rows.values()]
            .sort((a, b) => a.id.localeCompare(b.id))
            .filter((r) => !after || r.id > atob(after as string))
          return {
            items: sorted.slice(0, 100),
            nextCursor: sorted.length > 100 ? btoa(sorted[99]!.id).replace(/=/g, '') : null,
          }
        }
        const id = o.pathParams!['id'] as string,
          input = o.body as { operationId: string; expectedRevision: number; value: Rule | null },
          text = JSON.stringify({ id, input }),
          previous = receipts.get(input.operationId)
        if (previous) {
          if (previous.input !== text) throw decodeMdmError(409, { code: 'operation_conflict' })
          return previous.result
        }
        const revision = rows.get(id)?.revision ?? 0
        if (revision !== input.expectedRevision)
          throw decodeMdmError(409, { code: 'operation_conflict' })
        rows.set(id, { id, revision: revision + 1, value: structuredClone(input.value) })
        const result = { id, revision: revision + 1, deleted: input.value === null }
        receipts.set(input.operationId, { input: text, result })
        return result
      }
      return o.decode(await (intercept ? intercept(o, next) : next()))
    },
  } as HttpTransport
  const accounts = vi.fn(
    async (): Promise<Awaited<ReturnType<Runtime['api']['accounts']>>> => ({
      accounts: [
        {
          principalId: target,
          login: 'Existing manager',
          enabled: true,
          memberActive: true,
          hasLocalPassword: true,
        },
      ],
      next: null,
    }),
  )
  const runtime = {
    session,
    realm,
    tenant,
    businessTenant: tenant,
    managementTenant: tenant,
    operations: { authorization: createAuthorizationClient(transport, tenant, realm) },
    settings: { operations },
  } as unknown as MdmRuntime
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/tenants/:tenant/operations/authorization', component: AuthorizationView },
      {
        path: '/tenants/:tenant/devices/:device',
        name: 'device-detail',
        component: { template: '<div />' },
      },
    ],
  })
  await router.push(`/tenants/${tenant}/operations/authorization`)
  await router.isReady()
  let wrapper: VueWrapper
  const remount = async () => {
    wrapper?.unmount()
    wrapper = mount(AuthorizationView, {
      attachTo: document.body,
      global: {
        plugins: [router, mdmI18n()],
        provide: {
          [mdmKey as symbol]: runtime,
          [runtimeKey as symbol]: { session, api: { accounts } } as unknown as Runtime,
        },
      },
    })
    await flushPromises()
    return wrapper
  }
  await remount()
  disposers.push(() => wrapper.unmount())
  return {
    get wrapper() {
      return wrapper
    },
    state,
    operations,
    rows,
    calls,
    accounts,
    permissions,
    router,
    remount,
    setIntercept: (v: typeof intercept) => {
      intercept = v
    },
  }
}
async function click(label: string, scope = body()) {
  const b = scope
    .findAll('button')
    .find((b) => b.text() === label || b.attributes('aria-label') === label)
  expect(b, label).toBeDefined()
  await vi.waitFor(() => expect(b!.element.matches(':disabled'), label).toBe(false))
  await b!.trigger('click')
  await flushPromises()
}
async function newRule() {
  await click('添加授权规则')
  await click('按主体 UUID 定位（高级）')
  await body().get('#authorization-principal-id').setValue(target)
  await body().get('input[aria-label="查看租户"]').setValue(true)
}
async function confirm() {
  await body().get('[data-testid=review-rule]').trigger('click')
  await flushPromises()
  await body().get('[data-testid=save-rule]').trigger('click')
  await flushPromises()
}
const writes = (f: Awaited<ReturnType<typeof fixture>>) => f.calls.filter((o) => o.method === 'PUT')
it('selects an existing management account, reviews eight admitted permissions, and uses the native CAS write', async () => {
  const f = await fixture()
  expect(f.wrapper.text()).toContain('管理租户 · 独立授权')
  await click('添加授权规则')
  await click('读取已有管理账户')
  expect(f.accounts).toHaveBeenCalledTimes(1)
  await body().get('#authorization-principal').trigger('mousedown')
  await flushPromises()
  const choice = body()
    .findAll('[role=option]')
    .find((v) => v.text().includes('Existing manager'))
  expect(choice).toBeDefined()
  await choice!.trigger('click')
  await flushPromises()
  expect(body().findAll('.authorization-permissions input[type=checkbox]')).toHaveLength(8)
  await body().get('input[aria-label="查看租户"]').setValue(true)
  await body().get('[data-testid=review-rule]').trigger('click')
  await flushPromises()
  expect(writes(f)).toHaveLength(0)
  expect(body().text()).toContain('将新增的许可')
  await body().get('[data-testid=save-rule]').trigger('click')
  await flushPromises()
  expect(writes(f)).toHaveLength(1)
  expect(writes(f)[0]).toMatchObject({
    path: '/api/v1/tenant-administration/authorization/rules/{id}',
    body: { expectedRevision: 0, value: definition() },
  })
  expect(f.calls.some((o) => o.path.includes('/operations/'))).toBe(false)
})
it('keeps authorization maintenance usable when account listing returns 403', async () => {
  const f = await fixture()
  f.accounts.mockRejectedValueOnce(decodeMdmError(403, { code: 'permission_denied' }))
  await newRule()
  await click('读取已有管理账户')
  expect(body().text()).toContain('账户目录拒绝访问')
  expect((body().get('#authorization-principal-id').element as HTMLInputElement).value).toBe(target)
  await confirm()
  expect(writes(f)).toHaveLength(1)
})
it('does not require account management to edit known principals and keeps readers read only', async () => {
  const f = await fixture({ permissions: ['authorization_read', 'authorization_write'] })
  await newRule()
  expect(
    body()
      .findAll('button')
      .some((b) => b.text() === '读取已有管理账户'),
  ).toBe(false)
  await confirm()
  expect(f.accounts).not.toHaveBeenCalled()
  const reader = await fixture({ permissions: ['authorization_read'] })
  expect(reader.wrapper.text()).toContain('页面仅展示可读事实')
  expect(
    reader.wrapper
      .findAll('button')
      .find((b) => b.text() === '添加授权规则')!
      .attributes('disabled'),
  ).toBeDefined()
  expect(writes(reader)).toHaveLength(0)
})
it('retains a committed unknown request across remount, compares without confirmation, then explicitly replays exactly', async () => {
  const f = await fixture()
  let lose = true
  f.setIntercept((o, next) => {
    const v = next()
    if (o.method === 'PUT' && lose) {
      lose = false
      throw new Error('lost receipt')
    }
    return v
  })
  await newRule()
  await confirm()
  const original = structuredClone(writes(f)[0]!.body)
  expect(f.operations.records.get('authorization:platform')?.state).toBe('unknown')
  await f.remount()
  expect(body().text()).toContain('提交结果未知')
  expect(body().get('[data-testid=save-rule]').attributes('disabled')).toBeDefined()
  expect(body().get('[data-testid=replay-write]').attributes('disabled')).toBeDefined()
  await click('回读当前规则以核对')
  expect(f.operations.records.get('authorization:platform')).toMatchObject({
    state: 'unknown',
    queried: true,
  })
  expect(writes(f)).toHaveLength(1)
  await body().get('[data-testid=replay-write]').trigger('click')
  await flushPromises()
  expect(writes(f).map((o) => o.body)).toEqual([original, original])
  expect(f.operations.records.get('authorization:platform')?.state).toBe('received')
})
it('compares a conflict and retains local edits while adopting only the current server revision', async () => {
  const f = await fixture()
  await click(target)
  await body().get('input[aria-label="修改租户"]').setValue(true)
  f.rows.set(ruleId, {
    id: ruleId,
    revision: 2,
    value: { ...definition(['tenant_read', 'tenant_delete']), subject: subject(actor) },
  })
  await confirm()
  expect(f.operations.records.get('authorization:platform')?.state).toBe('conflict')
  await click('回读当前规则以核对')
  expect(body().text()).toContain('删除租户')
  expect(body().text()).toContain(actor)
  await click('保留草稿，采用已核对版本')
  await confirm()
  expect(writes(f)[1]).toMatchObject({
    body: { expectedRevision: 2, value: definition(['tenant_read', 'tenant_update']) },
  })
  expect((writes(f)[0]!.body as { operationId: string }).operationId).not.toBe(
    (writes(f)[1]!.body as { operationId: string }).operationId,
  )
})
it('keeps the server protection denial and draft without inventing an immutable rule', async () => {
  const f = await fixture()
  await click(target)
  await click('确认撤销规则')
  f.setIntercept((o, next) => {
    if (o.method === 'PUT') throw decodeMdmError(403, { code: 'permission_denied' })
    return next()
  })
  await body().get('[data-testid=save-rule]').trigger('click')
  await flushPromises()
  expect(body().text()).toContain('服务端拒绝了请求')
  expect(body().text()).toContain('当前草稿未被保存')
  expect(f.operations.records.size).toBe(0)
  expect(writes(f)[0]).toMatchObject({ body: { expectedRevision: 1, value: null } })
})
it('restores the complete basis of an unknown deletion larger than 4096 bytes and never repeats it automatically', async () => {
  const large: Rule = {
    subject: subject(),
    grants: Array.from({ length: 30 }, (_, i) => ({
      operation: 'inventory_read',
      scope: { kind: 'device', id: ('device-' + i).padEnd(200, 'x') },
    })),
  }
  const f = await fixture({ realm: 'tenant', rows: [{ id: ruleId, revision: 7, value: large }] })
  await click(target)
  f.setIntercept((o, next) => {
    const v = next()
    if (o.method === 'PUT') throw new Error('lost')
    return v
  })
  await click('确认撤销规则')
  await body().get('[data-testid=save-rule]').trigger('click')
  await flushPromises()
  await f.remount()
  expect(body().text()).toContain('本次将撤销')
  expect(body().text()).toContain('device-0')
  await click('回读当前规则以核对')
  await vi.waitFor(() => expect(body().text()).toContain('服务端当前记录为已删除'))
  expect(writes(f)).toHaveLength(1)
  expect(f.operations.records.get('authorization:tenant')?.queried).toBe(true)
})
it('uses opaque directory cursors for next and previous pages and presents tombstones without editing', async () => {
  const rows: Revision<Rule>[] = Array.from({ length: 101 }, (_, i) => ({
    id: `66666666-6666-4666-8666-${String(i).padStart(12, '0')}`,
    revision: 1,
    value: i === 100 ? null : definition(),
  }))
  const f = await fixture({ rows })
  await click('下一页')
  expect(f.calls.at(-1)?.query).toEqual({
    limit: 100,
    fields: 'id,revision,value',
    cursor: btoa(rows[99]!.id).replace(/=/g, ''),
  })
  expect(f.wrapper.text()).toContain('已删除')
  await click(rows[100]!.id)
  expect(body().find('[data-testid=review-rule]').exists()).toBe(false)
  await click('关闭')
  await click('上一页')
  expect(f.calls.at(-1)?.query).toEqual({ limit: 100, fields: 'id,revision,value' })
  expect(f.wrapper.text()).toContain('当前页 1')
})
it.each(['anonymous', 'principal', 'tenant', 'session'] as const)(
  'clears pending writes, account names and rules on %s changes and discards late errors',
  async (change) => {
    const f = await fixture()
    await newRule()
    await click('读取已有管理账户')
    let fail!: (e: unknown) => void
    f.setIntercept((o, next) =>
      o.method === 'PUT'
        ? new Promise((_r, reject) => {
            fail = reject
          })
        : next(),
    )
    await confirm()
    f.state.value = {
      ...f.state.value,
      ...(change === 'anonymous'
        ? { status: 'anonymous' }
        : change === 'principal'
          ? { identity: { principalId: target } }
          : change === 'tenant'
            ? { tenant: target }
            : { session: { id: target } }),
    }
    fail(new Error('late'))
    await flushPromises()
    expect(f.operations.records.size).toBe(0)
    expect(body().find('[role=dialog]').exists()).toBe(false)
    expect(body().text()).not.toContain('Existing manager')
    expect(writes(f)).toHaveLength(1)
  },
)
it('hides management facts immediately for a different route tenant and discards delayed directory data', async () => {
  const f = await fixture()
  await newRule()
  let resolve!: (v: Awaited<ReturnType<typeof f.accounts>>) => void
  f.accounts.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r
      }),
  )
  await click('读取已有管理账户')
  await f.router.push(`/tenants/${target}/operations/authorization`)
  resolve({
    accounts: [
      {
        principalId: target,
        login: 'Late secret label',
        enabled: true,
        memberActive: true,
        hasLocalPassword: true,
      },
    ],
    next: null,
  })
  await flushPromises()
  expect(body().text()).not.toContain('Late secret label')
  expect(f.wrapper.text()).not.toContain('查看租户')
  expect(body().find('[role=dialog]').exists()).toBe(false)
})
it('preserves business department source, matching and exact-device grants through the shared editor', async () => {
  const value: Rule = {
    subject: {
      kind: 'department',
      id: 'engineering',
      source: { providerId: instance, issuer: 'https://idp.example', configurationVersion: 9 },
      matching: 'subtree',
    },
    grants: [{ operation: 'inventory_read', scope: { kind: 'device', id: 'device-absolute' } }],
  }
  const f = await fixture({ realm: 'tenant', rows: [{ id: ruleId, revision: 3, value }] })
  await click('engineering')
  expect(body().text()).toContain('device-absolute')
  await body().get('#authorization-permission').trigger('mousedown')
  await flushPromises()
  const options = body()
    .findAll('[role=option]')
    .map((o) => o.text())
  expect(options).toContain('inventory_read')
  expect(options).not.toContain('tenant_create')
  await body()
    .findAll('[role=option]')
    .find((o) => o.text() === 'inventory_read')!
    .trigger('click')
  await flushPromises()
  await confirm()
  expect(writes(f)[0]).toMatchObject({ body: { expectedRevision: 3, value } })
})

it('clears readable facts after same-session permission revocation or an effective read failure while retaining unknown intent', async () => {
  const f = await fixture()
  await newRule()
  f.setIntercept((o, next) => {
    if (o.method === 'PUT') throw new Error('lost')
    return next()
  })
  await confirm()
  await click('关闭')
  f.permissions.splice(0)
  await click('重新读取')
  expect(f.wrapper.text()).not.toContain('查看租户')
  expect(f.wrapper.findAll('tbody tr button')).toHaveLength(0)
  expect(f.operations.records.get('authorization:platform')?.state).toBe('unknown')
  expect(body().find('[role=dialog]').exists()).toBe(false)
})
it('clears cached account names and next cursor when a later directory page is denied', async () => {
  const f = await fixture()
  await newRule()
  f.accounts.mockResolvedValueOnce({
    accounts: [
      {
        principalId: target,
        login: 'Revoked directory name',
        enabled: true,
        memberActive: true,
        hasLocalPassword: true,
      },
    ],
    next: actor,
  })
  await click('读取已有管理账户')
  expect(body().text()).toContain('Revoked directory name')
  f.accounts.mockRejectedValueOnce(decodeMdmError(403, { code: 'permission_denied' }))
  await click('下一页管理账户')
  expect(body().text()).not.toContain('Revoked directory name')
  expect(body().text()).toContain('账户目录拒绝访问')
  expect(
    body()
      .findAll('button')
      .some((b) => b.text() === '下一页管理账户'),
  ).toBe(false)
  expect((body().get('#authorization-principal-id').element as HTMLInputElement).value).toBe(target)
})
