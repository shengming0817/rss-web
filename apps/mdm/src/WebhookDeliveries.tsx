import { useCallback, useId, useRef, useEffect, useState } from 'react'
import { Alert, Button, Card, Descriptions, Form, Input, Space } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import { uuid } from '@rss/mdm-inventory'
import type { Delivery, DeliveryRow, Webhooks } from '@rss/mdm-webhooks'
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
import { WebhookCommandState, useWebhookCommand } from './WebhookCommand'
import { setWebhookDirectory, webhookDirectory, webhookHref } from './webhook-context'

const fields = [
  'id',
  'eventId',
  'subscriptionId',
  'targetVersion',
  'sourceDelivery',
  'recoveryVersion',
  'redriveWindowOpen',
  'attempts',
  'status',
  'transportObservation',
  'failureStage',
  'failureReason',
] as const satisfies readonly (keyof DeliveryRow)[]
function DeliveryFacts({ value, locale }: { value: Delivery; locale: Locale }) {
  const l = labels(locale),
    [params] = useSearchParams()
  return (
    <>
      <Descriptions column={1} size="small">
        <Descriptions.Item label={l('投递 ID', 'Delivery ID')}>{value.id}</Descriptions.Item>
        <Descriptions.Item label={l('Outbox 结算状态', 'Outbox settlement state')}>
          <Status value={value.status} locale={locale} />
        </Descriptions.Item>
        <Descriptions.Item label={l('接收观察', 'Transport observation')}>
          {value.transportObservation === null
            ? l('没有观察事实', 'No observation fact')
            : value.transportObservation}
        </Descriptions.Item>
        <Descriptions.Item label={l('已记录尝试', 'Recorded attempts')}>
          {value.attempts}
        </Descriptions.Item>
        <Descriptions.Item label={l('目标版本', 'Target version')}>
          {value.targetVersion}
        </Descriptions.Item>
        <Descriptions.Item label={l('恢复 CAS 版本', 'Recovery CAS version')}>
          {value.recoveryVersion}
        </Descriptions.Item>
        <Descriptions.Item label={l('原投递恢复窗口', 'Original delivery recovery window')}>
          {value.redriveWindowOpen
            ? l('当前开放', 'Currently open')
            : l('当前关闭', 'Currently closed')}
        </Descriptions.Item>
        <Descriptions.Item label={l('失败阶段与原因', 'Failure stage and reason')}>
          {value.failureStage ?? '—'} · {value.failureReason ?? '—'}
        </Descriptions.Item>
        <Descriptions.Item label={l('事件关联', 'Event association')}>
          {value.eventId}
        </Descriptions.Item>
        <Descriptions.Item label={l('订阅关联', 'Subscription association')}>
          <Link
            to={webhookHref({ tab: 'subscriptions', subscription: value.subscriptionId }, params)}
          >
            {value.subscriptionId}
          </Link>
        </Descriptions.Item>
        {value.sourceDelivery && (
          <Descriptions.Item label={l('源投递关联', 'Source delivery')}>
            <Link to={webhookHref({ tab: 'deliveries', delivery: value.sourceDelivery }, params)}>
              {value.sourceDelivery}
            </Link>
          </Descriptions.Item>
        )}
      </Descriptions>
      <Link to={auditHref({ targetType: 'mdm', targetId: value.id })}>
        {l('定位已记录的投递目标', 'Locate recorded delivery targets')}
      </Link>
      <p className="subtitle">
        {l(
          '事件 ID 不是原业务 operation ID；当前接口不提供事件 payload 或事件详情。HTTP 接收与 Outbox 结算不证明下游业务或设备效果完成。',
          'An event ID is not the original business operation ID. This interface exposes no event payload or event detail. HTTP acceptance and Outbox settlement do not prove downstream or device completion.',
        )}
      </p>
    </>
  )
}
function DeliveryDetail({
  webhooks,
  binding,
  authority,
  id,
  locale,
  canRead,
  canReplay,
  blocked,
  onClose,
  onReadDenied,
}: {
  webhooks: Webhooks
  binding: string
  authority: string
  id: string
  locale: Locale
  canRead: boolean
  canReplay: boolean
  blocked: boolean
  onClose: () => void
  onReadDenied: (denied: boolean) => void
}) {
  const l = labels(locale),
    title = useRef<HTMLHeadingElement>(null),
    [params] = useSearchParams(),
    command = useWebhookCommand(webhooks, canReplay),
    read = useRead(`${binding}/${authority}/${canRead}/webhook-delivery/${id}`, async () => {
      if (!canRead) throw { code: 'forbidden', status: 403 }
      return webhooks.delivery(id)
    })
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
  const value = canRead && !read.error ? read.value : undefined,
    disabled =
      !canReplay ||
      blocked ||
      command.action.busy ||
      !!command.pending ||
      !value ||
      value.status !== 'dead_letter'
  return (
    <Card
      title={
        <h2 ref={title} tabIndex={-1}>
          {l('Webhook 投递详情', 'Webhook delivery detail')}
        </h2>
      }
      extra={
        <Space>
          <Button disabled={!canRead} onClick={read.reload}>
            {l('重新读取投递详情', 'Read delivery detail again')}
          </Button>
          <Button disabled={blocked} onClick={onClose}>
            {l('关闭投递详情', 'Close delivery detail')}
          </Button>
        </Space>
      }
    >
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      {value && <DeliveryFacts value={value} locale={locale} />}
      <Space wrap>
        <Button
          disabled={disabled}
          onClick={() => {
            if (value)
              void command.submit({
                kind: 'replay',
                operationId: crypto.randomUUID(),
                source: { id: value.id, eventId: value.eventId },
              })
          }}
        >
          {l('创建重放投递', 'Create replay delivery')}
        </Button>
        <Button
          disabled={disabled || !value?.redriveWindowOpen}
          onClick={() => {
            if (value)
              void command.submit({
                kind: 'redrive',
                operationId: crypto.randomUUID(),
                source: { id: value.id, recoveryVersion: value.recoveryVersion },
              })
          }}
        >
          {l('恢复原投递', 'Redrive original delivery')}
        </Button>
      </Space>
      {value && value.status !== 'dead_letter' && (
        <p className="subtitle">
          {l(
            '当前未进入可恢复死信状态，不把 pending 或 unknown 当作死信。',
            'This delivery is not an eligible dead letter. Pending and unknown do not imply dead-letter status.',
          )}
        </p>
      )}
      {!value && (
        <p className="subtitle">
          {l(
            '没有当前投递事实时不发起新的恢复；已冻结的原请求仍可在当前权限下显式重提。',
            'No new recovery is started without current delivery facts. A retained original request can still be explicitly resubmitted with current authority.',
          )}
        </p>
      )}
      <WebhookCommandState command={command} permitted={canReplay} locale={locale} />
      {command.receipt && command.receipt.kind !== 'subscription' && canReplay && (
        <Link to={webhookHref({ tab: 'deliveries', delivery: command.receipt.value.id }, params)}>
          {l('读取回执对应的投递', 'Read the receipt delivery')}
        </Link>
      )}
    </Card>
  )
}
export function WebhookDeliveries({
  webhooks,
  binding,
  authority,
  locale,
  canRead,
  canReplay,
  blocked,
}: {
  webhooks: Webhooks
  binding: string
  authority: string
  locale: Locale
  canRead: boolean
  canReplay: boolean
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
    query = webhookDirectory(params, 'delivery'),
    subscription = params.get('deliverySubscription') ?? '',
    selected = params.get('delivery') ?? '',
    read = useRead(
      `${binding}/${authority}/${canRead}/deliveries/${subscription}/${JSON.stringify(query)}`,
      async () => {
        const generation = ++readGeneration.current
        if (!canRead) throw { code: 'forbidden', status: 403 }
        if (subscription) uuid(subscription)
        const filter = subscription
          ? (query.filter ? `(${query.filter});` : '') + `subscriptionId=='${subscription}'`
          : query.filter
        const page = await webhooks.deliveries(
          directoryQuery({ ...query, ...(filter === undefined ? {} : { filter }) }, fields),
        )
        return { ...page, generation }
      },
    )
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
    next.set('delivery', id)
    setParams(next)
  }
  function update(query: Query) {
    if (blocked) return
    const next = setWebhookDirectory(params, 'delivery', query)
    next.delete('delivery')
    setParams(next)
  }
  function close() {
    if (blocked) return
    const next = new URLSearchParams(params)
    next.delete('delivery')
    setParams(next)
  }
  return (
    <>
      <Space wrap>
        <Button disabled={!canRead} onClick={reloadDirectory}>
          {l('读取投递目录', 'Read delivery directory')}
        </Button>
        {subscription && (
          <>
            <span>
              {l('精确订阅范围', 'Exact subscription scope')} · <code>{subscription}</code>
            </span>
            <Button
              disabled={blocked}
              onClick={() => {
                const next = setWebhookDirectory(params, 'delivery', firstPage(query))
                next.delete('deliverySubscription')
                next.delete('delivery')
                setParams(next)
              }}
            >
              {l('清除订阅范围', 'Clear subscription scope')}
            </Button>
          </>
        )}
      </Space>
      <details>
        <summary>{l('定位已知投递', 'Locate a known delivery')}</summary>
        <Form
          name={prefix + '-locate'}
          layout="vertical"
          disabled={blocked || (!canRead && !canReplay)}
          onFinish={(value: { id: string }) => select(value.id)}
        >
          <Form.Item
            name="id"
            label={l('已知投递 UUID', 'Known delivery UUID')}
            rules={[{ required: true }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Button htmlType="submit">{l('定位精确投递', 'Locate exact delivery')}</Button>
        </Form>
      </details>
      {canRead ? (
        <Card title={l('投递目录', 'Deliveries')}>
          <details>
            <summary>{l('服务端筛选与列', 'Server filters and columns')}</summary>
            <DirectoryControls
              locale={locale}
              query={query}
              fields={[...fields]}
              sort={[
                'id',
                'eventId',
                'subscriptionId',
                'targetVersion',
                'recoveryVersion',
                'attempts',
                'status',
              ]}
              onChange={update}
              disabled={blocked}
            />
          </details>
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
              {l('从首页重新查询投递', 'Restart delivery search from the first page')}
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
                    title: l('投递', 'Delivery'),
                    render: (_, row) => (
                      <Button type="link" disabled={blocked} onClick={() => select(row.id)}>
                        {row.id}
                      </Button>
                    ),
                  },
                  {
                    title: l('结算状态', 'Settlement state'),
                    render: (_, row) =>
                      row.status === undefined ? (
                        l('未读取', 'Not read')
                      ) : (
                        <Status value={row.status} locale={locale} />
                      ),
                  },
                  {
                    title: l('接收观察', 'Transport observation'),
                    render: (_, row) =>
                      row.transportObservation === undefined
                        ? l('未读取', 'Not read')
                        : (row.transportObservation ?? l('没有事实', 'Unavailable')),
                  },
                  { title: l('尝试', 'Attempts'), dataIndex: 'attempts' },
                  { title: l('目标版本', 'Target version'), dataIndex: 'targetVersion' },
                  { title: l('恢复版本', 'Recovery version'), dataIndex: 'recoveryVersion' },
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
            '投递目录需要 Webhook 读取权限及对应事件设备权限。',
            'The delivery directory requires WebhookRead and the event-specific device authority.',
          )}
        />
      )}
      {selected && (
        <DeliveryDetail
          key={`${binding}/${selected}`}
          webhooks={webhooks}
          binding={binding}
          authority={authority}
          id={selected}
          locale={locale}
          canRead={canRead}
          canReplay={canReplay}
          blocked={blocked}
          onClose={close}
          onReadDenied={onReadDenied}
        />
      )}
    </>
  )
}
