import { useState } from 'react'
import { Alert, Button, Card, Checkbox, Input, Space } from 'antd'
import { comparison } from '@rss/api/mdm-query'
import { freeze } from '@rss/mdm-inventory'
import type { createPolicyEvents, EventRequest } from '@rss/mdm-policies'
import type { DevicesUseCases } from './EndpointPicker'
import type { Locale } from './i18n'
import {
  CursorControls,
  Failure,
  isUnknown,
  labels,
  ReadState,
  useAction,
  useRead,
  type Query,
} from './AdminUi'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import { EndpointPicker } from './EndpointPicker'
import { DataTable } from './DataTable'

type EventsUseCases = ReturnType<typeof createPolicyEvents>
export function PolicyEvents({
  events,
  devices,
  event,
  locale,
  canSubmit,
}: {
  events: EventsUseCases
  devices: DevicesUseCases
  event: string | null
  locale: Locale
  canSubmit: boolean
}) {
  const l = labels(locale),
    [device, setDevice] = useState<string | null>(null),
    guard = useSelectionGuard()
  usePendingSelection(guard.locked)
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card title={l('独立设备事件', 'Independent device events')}>
        <p className="subtitle">
          {l(
            '事件面向一个已核对终端，可匹配多个策略；批次接受、成员决定和设备执行分别读取。',
            'An event targets one verified endpoint and may match several policies. Read batch acceptance, member decisions and device execution separately.',
          )}
        </p>
        <fieldset className="permission-panel" disabled={guard.locked}>
          <EndpointPicker devices={devices} locale={locale} onChange={setDevice} />
        </fieldset>
        {device && (
          <DeviceEvents
            key={device}
            events={events}
            device={device}
            initialEvent={event ?? ''}
            locale={locale}
            canSubmit={canSubmit}
          />
        )}
      </Card>
    </SelectionGuard.Provider>
  )
}
function DeviceEvents({
  events,
  device,
  initialEvent,
  locale,
  canSubmit,
}: {
  events: EventsUseCases
  device: string
  initialEvent: string
  locale: Locale
  canSubmit: boolean
}) {
  const l = labels(locale),
    action = useAction(),
    [event, setEvent] = useState(initialEvent),
    [approved, setApproved] = useState(false),
    [pending, setPending] = useState<EventRequest | null>(null),
    [outcome, setOutcome] = useState<'none' | 'accepted' | 'unknown' | 'rejected'>('none'),
    [selected, setSelected] = useState<string | null>(null),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    read = useRead(`policy-event-batches/${device}/${JSON.stringify(query)}`, () =>
      events.batches(device, { limit: query.limit, cursor: query.cursor }),
    ),
    locked = action.busy || outcome === 'unknown'
  usePendingSelection(locked)
  async function submit() {
    const request = freeze({
      operationId: crypto.randomUUID(),
      event: event.trim().toLowerCase(),
      source: { kind: 'human' as const },
    })
    setPending(request)
    setApproved(false)
    const result = await action.run(() => events.submit(device, request))
    if (result.ok) {
      setOutcome('accepted')
      setSelected(result.value.batchId)
      read.reload()
    } else setOutcome(isUnknown(result.error) ? 'unknown' : 'rejected')
  }
  async function reconcile() {
    if (!pending) return
    const result = await action.run(() =>
      events.batches(device, {
        filter: comparison('operationId', '==', pending.operationId),
        limit: 2,
      }),
    )
    if (result.ok && result.value.items.length === 1) {
      const original = result.value.items[0]!
      if (
        original.operationId === pending.operationId &&
        original.request.operationId === pending.operationId &&
        original.event === pending.event &&
        original.request.source.kind === pending.source.kind
      ) {
        setSelected(original.id)
        setOutcome('accepted')
        read.reload()
      }
    }
  }
  return (
    <>
      <p>
        {l('目标终端', 'Target endpoint')} · <code>{device}</code>
      </p>
      <Failure locale={locale} error={action.error} />
      {pending && (
        <p>
          {l('原操作', 'Original operation')} · <code>{pending.operationId}</code>
        </p>
      )}
      {outcome === 'unknown' && (
        <Alert
          type="warning"
          title={l(
            '受理结果未知，仅查询原操作；查询未找到不证明提交失败。',
            'Acceptance outcome unknown. Query only the original operation; not found does not establish submission failure.',
          )}
        />
      )}
      {outcome === 'unknown' && (
        <Button disabled={action.busy} onClick={() => void reconcile()}>
          {l('查询原事件批次', 'Query original event batch')}
        </Button>
      )}
      {outcome === 'accepted' && (
        <Alert
          type="info"
          title={l(
            '批次已受理；成员与实际操作可能仍待处理。',
            'Batch accepted; members and actual operations may still be pending.',
          )}
        />
      )}
      <fieldset className="permission-panel" disabled={!canSubmit || locked || pending !== null}>
        <Space wrap>
          <Input
            aria-label={l('设备事件名', 'Device event name')}
            value={event}
            maxLength={64}
            onChange={(e) => setEvent(e.target.value)}
          />
          <Checkbox checked={approved} onChange={(e) => setApproved(e.target.checked)}>
            {l('确认向此设备提交独立事件', 'Confirm an independent event for this device')}
          </Checkbox>
          <Button
            type="primary"
            disabled={!approved || !event.trim()}
            onClick={() => void submit()}
          >
            {l('提交设备事件', 'Submit device event')}
          </Button>
        </Space>
      </fieldset>
      {pending && outcome !== 'unknown' && (
        <Button
          disabled={action.busy}
          onClick={() => {
            setPending(null)
            setOutcome('none')
            setApproved(false)
          }}
        >
          {l('准备另一个明确事件', 'Prepare another explicit event')}
        </Button>
      )}
      <Button onClick={read.reload}>{l('读取设备事件批次', 'Read device event batches')}</Button>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      {read.value && (
        <>
          <DataTable
            locale={locale}
            rowKey="id"
            dataSource={read.value.items}
            columns={[
              {
                title: l('批次', 'Batch'),
                render: (_, row) => (
                  <Button type="link" onClick={() => setSelected(row.id)}>
                    {row.id}
                  </Button>
                ),
              },
              { title: l('事件', 'Event'), dataIndex: 'event' },
              { title: l('受理成员', 'Frozen members'), dataIndex: 'members' },
              {
                title: l('成员接受进度', 'Member acceptance progress'),
                render: (_, row) =>
                  Object.entries(row.admission)
                    .map(([state, count]) => `${state}: ${count}`)
                    .join(' · '),
              },
              { title: l('处理失败', 'Processing failure'), dataIndex: 'processingFailure' },
            ]}
          />
          <CursorControls
            locale={locale}
            query={query}
            onChange={setQuery}
            next={read.value.nextCursor}
            count={read.value.items.length}
          />
        </>
      )}
      {selected && (
        <EventMembers
          key={selected}
          events={events}
          device={device}
          batch={selected}
          locale={locale}
        />
      )}
    </>
  )
}
function EventMembers({
  events,
  device,
  batch,
  locale,
}: {
  events: EventsUseCases
  device: string
  batch: string
  locale: Locale
}) {
  const l = labels(locale),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    detail = useRead(`policy-event/${device}/${batch}`, () => events.batch(device, batch)),
    read = useRead(`policy-event-members/${device}/${batch}/${JSON.stringify(query)}`, () =>
      events.members(device, batch, { limit: query.limit, cursor: query.cursor }),
    )
  return (
    <Card title={l('批次成员与原操作进度', 'Batch members and original operation progress')}>
      <p>
        <code>{batch}</code>
      </p>
      <Button
        onClick={() => {
          detail.reload()
          read.reload()
        }}
      >
        {l('读取成员与进度', 'Read members and progress')}
      </Button>
      <ReadState
        locale={locale}
        busy={detail.busy || read.busy}
        error={detail.error ?? read.error}
      />
      {detail.value && (
        <p>
          {detail.value.event} · {l('截止时间（UTC 秒）', 'Deadline (UTC seconds)')}{' '}
          {detail.value.deadline} · {detail.value.processingFailure ?? '—'}
        </p>
      )}
      {read.value && (
        <>
          <DataTable
            locale={locale}
            rowKey="id"
            dataSource={read.value.items}
            columns={[
              {
                title: l('策略 / 执行版本', 'Policy / execution version'),
                render: (_, row) => `${row.policyId} / ${row.versionId} · r${row.revision}`,
              },
              {
                title: l('成员决定', 'Member decision'),
                render: (_, row) =>
                  `${row.state}${'reason' in row.decision ? ` · ${row.decision.reason}` : ''}`,
              },
              {
                title: l('实际操作进度', 'Actual operation progress'),
                render: (_, row) =>
                  row.operations.length === 0
                    ? '—'
                    : row.operations.map((operation) => (
                        <p key={`${operation.reference.kind}/${operation.reference.id}`}>
                          <code>
                            {operation.reference.kind}/{operation.reference.id}
                          </code>{' '}
                          ·{' '}
                          {typeof operation.state === 'string'
                            ? operation.state
                            : 'execution' in operation.state
                              ? `${operation.state.delivery.kind} / ${operation.state.execution} / ${operation.state.cancellation}`
                              : operation.state.channels
                                  .map(
                                    (channel) =>
                                      `${channel.channel}: ${channel.stage} / ${channel.effect}`,
                                  )
                                  .join(' · ')}
                        </p>
                      )),
              },
            ]}
          />
          <CursorControls
            locale={locale}
            query={query}
            onChange={setQuery}
            next={read.value.nextCursor}
            count={read.value.items.length}
          />
        </>
      )}
    </Card>
  )
}
