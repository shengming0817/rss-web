import { validateAccountOrganization, validateAccountMapping } from '@rss/mdm-enrollment'
import { usePendingSelection } from './SelectionGuard'
import { useState } from 'react'
import { Alert, Button, Checkbox, Form, Input, Space } from 'antd'
import type { AccountMappingInput, AccountOrganizationInput, User } from '@rss/mdm-enrollment'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import {
  CursorControls,
  DirectoryControls,
  Failure,
  isUnknown,
  labels,
  ReadState,
  directoryQuery,
  type Query,
  useAction,
  useRead,
  validateInput,
} from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { UserPicker } from './UserPicker'

export function AppleAccounts({
  runtime,
  locale,
  organizationId,
  creating,
  canWrite,
  onCreated,
}: {
  runtime: Runtime
  locale: Locale
  organizationId: string
  creating: boolean
  canWrite: boolean
  onCreated(): void
}) {
  const l = labels(locale),
    { appleEnrollment: apple, binding } = useAdministration(runtime),
    action = useAction(),
    [localCreating, setLocalCreating] = useState(false),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    [accountName, setAccountName] = useState<string>(),
    [newAccount, setNewAccount] = useState(false),
    [target, setTarget] = useState<User | null | undefined>(),
    [selectionPending, setSelectionPending] = useState(false),
    [pending, setPending] = useState<
      | { operationId: string; kind: 'organization'; input: AccountOrganizationInput }
      | { operationId: string; kind: 'account'; account: string; input: AccountMappingInput }
      | null
    >(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    read = useRead(
      `${binding}/apple-account-organization/${organizationId}/${creating || localCreating}`,
      () =>
        (creating || localCreating) && pending === null
          ? Promise.resolve(null)
          : apple.accountOrganization(organizationId),
    ),
    accounts = useRead(
      `${binding}/apple-accounts/${organizationId}/${creating}/${JSON.stringify(query)}`,
      () =>
        creating
          ? Promise.resolve(null)
          : apple.accounts(
              organizationId,
              directoryQuery(query, [
                'account',
                'principalId',
                'instanceId',
                'revision',
                'enabled',
              ] as const),
            ),
    ),
    detail = useRead(
      `${binding}/apple-account/${organizationId}/${accountName ?? ''}/${newAccount}`,
      () =>
        accountName && !newAccount
          ? apple.account(organizationId, accountName)
          : Promise.resolve(null),
    )
  usePendingSelection(
    action.busy || (pending !== null && !['confirmed', 'rejected'].includes(outcome)),
  )
  const selectedUser =
    target === undefined
      ? detail.value
        ? {
            tenantId: runtime.tenant,
            instanceId: detail.value.instanceId,
            principalId: detail.value.principalId,
          }
        : null
      : target
  async function prepare(change: NonNullable<typeof pending>) {
    const checked = await action.run(async () => {
      validateInput(() => {
        if (change.kind === 'organization') validateAccountOrganization(change.input)
        else validateAccountMapping(change.account, change.input)
      })
      return change
    })
    if (checked.ok) {
      setPending(checked.value)
      void submit(checked.value)
    }
  }
  async function submit(change: NonNullable<typeof pending>) {
    const result = await action.run(() =>
      change.kind === 'organization'
        ? apple.saveAccountOrganization(organizationId, change.operationId, change.input)
        : apple.saveAccount(organizationId, change.account, change.operationId, change.input),
    )
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) {
      setLocalCreating(false)
      onCreated()
      read.reload()
      accounts.reload()
      detail.reload()
    }
  }
  return (
    <>
      <Alert
        type="info"
        title={l(
          '保存组织绑定和账户映射不证明外部 Apple 组织资格。签名密钥别名引用由连接材料模块管理。',
          'Organization bindings and account mappings do not prove external Apple organization eligibility. Signing-key aliases reference connection materials.',
        )}
      />
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      <Failure error={action.error} locale={locale} />
      {(creating || localCreating || read.value) && (
        <Form
          key={`${organizationId}/${read.value?.revision ?? 'new'}`}
          layout="vertical"
          initialValues={
            read.value ?? { domain: '', serverUuid: '', signingKey: '', enabled: false }
          }
          disabled={!canWrite || action.busy || pending !== null}
          onFinish={(value: {
            domain: string
            serverUuid: string
            signingKey: string
            enabled: boolean
          }) => {
            const change = Object.freeze({
              operationId: crypto.randomUUID(),
              kind: 'organization' as const,
              input: Object.freeze({ expectedRevision: read.value?.revision ?? 0, ...value }),
            })
            void prepare(change)
          }}
        >
          <Form.Item
            name="domain"
            label={l('组织域名', 'Organization domain')}
            rules={[
              { required: true },
              {
                pattern: /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
              },
            ]}
          >
            <Input maxLength={253} />
          </Form.Item>
          <Form.Item
            name="serverUuid"
            label={l('Apple 服务器 UUID', 'Apple server UUID')}
            rules={[
              { required: true },
              { pattern: /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/ },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="signingKey"
            label={l('受管账户签名密钥别名', 'Managed-account signing key alias')}
            rules={[{ required: true }]}
          >
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item name="enabled" valuePropName="checked">
            <Checkbox>{l('启用账户驱动接入', 'Enable account-driven enrollment')}</Checkbox>
          </Form.Item>
          {read.value && (
            <p>
              {l('签名密钥已配置', 'Signing key configured')} ·{' '}
              {read.value.signingKeyConfigured ? l('是', 'Yes') : l('否', 'No')} ·{' '}
              {l('外部资格未观察', 'External eligibility not observed')}
            </p>
          )}
          {canWrite && (
            <Button type="primary" htmlType="submit">
              {l('保存 Apple 组织绑定', 'Save Apple organization binding')}
            </Button>
          )}
        </Form>
      )}
      {canWrite &&
        read.error &&
        typeof read.error === 'object' &&
        'status' in read.error &&
        read.error.status === 404 && (
          <Button disabled={pending !== null || action.busy} onClick={() => setLocalCreating(true)}>
            {l(
              '为此组织创建账户驱动配置',
              'Create account-driven configuration for this organization',
            )}
          </Button>
        )}
      <Button onClick={read.reload}>
        {l('读取组织完整版本', 'Read full organization version')}
      </Button>
      {!creating && (
        <>
          <h2>{l('受管账户映射', 'Managed-account mappings')}</h2>
          <DirectoryControls
            locale={locale}
            query={query}
            onChange={setQuery}
            fields={['account', 'principalId', 'instanceId', 'revision', 'enabled']}
            sort={['account', 'principalId', 'instanceId', 'revision', 'enabled']}
            required="account"
            maximum={1000}
          />
          <ReadState busy={accounts.busy} error={accounts.error} locale={locale} />
          {accounts.value && (
            <>
              <DataTable
                locale={locale}
                dataSource={accounts.value.items}
                rowKey="account"
                columns={[
                  {
                    title: l('受管账户', 'Managed account'),
                    dataIndex: 'account',
                    render: (_, row) => (
                      <Button
                        type="link"
                        disabled={pending !== null}
                        onClick={() => {
                          setAccountName(row.account)
                          setNewAccount(false)
                          setTarget(undefined)
                        }}
                      >
                        {row.account}
                      </Button>
                    ),
                  },
                  { title: l('主体', 'Principal'), dataIndex: 'principalId' },
                  { title: l('实例', 'Instance'), dataIndex: 'instanceId' },
                  { title: l('版本', 'Revision'), dataIndex: 'revision' },
                  {
                    title: l('启用', 'Enabled'),
                    dataIndex: 'enabled',
                    render: (value) =>
                      value === true ? l('是', 'Yes') : value === false ? l('否', 'No') : '—',
                  },
                ]}
              />
              <CursorControls
                locale={locale}
                query={query}
                onChange={setQuery}
                next={accounts.value.nextCursor}
                count={accounts.value.items.length}
              />
            </>
          )}
          {canWrite && (
            <Button
              disabled={pending !== null || action.busy}
              onClick={() => {
                setAccountName('')
                setNewAccount(true)
                setTarget(null)
              }}
            >
              {l('创建受管账户映射', 'Create managed-account mapping')}
            </Button>
          )}
          <ReadState busy={detail.busy} error={detail.error} locale={locale} />
          {(newAccount || detail.value) && (
            <Form
              key={`${newAccount}/${detail.value?.account ?? 'new'}/${detail.value?.revision ?? 0}`}
              layout="vertical"
              disabled={!canWrite || pending !== null || action.busy}
              initialValues={detail.value ?? { account: '', enabled: true }}
              onFinish={(value: { account: string; enabled: boolean }) => {
                if (selectionPending || !selectedUser) return
                const selected = selectedUser
                const change = Object.freeze({
                  operationId: crypto.randomUUID(),
                  kind: 'account' as const,
                  account: value.account,
                  input: Object.freeze({
                    expectedRevision: detail.value?.revision ?? 0,
                    principalId: selected.principalId,
                    instanceId: selected.instanceId,
                    enabled: value.enabled,
                  }),
                })
                void prepare(change)
              }}
            >
              <Form.Item
                name="account"
                label={l('Managed Apple Account', 'Managed Apple Account')}
                rules={[{ required: true }, { type: 'email' }]}
              >
                <Input
                  maxLength={320}
                  disabled={!newAccount || !canWrite || pending !== null || action.busy}
                />
              </Form.Item>
              <UserPicker
                runtime={runtime}
                locale={locale}
                value={selectedUser}
                onChange={setTarget}
                onPendingChange={setSelectionPending}
                disabled={!canWrite || pending !== null || action.busy}
              />
              <Form.Item name="enabled" valuePropName="checked">
                <Checkbox>{l('启用此账户映射', 'Enable this account mapping')}</Checkbox>
              </Form.Item>
              {canWrite && (
                <Button
                  htmlType="submit"
                  type="primary"
                  disabled={selectionPending || selectedUser === null}
                >
                  {l('保存账户映射', 'Save account mapping')}
                </Button>
              )}
            </Form>
          )}
        </>
      )}
      {pending && (
        <div className="admin-recovery">
          <code>{pending.operationId}</code>
          {outcome === 'confirmed' || outcome === 'rejected' ? (
            <Button
              disabled={action.busy}
              onClick={() => {
                setPending(null)
                setOutcome('none')
                action.clear()
                read.reload()
                accounts.reload()
                detail.reload()
              }}
            >
              {outcome === 'confirmed'
                ? l('原变更已确认，读取最新版本', 'Original change confirmed; read latest')
                : l('放弃已拒绝变更并重读', 'Discard rejected change and read again')}
            </Button>
          ) : (
            <>
              <Alert
                type="warning"
                title={l(
                  '当前读取仅供比较，原请求保持固定。',
                  'Current reads allow comparison; the original request remains fixed.',
                )}
              />
              <Button disabled={action.busy} onClick={() => void submit(pending)}>
                {l('显式重提原 Apple 账户请求', 'Resubmit original Apple account request')}
              </Button>
            </>
          )}
        </div>
      )}
      <Space wrap>
        <a href={runtime.onboarding.appleBridgeUrl()}>
          {l('进入正式 Apple 账户认证入口', 'Open the formal Apple account authentication entry')}
        </a>
      </Space>
    </>
  )
}
