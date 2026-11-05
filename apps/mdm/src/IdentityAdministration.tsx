import { DataTable } from './DataTable'
import { useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import { flushSync } from 'react-dom'
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
} from 'antd'
import type { FormInstance } from 'antd'
import {
  validateLogin,
  validateNewPassword,
  type Account,
  type AccountRow,
  type IdentityProvider,
  type ProviderSettings,
  type ProviderTest,
} from '@rss/auth-core'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { useAdministration } from './useAdministration'
import { LocalProfile } from './LocalProfile'
import {
  CursorControls,
  fieldLabel,
  cellText,
  DirectoryControls,
  Failure,
  Heading,
  firstPage,
  isUnknown,
  labels,
  ReadState,
  useAction,
  useRead,
  type Query,
} from './AdminUi'
type Props = { runtime: Runtime; locale: Locale }
function Secret({
  form,
  field,
  ...props
}: { form: Pick<FormInstance, 'setFieldValue'>; field: string } & Omit<
  ComponentProps<typeof Input.Password>,
  'form'
>) {
  useEffect(() => {
    const clear = () => flushSync(() => form.setFieldValue(field, ''))
    const hidden = () => {
      if (document.visibilityState !== 'visible') clear()
    }
    window.addEventListener('pagehide', clear)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('pagehide', clear)
      document.removeEventListener('visibilitychange', hidden)
      form.setFieldValue(field, '')
    }
  }, [form, field])
  return <Input.Password {...props} autoComplete="new-password" />
}
function AccountCreate({ runtime, locale, done }: Props & { done: () => void }) {
  const l = labels(locale),
    { identity } = useAdministration(runtime),
    action = useAction(),
    [form] = Form.useForm<{ login: string; password: string }>()
  const [unknown, setUnknown] = useState(false),
    [invalid, setInvalid] = useState(false)
  return (
    <>
      <Failure error={action.error} locale={locale} />
      {invalid && (
        <Alert
          type="error"
          title={l(
            '登录名限128个ASCII字符，密码至少15字符且不超过1024字节。',
            'Login: up to 128 ASCII characters. Password: at least 15 characters and up to 1024 bytes.',
          )}
          role="alert"
        />
      )}
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        disabled={unknown || action.busy}
        onFinish={(v) => {
          const password = v.password
          form.setFieldValue('password', '')
          try {
            validateLogin(v.login)
            validateNewPassword(password)
            setInvalid(false)
          } catch {
            setInvalid(true)
            return
          }
          void action
            .run(() => identity.createAccount(v.login, password))
            .then((r) => {
              if (r.ok) done()
              else if (isUnknown(r.error)) setUnknown(true)
            })
        }}
      >
        <Form.Item name="login" label={l('本地登录名', 'Local login')} rules={[{ required: true }]}>
          <Input maxLength={128} autoComplete="off" />
        </Form.Item>
        <Form.Item name="password" label={l('密码', 'Password')} rules={[{ required: true }]}>
          <Secret form={form} field="password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={action.busy}>
          {l('创建账户', 'Create account')}
        </Button>
      </Form>
      {unknown && (
        <Alert
          type="warning"
          title={l(
            '此端点没有幂等回执。请关闭后显式读取账户目录核对，不自动重提创建。',
            'This endpoint has no idempotent receipt. Close and explicitly read the account directory to compare; creation is not automatically resubmitted.',
          )}
        />
      )}
    </>
  )
}
function AccountEdit({
  runtime,
  locale,
  account,
  reload,
}: Props & { account: Account; reload: () => void }) {
  const l = labels(locale),
    { identity } = useAdministration(runtime),
    action = useAction(),
    [form] = Form.useForm<{ password: string }>()
  const [unknown, setUnknown] = useState(false),
    [invalid, setInvalid] = useState(false)
  const [confirm, setConfirm] = useState<{
    field: 'enabled' | 'membership'
    enabled: boolean
  } | null>(null)
  const reset = (error: unknown) => {
    if (isUnknown(error)) setUnknown(true)
  }
  return (
    <>
      <Descriptions
        column={1}
        size="small"
        items={[
          { key: 'principal', label: l('主体', 'Principal'), children: account.principalId },
          { key: 'login', label: l('登录名', 'Login'), children: account.login ?? '—' },
          {
            key: 'enabled',
            label: l('账户启用', 'Account enabled'),
            children: String(account.enabled),
          },
          {
            key: 'member',
            label: l('租户成员有效', 'Active tenant membership'),
            children: String(account.memberActive),
          },
          {
            key: 'password',
            label: l('有本地密码', 'Has local password'),
            children: String(account.hasLocalPassword),
          },
        ]}
      />
      <Alert
        type="info"
        title={l(
          'Identity 账户状态不授予 MDM 资源权限。授权规则由授权管理独立持有。',
          'Identity account state does not grant MDM resource permissions. Authorization rules are managed separately.',
        )}
      />
      <Failure error={action.error} locale={locale} />
      {unknown && (
        <Alert
          type="warning"
          title={l(
            '变更结果未知，此页已锁定。请显式重新读取当前账户比较；读取不是原操作回执。',
            'The outcome is unknown and editing is locked. Explicitly read the current account to compare; this is not an original-operation receipt.',
          )}
        />
      )}
      <Space className="admin-section-actions">
        <Button disabled={action.busy} onClick={reload}>
          {l('重新读取账户', 'Read account again')}
        </Button>
        <Button
          disabled={action.busy || unknown}
          danger={account.enabled}
          onClick={() => setConfirm({ field: 'enabled', enabled: !account.enabled })}
        >
          {account.enabled ? l('停用账户', 'Disable account') : l('启用账户', 'Enable account')}
        </Button>
        <Button
          disabled={action.busy || unknown}
          danger={account.memberActive}
          onClick={() => setConfirm({ field: 'membership', enabled: !account.memberActive })}
        >
          {account.memberActive
            ? l('停用租户成员', 'Deactivate membership')
            : l('恢复租户成员', 'Activate membership')}
        </Button>
      </Space>
      {invalid && (
        <Alert
          type="error"
          title={l(
            '密码至少15字符且不超过1024字节。',
            'Password: at least 15 characters and up to 1024 bytes.',
          )}
          role="alert"
        />
      )}
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        disabled={action.busy || unknown}
        onFinish={(v) => {
          const password = v.password
          form.setFieldValue('password', '')
          try {
            validateNewPassword(password)
            setInvalid(false)
          } catch {
            setInvalid(true)
            return
          }
          void action
            .run(() => identity.resetPassword(account.principalId, password))
            .then((r) => {
              if (r.ok) reload()
              else reset(r.error)
            })
        }}
      >
        <Form.Item
          name="password"
          label={l('新本地密码', 'New local password')}
          rules={[{ required: true }]}
        >
          <Secret form={form} field="password" />
        </Form.Item>
        <Button htmlType="submit" loading={action.busy}>
          {l('重置本地密码', 'Reset local password')}
        </Button>
      </Form>
      <Modal
        open={confirm !== null}
        title={l('确认账户状态变更？', 'Confirm account state change?')}
        getContainer={false}
        rootClassName="mdm-overlay-open"
        destroyOnHidden
        confirmLoading={action.busy}
        onCancel={() => setConfirm(null)}
        onOk={() => {
          if (!confirm) return
          void action
            .run(() => identity.setAccount(account.principalId, confirm.field, confirm.enabled))
            .then((r) => {
              setConfirm(null)
              if (r.ok) reload()
              else reset(r.error)
            })
        }}
      >
        <p>
          {l(
            '对当前账户的变更可能使当前会话失效，之后需要显式重新读取会话。',
            'Changing your own account may invalidate this session. Read the session again afterwards.',
          )}
        </p>
      </Modal>
    </>
  )
}
function Accounts(props: Props) {
  const { runtime, locale } = props,
    l = labels(locale),
    { identity, binding } = useAdministration(runtime)
  const [query, setQuery] = useState<Query>({ limit: 20 }),
    [source, setSource] = useState<string | undefined>(),
    [sourceDraft, setSourceDraft] = useState('')
  const [selected, setSelected] = useState<string | null>(null),
    [create, setCreate] = useState(false),
    [revision, setRevision] = useState(0)
  const fields: (keyof AccountRow)[] = [
    'principalId',
    'login',
    'enabled',
    'memberActive',
    'hasLocalPassword',
    'displayName',
    'email',
    'profileStatus',
    'departmentStatus',
    'departmentSnapshot',
  ]
  const base: (keyof Account)[] = [
    'principalId',
    'login',
    'enabled',
    'memberActive',
    'hasLocalPassword',
  ]
  const page = useRead(`${binding}/accounts/${source}/${JSON.stringify(query)}`, () =>
    identity.accounts({
      ...query,
      fields: query.fields ? (query.fields as (keyof AccountRow)[]) : base,
      ...(source ? { source } : {}),
    }),
  )
  const detail = useRead(`${binding}/account/${selected}`, () =>
    selected ? identity.account(selected) : Promise.resolve(null),
  )
  return (
    <>
      <div className="admin-section-actions">
        <Button type="primary" onClick={() => setCreate(true)}>
          {l('创建本地账户', 'Create local account')}
        </Button>
        <Button onClick={page.reload}>{l('重新读取目录', 'Read directory again')}</Button>
      </div>
      <Form
        className="admin-toolbar"
        layout="inline"
        onFinish={() => {
          setSource(sourceDraft || undefined)
          setQuery(firstPage(query))
        }}
      >
        <Form.Item label={l('来源（local 或 Provider UUID）', 'Source (local or Provider UUID)')}>
          <Input
            aria-label={l('来源（local 或 Provider UUID）', 'Source (local or Provider UUID)')}
            value={sourceDraft}
            onChange={(e) => setSourceDraft(e.target.value)}
          />
        </Form.Item>
        <Button htmlType="submit">{l('应用来源', 'Apply source')}</Button>
      </Form>
      <DirectoryControls
        locale={locale}
        query={{ ...query, fields: query.fields ?? base }}
        onChange={setQuery}
        fields={fields}
        required="principalId"
        maximum={100}
        sort={fields.filter((f) => f !== 'departmentSnapshot')}
      />
      <ReadState busy={page.busy} error={page.error} locale={locale} />
      {page.value && (
        <>
          <DataTable
            locale={locale}
            rowKey="principalId"
            dataSource={[...page.value.items]}
            columns={[
              {
                title: l('Identity 账户', 'Identity account'),
                dataIndex: 'principalId',
                render: (id: string, row) => (
                  <Button type="link" onClick={() => setSelected(id)}>
                    {row.login ?? id}
                  </Button>
                ),
              },
              ...(
                [
                  'enabled',
                  'memberActive',
                  'hasLocalPassword',
                  'displayName',
                  'email',
                  'profileStatus',
                  'departmentStatus',
                ] as const
              )
                .filter((f) => (query.fields ?? base).includes(f as never))
                .map((field) => ({
                  title: fieldLabel(locale, field),
                  dataIndex: field,
                  render: (v: unknown) => cellText(locale, v),
                })),
            ]}
          />
          <CursorControls
            locale={locale}
            query={query}
            onChange={setQuery}
            next={page.value.nextCursor}
            count={page.value.items.length}
          />
        </>
      )}
      <Modal
        open={selected !== null}
        title={l('账户详情', 'Account detail')}
        width={800}
        getContainer={false}
        rootClassName="mdm-overlay-open"
        destroyOnHidden
        footer={null}
        onCancel={() => setSelected(null)}
      >
        <ReadState busy={detail.busy} error={detail.error} locale={locale} />
        {detail.value && (
          <Tabs
            key={`${selected}/${revision}`}
            destroyOnHidden
            items={[
              {
                key: 'account',
                label: l('账户与成员', 'Account and membership'),
                children: (
                  <AccountEdit
                    {...props}
                    account={detail.value}
                    reload={() => {
                      setRevision((v) => v + 1)
                      detail.reload()
                      page.reload()
                    }}
                  />
                ),
              },
              {
                key: 'profile',
                label: l('Identity 本地资料', 'Identity local profile'),
                children: <LocalProfile {...props} principal={detail.value.principalId} />,
              },
            ]}
          />
        )}
      </Modal>
      <Modal
        open={create}
        title={l('创建本地账户', 'Create local account')}
        getContainer={false}
        rootClassName="mdm-overlay-open"
        destroyOnHidden
        footer={null}
        onCancel={() => setCreate(false)}
      >
        <AccountCreate
          {...props}
          done={() => {
            setCreate(false)
            page.reload()
          }}
        />
      </Modal>
    </>
  )
}
interface ProviderForm {
  issuer: string
  clientId: string
  redirectUri: string
  scopes: string
  subjectKind: 'oidc' | 'entra'
  entraTenant: string
  extensionsClaim: string
  profileAge: number
  groups: string
  departmentClaim: string
  departmentAge: number
  jit: boolean
  clientSecret: string
  caPem: string
}
function ProviderEditor({
  runtime,
  locale,
  provider,
  done,
}: Props & { provider: IdentityProvider | null; done: () => void }) {
  const l = labels(locale),
    { identity } = useAdministration(runtime),
    action = useAction(),
    [form] = Form.useForm<ProviderForm>()
  const [unknown, setUnknown] = useState(false),
    [test, setTest] = useState<ProviderTest | null>(null),
    [confirm, setConfirm] = useState(false)
  const subjectKind =
    Form.useWatch('subjectKind', form) ?? provider?.settings.claims.subject.kind ?? 'oidc'
  const c = provider?.settings.claims
  return (
    <>
      <Failure error={action.error} locale={locale} />
      <Alert
        type="info"
        title={l(
          '修改会完整替换配置，并且必须重新提供 client secret；空白不表示保留旧秘密。私有 CA 也需重新提供；留空使用系统信任根。',
          'Updates replace the full configuration and require the client secret again. A blank secret does not preserve the previous credential. Re-enter a private CA if required; blank uses system trust roots.',
        )}
      />
      {unknown && (
        <Alert
          type="warning"
          title={l(
            '结果未确认，此端点无原操作回执。关闭后显式读取 Provider 列表比较，不能自动重提。',
            'The outcome is unconfirmed. This endpoint has no original-operation receipt. Close and explicitly read Providers to compare; do not automatically resubmit.',
          )}
        />
      )}
      {provider && (
        <Descriptions
          column={1}
          size="small"
          items={[
            { key: 'id', label: 'Provider ID', children: provider.id },
            {
              key: 'version',
              label: l('配置版本', 'Configuration version'),
              children: provider.version,
            },
            {
              key: 'epoch',
              label: l('撤销代次', 'Revocation epoch'),
              children: provider.revocationEpoch,
            },
            {
              key: 'credential',
              label: l('凭据版本', 'Credential version'),
              children: provider.credentialVersion,
            },
          ]}
        />
      )}
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        disabled={action.busy || unknown}
        initialValues={
          provider
            ? {
                issuer: provider.settings.issuer,
                clientId: provider.settings.clientId,
                redirectUri: provider.settings.redirectUri,
                scopes: provider.settings.scopes.join(' '),
                subjectKind: c!.subject.kind,
                entraTenant: c!.subject.kind === 'entra' ? c!.subject.tenant : '',
                extensionsClaim: c!.profile.extensionsClaim ?? '',
                profileAge: c!.profile.maxAgeSeconds,
                groups: c!.groups ?? '',
                departmentClaim: c!.departmentSnapshot?.claim ?? '',
                departmentAge: c!.departmentSnapshot?.maxAgeSeconds ?? 300,
                jit: provider.settings.jit,
                clientSecret: '',
                caPem: '',
              }
            : {
                issuer: '',
                clientId: '',
                redirectUri: `${window.location.origin}/api/v1/identity/oidc/callback`,
                scopes: 'openid profile email',
                subjectKind: 'oidc',
                entraTenant: '',
                extensionsClaim: '',
                profileAge: 14400,
                groups: '',
                departmentClaim: '',
                departmentAge: 300,
                jit: false,
                clientSecret: '',
                caPem: '',
              }
        }
        onFinish={(v) => {
          const secret = v.clientSecret,
            ca = v.caPem || null
          form.setFieldsValue({ clientSecret: '', caPem: '' })
          const settings: ProviderSettings = {
            issuer: v.issuer,
            clientId: v.clientId,
            redirectUri: v.redirectUri,
            scopes: v.scopes.split(/\s+/).filter(Boolean),
            jit: v.jit,
            claims: {
              subject:
                v.subjectKind === 'entra'
                  ? { kind: 'entra', tenant: v.entraTenant }
                  : { kind: 'oidc' },
              profile: { extensionsClaim: v.extensionsClaim || null, maxAgeSeconds: v.profileAge },
              groups: v.groups || null,
              departmentSnapshot: v.departmentClaim
                ? { claim: v.departmentClaim, maxAgeSeconds: v.departmentAge }
                : null,
            },
          }
          void action
            .run(() =>
              provider
                ? identity.updateProvider(provider.id, provider.version, settings, secret, ca)
                : identity.createProvider(settings, secret, ca),
            )
            .then((r) => {
              if (r.ok) done()
              else if (isUnknown(r.error)) setUnknown(true)
            })
        }}
      >
        <div className="admin-form-grid">
          <Form.Item name="issuer" label="Issuer" rules={[{ required: true }, { type: 'url' }]}>
            <Input maxLength={2048} />
          </Form.Item>
          <Form.Item name="clientId" label="Client ID" rules={[{ required: true }]}>
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item
            name="redirectUri"
            label={l('回调地址', 'Redirect URI')}
            rules={[{ required: true }, { type: 'url' }]}
          >
            <Input maxLength={2048} />
          </Form.Item>
          <Form.Item
            name="scopes"
            label={l('OIDC scopes（空格分隔）', 'OIDC scopes (space-separated)')}
            rules={[{ required: true }]}
          >
            <Input maxLength={2064} />
          </Form.Item>
          <Form.Item name="subjectKind" label={l('主体映射', 'Subject mapping')}>
            <Select
              options={[
                { value: 'oidc', label: 'OIDC' },
                { value: 'entra', label: 'Microsoft Entra' },
              ]}
            />
          </Form.Item>
          {subjectKind === 'entra' && (
            <Form.Item
              name="entraTenant"
              label={l('Entra 租户', 'Entra tenant')}
              rules={[
                { required: true },
                { pattern: /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/ },
              ]}
            >
              <Input />
            </Form.Item>
          )}
          <Form.Item
            name="extensionsClaim"
            label={l('资料扩展声明根（可留空）', 'Profile extensions claim (optional)')}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="profileAge"
            label={l('资料最长有效期（秒）', 'Profile maximum age (seconds)')}
            rules={[{ required: true }]}
          >
            <InputNumber min={60} max={86400} />
          </Form.Item>
          <Form.Item name="groups" label={l('IdP 组声明（可留空）', 'IdP groups claim (optional)')}>
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="departmentClaim"
            label={l('部门快照声明（可留空）', 'Department snapshot claim (optional)')}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="departmentAge"
            label={l('部门快照最长有效期（秒）', 'Department snapshot maximum age (seconds)')}
          >
            <InputNumber min={1} max={300} />
          </Form.Item>
          <Form.Item
            name="jit"
            label={l('即时创建联合主体', 'Just-in-time federated principals')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </div>
        <Form.Item name="clientSecret" label="Client secret" rules={[{ required: true }]}>
          <Secret form={form} field="clientSecret" />
        </Form.Item>
        <Form.Item name="caPem" label={l('专用 CA PEM（可留空）', 'Private CA PEM (optional)')}>
          <Input.TextArea rows={3} autoComplete="off" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={action.busy}>
          {provider ? l('保存 Provider', 'Save Provider') : l('创建 Provider', 'Create Provider')}
        </Button>
      </Form>
      {provider && (
        <Space className="admin-section-actions">
          <Button disabled={action.busy || unknown} onClick={() => setConfirm(true)}>
            {provider.enabled
              ? l('停用 Provider', 'Disable Provider')
              : l('启用 Provider', 'Enable Provider')}
          </Button>
          <Button
            disabled={action.busy || unknown}
            onClick={() =>
              void action
                .run(() => identity.testProvider(provider.id))
                .then((r) => {
                  if (r.ok) setTest(r.value)
                })
            }
          >
            {l('测试连接', 'Test connection')}
          </Button>
        </Space>
      )}
      {test && (
        <Alert
          type={test.passed ? 'info' : 'warning'}
          title={
            test.passed
              ? l(
                  '连接测试返回成功；仅证明列出的检查，不代表完整登录验收。',
                  'Connection test returned success for the listed checks; this is not full sign-in acceptance.',
                )
              : test.diagnostic
          }
          description={
            test.passed
              ? `${test.checks.join(' · ')} · TLS: ${test.tlsVerified} · issuer: ${test.authorizationResponseIssuer}`
              : undefined
          }
        />
      )}
      <Modal
        open={confirm}
        title={l('变更 Provider 启用状态？', 'Change Provider enabled state?')}
        getContainer={false}
        rootClassName="mdm-overlay-open"
        destroyOnHidden
        confirmLoading={action.busy}
        onCancel={() => setConfirm(false)}
        onOk={() => {
          if (!provider) return
          void action
            .run(() => identity.enableProvider(provider.id, provider.version, !provider.enabled))
            .then((r) => {
              setConfirm(false)
              if (r.ok) done()
              else if (isUnknown(r.error)) setUnknown(true)
            })
        }}
      >
        <p>
          {l(
            '此操作按配置版本执行；相关来源观察和会话可能失效。',
            'This uses the configuration version. Related observations and sessions may be invalidated.',
          )}
        </p>
      </Modal>
    </>
  )
}
function Providers(props: Props) {
  const { runtime, locale } = props,
    l = labels(locale),
    { identity, binding } = useAdministration(runtime)
  const read = useRead(`${binding}/providers`, identity.providers)
  const [selected, setSelected] = useState<IdentityProvider | null>(null),
    [create, setCreate] = useState(false)
  const done = () => {
    setSelected(null)
    setCreate(false)
    read.reload()
  }
  return (
    <>
      <div className="admin-section-actions">
        <Button type="primary" onClick={() => setCreate(true)}>
          {l('创建 Provider', 'Create Provider')}
        </Button>
        <Button onClick={read.reload}>{l('重新读取 Provider', 'Read Providers again')}</Button>
      </div>
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      {read.value && (
        <DataTable
          locale={locale}
          rowKey="id"
          dataSource={[...read.value]}
          columns={[
            {
              title: 'Provider',
              dataIndex: 'id',
              render: (id: string, p) => (
                <Button type="link" onClick={() => setSelected(p)}>
                  {p.settings.issuer} · {id}
                </Button>
              ),
            },
            { title: l('配置版本', 'Version'), dataIndex: 'version' },
            {
              title: l('启用', 'Enabled'),
              dataIndex: 'enabled',
              render: (v: boolean) => <Tag>{String(v)}</Tag>,
            },
          ]}
        />
      )}
      <Modal
        open={create || selected !== null}
        title={l('Provider 配置', 'Provider configuration')}
        width={880}
        getContainer={false}
        rootClassName="mdm-overlay-open"
        destroyOnHidden
        footer={null}
        onCancel={() => {
          setCreate(false)
          setSelected(null)
        }}
      >
        <ProviderEditor
          key={selected ? `${selected.id}/${selected.version}` : 'new'}
          {...props}
          provider={selected}
          done={done}
        />
      </Modal>
    </>
  )
}
function OwnPassword({ runtime, locale }: Props) {
  const l = labels(locale),
    { identity } = useAdministration(runtime),
    action = useAction(),
    [form] = Form.useForm<{ currentPassword: string; password: string }>()
  const [invalid, setInvalid] = useState(false)
  return (
    <>
      <Failure error={action.error} locale={locale} />
      {invalid && (
        <Alert
          type="error"
          title={l(
            '新密码至少15字符且不超过1024字节。',
            'New password: at least 15 characters and up to 1024 bytes.',
          )}
          role="alert"
        />
      )}
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        disabled={action.busy}
        onFinish={(v) => {
          const current = v.currentPassword,
            password = v.password
          form.resetFields()
          try {
            validateNewPassword(password)
            setInvalid(false)
          } catch {
            setInvalid(true)
            return
          }
          void action.run(() => identity.ownPassword(current, password))
        }}
      >
        <Form.Item
          name="currentPassword"
          label={l('当前密码', 'Current password')}
          rules={[{ required: true }]}
        >
          <Secret form={form} field="currentPassword" />
        </Form.Item>
        <Form.Item name="password" label={l('新密码', 'New password')} rules={[{ required: true }]}>
          <Secret form={form} field="password" />
        </Form.Item>
        <Button htmlType="submit" type="primary" loading={action.busy}>
          {l('修改本人密码', 'Change my password')}
        </Button>
      </Form>
    </>
  )
}
export function IdentityAdministration(props: Props) {
  const l = labels(props.locale)
  return (
    <>
      <Heading
        title={l('账户与身份来源', 'Accounts and identity sources')}
        hint={l(
          '受控 Identity 管理入口；MDM 授权单独管理',
          'Controlled Identity administration; MDM authorization is managed separately',
        )}
      />
      <Tabs
        destroyOnHidden
        items={[
          {
            key: 'accounts',
            label: l('Identity 账户', 'Identity accounts'),
            children: <Accounts {...props} />,
          },
          ...(props.runtime.oidcEnabled
            ? [{ key: 'providers', label: 'Providers', children: <Providers {...props} /> }]
            : []),
          {
            key: 'self',
            label: l('本人本地资料', 'My local profile'),
            children: (
              <LocalProfile
                {...props}
                principal={props.runtime.owner.getSnapshot().identity!.principalId}
              />
            ),
          },
          {
            key: 'password',
            label: l('修改本人密码', 'My password'),
            children: <OwnPassword {...props} />,
          },
        ]}
      />
    </>
  )
}
