import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Alert, Button, Card, Descriptions, Form, Input, Popconfirm, Space } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import type { Subscription, SubscriptionRow, Webhooks } from '@rss/mdm-webhooks'
import type { GroupsUseCases } from './GroupPicker'
import type { Locale } from './i18n'
import {
  codeOf,
  CursorControls,
  DirectoryControls,
  directoryQuery,
  firstPage,
  labels,
  ReadState,
  useRead,
  type Query,
} from './AdminUi'
import { DataTable } from './DataTable'
import { Status } from './DevicePresentation'
import { auditHref } from './audit-context'
import { SecretPanel } from './SecretTabs'
import { WebhookSubscriptionAuthor, eventLabel } from './WebhookSubscriptionAuthor'
import { WebhookCommandState, useWebhookCommand } from './WebhookCommand'
import { setWebhookDirectory, webhookDirectory, webhookHref } from './webhook-context'

const fields = [
  'id',
  'revision',
  'targetVersion',
  'enabled',
  'deleted',
  'settings',
] as const satisfies readonly (keyof SubscriptionRow)[]
function SubscriptionActions({
  webhooks,
  value,
  locale,
  permitted,
  blocked,
  onChanged,
}: {
  webhooks: Webhooks
  value: Subscription | null
  locale: Locale
  permitted: boolean
  blocked: boolean
  onChanged: () => void
}) {
  const l = labels(locale),
    prefix = useId(),
    command = useWebhookCommand(webhooks, permitted),
    [form] = Form.useForm<{ device: string; operationId: string }>()
  useEffect(() => {
    if (!permitted || !value || !command.pending) {
      form.resetFields()
      if (permitted && value) form.setFieldValue('operationId', crypto.randomUUID())
    }
  }, [permitted, value, command.pending, form])
  async function change(enabled: boolean | null) {
    if (!value) return
    const result = await command.submit({
      kind: 'subscription',
      id: value.id,
      change: {
        operationId: crypto.randomUUID(),
        expectedRevision: value.revision,
        input: enabled === null ? { kind: 'delete' } : { kind: 'enabled', value: enabled },
      },
    })
    if (result?.ok) onChanged()
  }
  const disabled =
    !permitted || !value || value.deleted || blocked || command.action.busy || !!command.pending
  return (
    <>
      <Space wrap>
        <Button
          disabled={disabled}
          onClick={() => {
            if (value) void change(!value.enabled)
          }}
        >
          {value?.enabled
            ? l('停用订阅', 'Disable subscription')
            : l('启用订阅', 'Enable subscription')}
        </Button>
        <Popconfirm
          title={l(
            '删除此订阅？此状态不可复活。',
            'Delete this subscription? It cannot be revived.',
          )}
          onConfirm={() => change(null)}
          disabled={disabled}
          okText={l('删除', 'Delete')}
          cancelText={l('取消', 'Cancel')}
        >
          <Button danger disabled={disabled}>
            {l('删除订阅', 'Delete subscription')}
          </Button>
        </Popconfirm>
      </Space>
      <details hidden={!value}>
        <summary>{l('为精确设备排队测试事件', 'Queue a test event for an exact device')}</summary>
        <Form
          name={prefix + '-test'}
          form={form}
          preserve={false}
          layout="vertical"
          disabled={disabled || !value?.enabled}
          onFinish={(input) => {
            if (value)
              void command.submit({
                kind: 'test',
                id: value.id,
                operationId: input.operationId,
                device: input.device,
              })
          }}
        >
          <Form.Item
            name="device"
            label={l('测试设备 ID', 'Test device ID')}
            rules={[{ required: true }]}
          >
            <Input maxLength={255} autoComplete="off" />
          </Form.Item>
          <details>
            <summary>{l('精确原操作', 'Exact original operation')}</summary>
            <Form.Item
              name="operationId"
              label={l('测试原操作 UUID', 'Original test operation UUID')}
              rules={[{ required: true }]}
            >
              <Input autoComplete="off" />
            </Form.Item>
          </details>
          <Button htmlType="submit" disabled={disabled || !value?.enabled}>
            {l('排队测试事件', 'Queue test event')}
          </Button>
        </Form>
        {!value?.enabled && (
          <p className="subtitle">
            {l(
              '订阅启用后才能排队测试。测试还需要该设备的库存读取权限并符合订阅范围。',
              'Enable the subscription before testing. The device must match its selection and requires InventoryRead.',
            )}
          </p>
        )}
      </details>
      <WebhookCommandState command={command} permitted={permitted} locale={locale} />
      {command.receipt?.kind === 'test' && permitted && (
        <Link to={webhookHref({ tab: 'deliveries', delivery: command.receipt.value.id })}>
          {l('读取此测试投递', 'Read this test delivery')}
        </Link>
      )}
    </>
  )
}
function SubscriptionDetail({
  webhooks,
  groups,
  binding,
  authority,
  id,
  locale,
  canRead,
  canWrite,
  blocked,
  onClose,
  onReadDenied,
  onDirectoryChanged,
}: {
  webhooks: Webhooks
  groups: GroupsUseCases
  binding: string
  authority: string
  id: string
  locale: Locale
  canRead: boolean
  canWrite: boolean
  blocked: boolean
  onClose: () => void
  onReadDenied: (denied: boolean) => void
  onDirectoryChanged: () => void
}) {
  const l = labels(locale),
    [params] = useSearchParams(),
    title = useRef<HTMLHeadingElement>(null),
    read = useRead(`${binding}/${authority}/${canRead}/webhook-subscription/${id}`, async () => {
      if (!canRead) throw { code: 'forbidden', status: 403 }
      return webhooks.subscription(id)
    }),
    [editing, setEditing] = useState(false),
    [enteredEdit, setEnteredEdit] = useState(false)
  useEffect(() => {
    title.current?.focus()
  }, [id])
  useEffect(() => {
    const error = read.error
    if (
      canRead &&
      (['forbidden', 'permission_denied', 'insufficient_privilege'].includes(codeOf(error)) ||
        (error && typeof error === 'object' && 'status' in error && error.status === 403))
    ) {
      onReadDenied(true)
    }
  }, [canRead, read.error, onReadDenied])
  const active = !!read.value && !read.error && canRead,
    changed = () => {
      read.reload()
      onDirectoryChanged()
    }
  return (
    <Card
      title={
        <h2 ref={title} tabIndex={-1}>
          {l('Webhook 订阅详情', 'Webhook subscription detail')}
        </h2>
      }
      extra={
        <Space>
          <Button disabled={!canRead} onClick={read.reload}>
            {l('重新读取订阅详情', 'Read subscription detail again')}
          </Button>
          <Button disabled={blocked} onClick={onClose}>
            {l('关闭订阅详情', 'Close subscription detail')}
          </Button>
        </Space>
      }
    >
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      {active && read.value && (
        <>
          <Descriptions column={1} size="small">
            <Descriptions.Item label={l('名称', 'Name')}>
              {String(read.value.settings.presentation['name'])}
            </Descriptions.Item>
            <Descriptions.Item label={l('精确订阅 ID', 'Exact subscription ID')}>
              {read.value.id}
            </Descriptions.Item>
            <Descriptions.Item label={l('配置 CAS 版本', 'Configuration CAS revision')}>
              {read.value.revision}
            </Descriptions.Item>
            <Descriptions.Item label={l('投递目标版本', 'Delivery target version')}>
              {read.value.targetVersion}
            </Descriptions.Item>
            <Descriptions.Item label={l('当前状态', 'Current state')}>
              <Status
                value={read.value.deleted ? 'deleted' : read.value.enabled ? 'enabled' : 'disabled'}
                locale={locale}
              />
            </Descriptions.Item>
            <Descriptions.Item label={l('接收地址', 'Receiver endpoint')}>
              {read.value.settings.endpoint}
            </Descriptions.Item>
            <Descriptions.Item label={l('事件类型', 'Event types')}>
              {read.value.settings.eventTypes.map((event) => eventLabel(locale, event)).join(' · ')}
            </Descriptions.Item>
            <Descriptions.Item label={l('设备范围', 'Device selection')}>
              {read.value.settings.selection.kind === 'allDevices'
                ? l('全部设备', 'All devices')
                : `${read.value.settings.selection.kind} · ${read.value.settings.selection.ids.join(', ')}`}
            </Descriptions.Item>
            <Descriptions.Item label={l('签名与网络引用', 'Signing and network references')}>
              {read.value.settings.keyReference} · {read.value.settings.networkReference}
            </Descriptions.Item>
          </Descriptions>
          <Space wrap>
            <Button
              disabled={!canWrite || read.value.deleted || blocked}
              onClick={() => {
                setEditing(true)
                setEnteredEdit(true)
              }}
            >
              {l('编辑订阅', 'Edit subscription')}
            </Button>
            <Link to={webhookHref({ tab: 'deliveries', deliverySubscription: id }, params)}>
              {l('查看此订阅投递', 'Deliveries for this subscription')}
            </Link>
            <Link
              to={webhookHref(
                { tab: 'materials', reference: read.value.settings.keyReference },
                params,
              )}
            >
              {l('读取此签名材料', 'Read this signing material')}
            </Link>
            <Link to={auditHref({ targetType: 'mdm', targetId: id })}>
              {l('定位已记录的订阅目标', 'Locate recorded subscription targets')}
            </Link>
          </Space>
          <p className="subtitle">
            {l(
              '配置和启用回执不代表接收端已收到，也不代表下游业务完成。',
              'Configuration and enablement receipts do not prove receiver acceptance or downstream completion.',
            )}
          </p>
        </>
      )}
      {!active && canWrite && (
        <Button
          disabled={blocked}
          onClick={() => {
            setEditing(true)
            setEnteredEdit(true)
          }}
        >
          {l('按精确原请求恢复此订阅', 'Recover this subscription from its exact original request')}
        </Button>
      )}
      <SubscriptionActions
        webhooks={webhooks}
        value={active ? (read.value ?? null) : null}
        locale={locale}
        permitted={canWrite}
        blocked={blocked}
        onChanged={changed}
      />
      {enteredEdit && (
        <SecretPanel active={editing && canWrite}>
          <fieldset
            className="permission-panel"
            hidden={!editing || !canWrite}
            disabled={!canWrite}
          >
            <WebhookSubscriptionAuthor
              webhooks={webhooks}
              groups={groups}
              initial={active ? (read.value ?? null) : null}
              id={id}
              readable={active}
              locale={locale}
              permitted={canWrite}
              blocked={blocked}
              onAccepted={changed}
              onClose={() => setEditing(false)}
            />
          </fieldset>
        </SecretPanel>
      )}
    </Card>
  )
}
export function WebhookSubscriptions({
  webhooks,
  groups,
  binding,
  authority,
  locale,
  canRead,
  canWrite,
  blocked,
}: {
  webhooks: Webhooks
  groups: GroupsUseCases
  binding: string
  authority: string
  locale: Locale
  canRead: boolean
  canWrite: boolean
  blocked: boolean
}) {
  const l = labels(locale),
    prefix = useId(),
    [params, setParams] = useSearchParams(),
    [detailDenied, setDetailDenied] = useState(false),
    readGeneration = useRef(0),
    deniedGeneration = useRef(0),
    onReadDenied = useCallback((denied: boolean) => {
      if (denied) {
        deniedGeneration.current = readGeneration.current
        setDetailDenied(true)
      }
    }, []),
    query = webhookDirectory(params, 'subscription'),
    selected = params.get('subscription') ?? '',
    [creating, setCreating] = useState(false),
    [enteredCreate, setEnteredCreate] = useState(false),
    read = useRead(
      `${binding}/${authority}/${canRead}/subscriptions/${JSON.stringify(query)}`,
      async () => {
        const generation = ++readGeneration.current
        if (!canRead) throw { code: 'forbidden', status: 403 }
        const page = await webhooks.subscriptions(directoryQuery(query, fields))
        return { ...page, generation }
      },
    ),
    catalog = useRead(`${binding}/${authority}/${canRead}/webhook-event-types`, async () => {
      if (!canRead) throw { code: 'forbidden', status: 403 }
      return webhooks.eventTypes()
    })
  useEffect(() => {
    // A read started before the denial cannot restore the directory, even if it finishes later.
    if (
      !read.busy &&
      !read.error &&
      read.value &&
      read.value.generation > deniedGeneration.current
    ) {
      setDetailDenied(false)
    }
  }, [read.key, read.busy, read.error, read.value])
  function reloadDirectory() {
    read.reload()
  }
  function select(id: string) {
    if (blocked) return
    const next = new URLSearchParams(params)
    next.set('subscription', id)
    next.delete('delivery')
    setParams(next)
    setCreating(false)
  }
  function update(query: Query) {
    if (blocked) return
    const next = setWebhookDirectory(params, 'subscription', query)
    next.delete('subscription')
    setParams(next)
    setCreating(false)
  }
  function close() {
    if (blocked) return
    const next = new URLSearchParams(params)
    next.delete('subscription')
    setParams(next)
  }
  useEffect(() => {
    if (!canWrite) setCreating(false)
  }, [canWrite])
  return (
    <>
      <Space wrap>
        <Button
          type="primary"
          disabled={!canWrite || blocked}
          onClick={() => {
            setCreating(true)
            setEnteredCreate(true)
          }}
        >
          {l('新建 Webhook 订阅', 'Create Webhook subscription')}
        </Button>
        <Button disabled={!canRead} onClick={reloadDirectory}>
          {l('读取订阅目录', 'Read subscription directory')}
        </Button>
        {enteredCreate && !creating && (
          <Button disabled={!canWrite} onClick={() => setCreating(true)}>
            {l('返回创建原操作', 'Return to the original creation')}
          </Button>
        )}
      </Space>
      <details>
        <summary>{l('定位已知订阅', 'Locate a known subscription')}</summary>
        <Form
          name={prefix + '-locate'}
          layout="vertical"
          disabled={blocked || (!canRead && !canWrite)}
          onFinish={(value: { id: string }) => select(value.id)}
        >
          <Form.Item
            name="id"
            label={l('已知订阅 UUID', 'Known subscription UUID')}
            rules={[{ required: true }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Button htmlType="submit">{l('定位精确订阅', 'Locate exact subscription')}</Button>
        </Form>
      </details>
      {canRead && (
        <details>
          <summary>
            {l('当前接口的订阅事件', 'Subscription events supported by this interface')}
          </summary>
          <ReadState busy={catalog.busy} error={catalog.error} locale={locale} />
          {catalog.value && (
            <>
              <p className="subtitle">
                {l('事件目录版本', 'Event catalog version')} · {catalog.value.version}
              </p>
              <ul>
                {catalog.value.items.map((event) => (
                  <li key={event}>
                    {eventLabel(locale, event)} · <code>{event}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}
      {enteredCreate && (
        <SecretPanel active={creating && canWrite}>
          <fieldset className="permission-panel" hidden={!creating} disabled={!canWrite}>
            <Card>
              <WebhookSubscriptionAuthor
                webhooks={webhooks}
                groups={groups}
                initial={null}
                locale={locale}
                permitted={canWrite}
                blocked={blocked}
                onAccepted={() => read.reload()}
                onClose={() => setCreating(false)}
              />
            </Card>
          </fieldset>
        </SecretPanel>
      )}
      {canRead ? (
        <Card title={l('订阅目录', 'Subscriptions')}>
          <DirectoryControls
            catalog="webhooks"
            locale={locale}
            query={query}
            fields={[...fields]}
            sort={['id', 'revision', 'targetVersion', 'enabled', 'deleted']}
            onChange={update}
            disabled={blocked}
          />
          {detailDenied && (
            <Alert
              type="warning"
              title={l(
                '详情访问被拒绝，已隐藏此前目录。请显式重读目录以获取当前可访问的结果。',
                'Detail access was denied. Previous directory rows are hidden. Explicitly read the directory for currently accessible results.',
              )}
            />
          )}
          <ReadState busy={read.busy} error={read.error} locale={locale} />
          {query.cursor && !!read.error && (
            <Button disabled={blocked} onClick={() => update(firstPage(query))}>
              {l('从首页重新查询订阅', 'Restart subscription search from the first page')}
            </Button>
          )}
          {read.value && !detailDenied && (
            <>
              <DataTable
                locale={locale}
                dataSource={read.value.items}
                rowKey="id"
                columns={[
                  {
                    title: l('订阅', 'Subscription'),
                    render: (_, row) => (
                      <Button type="link" disabled={blocked} onClick={() => select(row.id)}>
                        {typeof row.settings?.presentation['name'] === 'string'
                          ? row.settings.presentation['name']
                          : row.id}
                      </Button>
                    ),
                  },
                  { title: l('配置版本', 'Configuration revision'), dataIndex: 'revision' },
                  { title: l('目标版本', 'Target version'), dataIndex: 'targetVersion' },
                  {
                    title: l('启用', 'Enabled'),
                    render: (_, row) =>
                      row.enabled === undefined ? (
                        l('未读取', 'Not read')
                      ) : (
                        <Status value={row.enabled ? 'enabled' : 'disabled'} locale={locale} />
                      ),
                  },
                  {
                    title: l('已删除', 'Deleted'),
                    render: (_, row) =>
                      row.deleted === undefined
                        ? l('未读取', 'Not read')
                        : row.deleted
                          ? l('是', 'Yes')
                          : l('否', 'No'),
                  },
                ]}
              />
              <CursorControls
                locale={locale}
                query={query}
                next={read.value.nextCursor}
                count={read.value.items.length}
                onChange={update}
              />
            </>
          )}
        </Card>
      ) : (
        <Alert
          type="info"
          title={l(
            '订阅目录需要 Webhook 读取权限；拥有写入权限仍可按精确输入新建或恢复已知原请求。',
            'The directory requires WebhookRead. WebhookWrite can still create or recover a known request from exact inputs.',
          )}
        />
      )}
      {selected && (
        <SubscriptionDetail
          key={`${binding}/${selected}`}
          webhooks={webhooks}
          groups={groups}
          binding={binding}
          authority={authority}
          id={selected}
          locale={locale}
          canRead={canRead}
          canWrite={canWrite}
          blocked={blocked}
          onClose={close}
          onReadDenied={onReadDenied}
          onDirectoryChanged={reloadDirectory}
        />
      )}
    </>
  )
}
