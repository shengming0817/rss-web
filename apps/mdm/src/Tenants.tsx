import { DataTable } from './DataTable'
import { useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import { flushSync } from 'react-dom'
import { Alert, Button, Descriptions, Form, Input, Modal, Space, Tabs, Tag } from 'antd'
import type { FormInstance } from 'antd'
import {
  prepareUpdate,
  provisioningEntry,
  provisioningState,
  type Tenant,
  type ProvisionIntent,
  type Provisioning,
  type Receipt,
  type UpdateIntent,
  type ProvisionRow,
} from '@rss/mdm-tenant-administration'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { useAdministration } from './useAdministration'
import {
  CursorControls,
  fieldLabel,
  cellText,
  DirectoryControls,
  directoryQuery,
  Failure,
  Heading,
  labels,
  ReadState,
  useAction,
  useRead,
  type Query,
} from './AdminUi'
type Props = { runtime: Runtime; locale: Locale }
function Progress({ progress, locale }: { progress: Provisioning; locale: Locale }) {
  const l = labels(locale),
    entry = provisioningEntry(progress)
  const phases = {
    reserved: l('已登记', 'Reserved'),
    database_ready: l('数据库就绪', 'Database ready'),
    accounts_ready: l('账户就绪', 'Accounts ready'),
    host_pending: l('等待宿主', 'Waiting for host'),
    enabled: l('已启用', 'Enabled'),
  }
  const blocked = {
    capacity: l('容量不足', 'Capacity'),
    database: l('数据库不可用', 'Database unavailable'),
    authentication: l('身份服务不可用', 'Authentication unavailable'),
    authorization: l('授权服务不可用', 'Authorization unavailable'),
    host_unavailable: l('宿主不可用', 'Host unavailable'),
    material_missing: l('接入材料缺失', 'Material missing'),
    material_expired: l('接入材料已过期', 'Material expired'),
    material_revoked: l('接入材料已撤销', 'Material revoked'),
    external_authorization: l('外部授权未满足', 'External authorization'),
    outcome_unknown: l('结果未确认', 'Outcome unconfirmed'),
  }
  return (
    <div className="admin-progress">
      <Alert
        type={entry ? 'success' : progress.blocked ? 'warning' : 'info'}
        title={
          entry
            ? l('业务租户已启用', 'Business tenant enabled')
            : l(
                '供应尚未完成，不能进入业务租户',
                'Provisioning is incomplete; the business tenant is not available yet',
              )
        }
      />
      <Descriptions
        size="small"
        column={1}
        items={[
          {
            key: 'op',
            label: l('供应操作', 'Provisioning operation'),
            children: progress.operationId,
          },
          { key: 'tenant', label: l('业务租户', 'Business tenant'), children: progress.tenantId },
          {
            key: 'phase',
            label: l('阶段', 'Phase'),
            children: <Tag>{phases[progress.phase]}</Tag>,
          },
          {
            key: 'blocked',
            label: l('阻断原因', 'Blocked reason'),
            children: progress.blocked ? blocked[progress.blocked] : '—',
          },
          {
            key: 'admin',
            label: l('管理员主体', 'Administrator principal'),
            children: progress.administratorId ?? l('尚未确认', 'Not confirmed'),
          },
          { key: 'revision', label: l('版本', 'Revision'), children: progress.revision },
          { key: 'host', label: l('宿主', 'Host'), children: progress.hostId },
          {
            key: 'requested',
            label: l('请求应用版本', 'Requested host revision'),
            children: progress.application?.requestedRevision ?? '—',
          },
          {
            key: 'applied',
            label: l('观察到的应用版本', 'Observed host revision'),
            children: progress.application?.observation?.appliedRevision ?? '—',
          },
          {
            key: 'observed',
            label: l('宿主观察时间', 'Host observed at'),
            children: progress.application?.observation
              ? new Date(progress.application.observation.observedAt * 1000).toLocaleString()
              : '—',
          },
          {
            key: 'failure',
            label: l('宿主失败原因', 'Host failure'),
            children: progress.application?.observation?.failure ?? '—',
          },
        ]}
      />
      {entry && (
        <a className="admin-entry" href={entry} rel="noreferrer">
          {l('进入业务租户', 'Open business tenant')} →
        </a>
      )}
      {provisioningState(progress) === 'needs_credentials' && (
        <p className="subtitle">
          {l(
            '查询只读取已登记的操作；继续创建管理员需显式重输原请求的凭据。',
            'Reading only returns the registered operation. Continuing administrator creation requires explicitly re-entering the original credentials.',
          )}
        </p>
      )}
    </div>
  )
}
function SecretField({
  form,
  name,
  ...inputProps
}: { form: Pick<FormInstance, 'setFieldValue'>; name: string } & Omit<
  ComponentProps<typeof Input.Password>,
  'form'
>) {
  useEffect(() => {
    const clear = () => flushSync(() => form.setFieldValue(name, ''))
    const hidden = () => {
      if (document.visibilityState !== 'visible') clear()
    }
    window.addEventListener('pagehide', clear)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('pagehide', clear)
      document.removeEventListener('visibilitychange', hidden)
      form.setFieldValue(name, '')
    }
  }, [form, name])
  return <Input.Password {...inputProps} autoComplete="new-password" />
}
function Provision({
  runtime,
  locale,
  operationId,
  initial,
  done,
}: Props & { operationId?: string; initial?: ProvisionIntent; done: () => void }) {
  const l = labels(locale),
    { tenants, binding } = useAdministration(runtime),
    action = useAction()
  const [form] = Form.useForm<{
    name: string
    administratorLogin: string
    administratorPassword: string
  }>()
  const [intent, setIntent] = useState<ProvisionIntent | null>(initial ?? null),
    [progress, setProgress] = useState<Provisioning | null>(null)
  const id = operationId ?? intent?.operationId
  const read = useRead(`${binding}/provision/${id}`, () =>
    id ? tenants.provisioning(id) : Promise.resolve(null),
  )
  const current = progress ?? read.value?.result
  const canContinue = !current || current.administratorId === null
  const publicFields = initial ?? intent
  return (
    <>
      {id && (
        <Space className="admin-section-actions">
          <code>{id}</code>
          <Button
            disabled={action.busy}
            onClick={() => {
              setProgress(null)
              read.reload()
            }}
          >
            {l('查询原供应操作', 'Read original provisioning')}
          </Button>
        </Space>
      )}
      {id && <ReadState busy={read.busy} error={read.error} locale={locale} />}
      <Failure error={action.error} locale={locale} />
      {current && <Progress progress={current} locale={locale} />}
      {canContinue && (
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          initialValues={
            publicFields
              ? { name: publicFields.name, administratorLogin: publicFields.administratorLogin }
              : {}
          }
          onFinish={(value) => {
            const password = value.administratorPassword
            form.setFieldValue('administratorPassword', '')
            const request = publicFields ?? {
              operationId: id ?? crypto.randomUUID(),
              name: value.name,
              administratorLogin: value.administratorLogin,
            }
            setIntent(request)
            setProgress(null)
            void action
              .run(() => tenants.provision(request, password))
              .then((result) => {
                if (result.ok) {
                  setProgress(result.value.result)
                  done()
                }
              })
          }}
        >
          {id && (
            <Alert
              type="info"
              title={l(
                '继续使用同一操作标识及原请求的名称、登录名和密码。服务端会拒绝不一致输入。',
                'Continue with the same operation ID and the original name, login and password. The server rejects mismatches.',
              )}
            />
          )}
          <Form.Item name="name" label={l('租户名称', 'Tenant name')} rules={[{ required: true }]}>
            <Input disabled={action.busy || !!publicFields} maxLength={128} />
          </Form.Item>
          <Form.Item
            name="administratorLogin"
            label={l('初始管理员登录名', 'Initial administrator login')}
            rules={[{ required: true }]}
          >
            <Input disabled={action.busy || !!publicFields} autoComplete="off" maxLength={256} />
          </Form.Item>
          <Form.Item
            name="administratorPassword"
            label={
              id
                ? l('重输原管理员密码', 'Re-enter original administrator password')
                : l('初始管理员密码', 'Initial administrator password')
            }
            rules={[{ required: true }]}
          >
            <SecretField form={form} name="administratorPassword" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={action.busy}>
            {id
              ? l('显式继续原供应请求', 'Continue original provisioning')
              : l('创建并供应租户', 'Create and provision tenant')}
          </Button>
        </Form>
      )}
    </>
  )
}
function ReceiptView({ receipt, locale }: { receipt: Receipt; locale: Locale }) {
  const l = labels(locale)
  if (receipt.action === 'provision') return <Progress progress={receipt.result} locale={locale} />
  const r = receipt.result
  return (
    <>
      <Alert
        type="success"
        title={l(
          '原操作已确认；回执是当时的结果，不代表对象的当前状态。',
          'The original operation is confirmed. Its receipt is the historical result, not the current object state.',
        )}
      />
      <Descriptions
        column={1}
        size="small"
        items={[
          { key: 'op', label: l('操作标识', 'Operation ID'), children: receipt.operationId },
          { key: 'action', label: l('操作', 'Action'), children: receipt.action },
          { key: 'tenant', label: l('租户', 'Tenant'), children: r.tenantId },
          ...(receipt.action === 'administrator_create'
            ? [
                {
                  key: 'principal',
                  label: l('管理员主体', 'Administrator principal'),
                  children: receipt.result.principalId,
                },
                { key: 'login', label: l('登录名', 'Login'), children: receipt.result.login },
                {
                  key: 'rule',
                  label: l('授权规则', 'Authorization rule'),
                  children: receipt.result.ruleId,
                },
                {
                  key: 'revision',
                  label: l('规则版本', 'Rule revision'),
                  children: receipt.result.ruleRevision,
                },
              ]
            : [
                {
                  key: 'revision',
                  label: l('版本', 'Revision'),
                  children: receipt.result.revision,
                },
              ]),
        ]}
      />
    </>
  )
}
function Administrator({ runtime, locale, detail }: Props & { detail: Tenant }) {
  const l = labels(locale),
    { tenants } = useAdministration(runtime),
    action = useAction(),
    [form] = Form.useForm<{ login: string; password: string }>()
  const [intent, setIntent] = useState<{ operationId: string; login: string } | null>(null),
    [receipt, setReceipt] = useState<Receipt | null>(null)
  return (
    <>
      <Failure error={action.error} locale={locale} />
      {receipt ? (
        <ReceiptView receipt={receipt} locale={locale} />
      ) : (
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          onFinish={(value) => {
            const password = value.password
            form.setFieldValue('password', '')
            const request = intent ?? { operationId: crypto.randomUUID(), login: value.login }
            setIntent(request)
            void action
              .run(() =>
                tenants.administrator(
                  detail.tenantId,
                  request.operationId,
                  request.login,
                  password,
                ),
              )
              .then((r) => {
                if (r.ok) setReceipt(r.value)
              })
          }}
        >
          <Form.Item
            name="login"
            label={l('管理员登录名', 'Administrator login')}
            rules={[{ required: true }]}
          >
            <Input disabled={action.busy || intent !== null || detail.management} maxLength={256} />
          </Form.Item>
          <Form.Item
            name="password"
            label={intent ? l('重输原密码', 'Re-enter original password') : l('密码', 'Password')}
            rules={[{ required: true }]}
          >
            <SecretField form={form} name="password" />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            disabled={detail.management}
            loading={action.busy}
          >
            {intent
              ? l('显式重提原管理员请求', 'Resubmit original administrator request')
              : l('创建业务租户管理员', 'Create business tenant administrator')}
          </Button>
        </Form>
      )}
      {intent && !receipt && (
        <Space className="admin-recovery">
          <code>{intent.operationId}</code>
          <Button
            disabled={action.busy}
            onClick={() =>
              void action
                .run(() => tenants.operation(intent.operationId))
                .then((r) => {
                  if (
                    r.ok &&
                    r.value.action === 'administrator_create' &&
                    r.value.result.tenantId === detail.tenantId
                  )
                    setReceipt(r.value)
                })
            }
          >
            {l('查询原操作', 'Read original operation')}
          </Button>
        </Space>
      )}
    </>
  )
}
function TenantEditor({
  runtime,
  locale,
  detail,
  done,
}: Props & { detail: Tenant; done: () => void }) {
  const l = labels(locale),
    { tenants } = useAdministration(runtime),
    action = useAction()
  const [pending, setPending] = useState<UpdateIntent | null>(null),
    [receipt, setReceipt] = useState<Receipt | null>(null),
    [invalid, setInvalid] = useState(false)
  const [remove, setRemove] = useState(false),
    [removeId, setRemoveId] = useState<string | null>(null)
  async function submit(intent: UpdateIntent) {
    const r = await action.run(() => tenants.update(intent))
    if (r.ok) {
      setReceipt(r.value)
      done()
    }
  }
  return (
    <>
      <Descriptions
        column={1}
        size="small"
        items={[
          { key: 'id', label: l('租户标识', 'Tenant ID'), children: detail.tenantId },
          { key: 'rev', label: l('版本', 'Revision'), children: detail.revision },
          {
            key: 'epoch',
            label: l('初始 / 当前 Epoch', 'Initial / current epoch'),
            children: `${detail.initialEpoch} / ${detail.currentEpoch}`,
          },
          {
            key: 'realm',
            label: l('类型', 'Realm'),
            children: detail.management
              ? l('管理租户', 'Management tenant')
              : l('业务租户', 'Business tenant'),
          },
        ]}
      />
      <Failure error={action.error} locale={locale} />
      {invalid && (
        <Alert
          type="error"
          title={l(
            '名称最多128字，备注最多2048字。',
            'Name: up to 128 characters. Notes: up to 2048 characters.',
          )}
          role="alert"
        />
      )}
      {receipt && <ReceiptView receipt={receipt} locale={locale} />}
      <Tabs
        destroyOnHidden
        items={[
          {
            key: 'edit',
            label: l('基本信息', 'Details'),
            children: (
              <>
                <Form
                  layout="vertical"
                  disabled={detail.management || pending !== null || action.busy}
                  initialValues={{ name: detail.name ?? '', notes: detail.notes ?? '' }}
                  onFinish={(v: { name: string; notes: string }) => {
                    try {
                      const intent = prepareUpdate(
                        crypto.randomUUID(),
                        detail,
                        v.name || null,
                        v.notes || null,
                      )
                      setPending(intent)
                      setInvalid(false)
                      void submit(intent)
                    } catch {
                      setInvalid(true)
                    }
                  }}
                >
                  <Form.Item name="name" label={l('租户名称', 'Tenant name')}>
                    <Input maxLength={128} />
                  </Form.Item>
                  <Form.Item name="notes" label={l('备注', 'Notes')}>
                    <Input.TextArea maxLength={2048} rows={4} />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={action.busy}>
                    {l('保存租户', 'Save tenant')}
                  </Button>
                </Form>
                {pending && !receipt && (
                  <div className="admin-recovery">
                    <code>{pending.operationId}</code>
                    <Space>
                      <Button
                        disabled={action.busy}
                        onClick={() =>
                          void action
                            .run(() => tenants.operation(pending.operationId))
                            .then((r) => {
                              if (
                                r.ok &&
                                r.value.action === 'update' &&
                                r.value.result.tenantId === detail.tenantId
                              ) {
                                setReceipt(r.value)
                                done()
                              }
                            })
                        }
                      >
                        {l('查询原操作', 'Read original operation')}
                      </Button>
                      <Button disabled={action.busy} onClick={() => void submit(pending)}>
                        {l('显式重提原请求', 'Resubmit original request')}
                      </Button>
                    </Space>
                  </div>
                )}
                <Button
                  danger
                  className="admin-section-actions"
                  disabled={
                    detail.management || !detail.deletable || action.busy || pending !== null
                  }
                  onClick={() => setRemove(true)}
                >
                  {l('删除租户', 'Delete tenant')}
                </Button>
                {!detail.deletable && (
                  <p className="subtitle">
                    {l(
                      '该租户不能删除；后端会确认最终状态。',
                      'This tenant cannot be deleted. The backend validates the final state.',
                    )}
                  </p>
                )}
              </>
            ),
          },
          {
            key: 'admin',
            label: l('业务租户管理员', 'Business tenant administrator'),
            disabled: detail.management,
            children: <Administrator runtime={runtime} locale={locale} detail={detail} />,
          },
        ]}
      />
      <Modal
        open={remove}
        title={l('删除此租户？', 'Delete this tenant?')}
        getContainer={false}
        rootClassName="mdm-overlay-open"
        destroyOnHidden
        confirmLoading={action.busy}
        okButtonProps={{ danger: true }}
        okText={
          removeId
            ? l('显式重提原请求', 'Resubmit original request')
            : l('删除租户', 'Delete tenant')
        }
        onCancel={() => setRemove(false)}
        onOk={() => {
          const operationId = removeId ?? crypto.randomUUID()
          setRemoveId(operationId)
          void action
            .run(() => tenants.remove(detail, operationId))
            .then((r) => {
              if (r.ok) {
                setRemove(false)
                setReceipt(r.value)
                done()
              }
            })
        }}
      >
        <Failure error={action.error} locale={locale} />
        <p>
          {l(
            '仅尚未投入使用的业务租户可删除。此操作使用当前详情版本。',
            'Only unused business tenants can be deleted. This uses the current detail revision.',
          )}
        </p>
        {removeId && (
          <>
            <code>{removeId}</code>
            <Button
              disabled={action.busy}
              onClick={() =>
                void action
                  .run(() => tenants.operation(removeId))
                  .then((r) => {
                    if (
                      r.ok &&
                      r.value.action === 'delete' &&
                      r.value.result.tenantId === detail.tenantId
                    ) {
                      setRemove(false)
                      setReceipt(r.value)
                      done()
                    }
                  })
              }
            >
              {l('查询原删除操作', 'Read original deletion')}
            </Button>
          </>
        )}
      </Modal>
    </>
  )
}
function Registry(props: Props) {
  const { runtime, locale } = props,
    l = labels(locale),
    { tenants, binding } = useAdministration(runtime)
  const [query, setQuery] = useState<Query>({ limit: 20 }),
    [id, setId] = useState<string | null>(null),
    [create, setCreate] = useState(false)
  const fields: (keyof Tenant)[] = [
    'tenantId',
    'name',
    'notes',
    'management',
    'initialEpoch',
    'currentEpoch',
    'revision',
    'deletable',
  ]
  const page = useRead(`${binding}/tenants/${JSON.stringify(query)}`, () =>
    tenants.tenants(directoryQuery(query, fields)),
  )
  const detail = useRead(`${binding}/tenant/${id}`, () =>
    id ? tenants.tenant(id) : Promise.resolve(null),
  )
  return (
    <>
      <div className="admin-section-actions">
        <Button type="primary" onClick={() => setCreate(true)}>
          {l('创建租户', 'Create tenant')}
        </Button>
        <Button onClick={page.reload}>{l('重新读取', 'Read again')}</Button>
      </div>
      <DirectoryControls
        locale={locale}
        query={query}
        onChange={setQuery}
        fields={fields}
        required="tenantId"
        sort={['tenantId', 'name', 'management', 'revision', 'deletable', 'initialEpoch', 'notes']}
      />
      <ReadState busy={page.busy} error={page.error} locale={locale} />
      {page.value && (
        <>
          <DataTable
            locale={locale}
            rowKey="tenantId"
            dataSource={[...page.value.items]}
            columns={[
              {
                title: l('租户', 'Tenant'),
                dataIndex: 'tenantId',
                render: (id: string, row) => (
                  <Button type="link" onClick={() => setId(id)}>
                    {row.name ?? id}
                  </Button>
                ),
              },
              ...(['management', 'revision', 'deletable'] as const)
                .filter((f) => !query.fields || query.fields.includes(f))
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
        open={id !== null}
        title={l('租户详情', 'Tenant detail')}
        width={760}
        getContainer={false}
        rootClassName="mdm-overlay-open"
        destroyOnHidden
        footer={null}
        onCancel={() => setId(null)}
      >
        <ReadState busy={detail.busy} error={detail.error} locale={locale} />
        {detail.value && (
          <TenantEditor
            key={`${detail.value.tenantId}/${detail.value.revision}`}
            {...props}
            detail={detail.value}
            done={page.reload}
          />
        )}
      </Modal>
      <Modal
        open={create}
        title={l('创建并供应业务租户', 'Create and provision a business tenant')}
        width={760}
        getContainer={false}
        rootClassName="mdm-overlay-open"
        destroyOnHidden
        footer={null}
        onCancel={() => setCreate(false)}
      >
        <Provision {...props} done={page.reload} />
      </Modal>
    </>
  )
}
function Provisionings(props: Props) {
  const { runtime, locale } = props,
    l = labels(locale),
    { tenants, binding } = useAdministration(runtime)
  const [query, setQuery] = useState<Query>({ limit: 20 }),
    [id, setId] = useState<string | null>(null)
  const fields: (keyof ProvisionRow)[] = ['operationId', 'action', 'result']
  const page = useRead(`${binding}/provisionings/${JSON.stringify(query)}`, () =>
    tenants.provisionings(directoryQuery(query, fields)),
  )
  return (
    <>
      <Button onClick={page.reload}>{l('重新读取供应进度', 'Read provisioning progress')}</Button>
      <DirectoryControls
        locale={locale}
        query={query}
        onChange={setQuery}
        fields={fields}
        required="operationId"
        sort={['operationId']}
      />
      <ReadState busy={page.busy} error={page.error} locale={locale} />
      {page.value && (
        <>
          <DataTable
            locale={locale}
            rowKey="operationId"
            dataSource={[...page.value.items]}
            columns={[
              {
                title: l('供应操作', 'Provisioning operation'),
                dataIndex: 'operationId',
                render: (id: string) => (
                  <Button type="link" onClick={() => setId(id)}>
                    {id}
                  </Button>
                ),
              },
              {
                title: l('业务租户', 'Business tenant'),
                render: (_, r) => r.result?.tenantId ?? '—',
              },
              { title: l('阶段', 'Phase'), render: (_, r) => r.result?.phase ?? '—' },
              { title: l('阻断', 'Blocked'), render: (_, r) => r.result?.blocked ?? '—' },
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
        open={id !== null}
        title={l('供应进度', 'Provisioning progress')}
        width={760}
        getContainer={false}
        rootClassName="mdm-overlay-open"
        destroyOnHidden
        footer={null}
        onCancel={() => setId(null)}
      >
        {id && <Provision key={id} {...props} operationId={id} done={page.reload} />}
      </Modal>
    </>
  )
}
function Operations({ runtime, locale }: Props) {
  const l = labels(locale),
    { tenants, binding } = useAdministration(runtime)
  const [id, setId] = useState('')
  const read = useRead(`${binding}/registry-operation/${id}`, () =>
    id ? tenants.operation(id) : Promise.resolve(null),
  )
  return (
    <>
      <Form
        layout="inline"
        onFinish={(v: { id: string }) => {
          setId(v.id)
          if (v.id === id) read.reload()
        }}
      >
        <Form.Item
          name="id"
          label={l('原操作标识', 'Original operation ID')}
          rules={[{ required: true }, { pattern: /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/ }]}
        >
          <Input placeholder="UUID" />
        </Form.Item>
        <Button htmlType="submit">{l('查询原操作', 'Read original operation')}</Button>
      </Form>
      {id && <ReadState busy={read.busy} error={read.error} locale={locale} />}
      {read.value && <ReceiptView receipt={read.value} locale={locale} />}
    </>
  )
}
export function Tenants(props: Props) {
  const l = labels(props.locale)
  return (
    <>
      <Heading
        title={l('租户管理', 'Tenant administration')}
        hint={l(
          '业务租户登记、供应与受控管理员创建',
          'Business tenant registry, provisioning and controlled administrator creation',
        )}
      />
      <Tabs
        destroyOnHidden
        items={[
          { key: 'tenants', label: l('租户', 'Tenants'), children: <Registry {...props} /> },
          {
            key: 'provisionings',
            label: l('供应进度', 'Provisioning'),
            children: <Provisionings {...props} />,
          },
          {
            key: 'operations',
            label: l('原操作查询', 'Original operations'),
            children: <Operations {...props} />,
          },
        ]}
      />
    </>
  )
}
