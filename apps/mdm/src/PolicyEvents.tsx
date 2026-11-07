import { Link, useLocation, useSearchParams } from 'react-router-dom'
import type { Runtime } from './runtime'
import { EntryCopies } from './EntryCopies'
import { auditHref } from './audit-context'
import { retirementPath, resultReturnPath } from './execution-context'
import { executionPath } from './Executions'
import { useState, useEffect } from 'react'
import { Alert, Button, Card, Checkbox, Input, Space } from 'antd'
import { freeze, uuid } from '@rss/mdm-inventory'
import { validateEventRequest, type createPolicyEvents, type EventRequest } from '@rss/mdm-policies'
import type { DevicesUseCases } from './EndpointPicker'
import type { Locale } from './i18n'
import {
  CursorControls,
  firstPage,
  Failure,
  isUnknown,
  labels,
  ReadState,
  useAction,
  usePageRead,
  validateInput,
  type Query,
} from './AdminUi'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import { EndpointPicker } from './EndpointPicker'
import { DataTable } from './DataTable'

type EventsUseCases = ReturnType<typeof createPolicyEvents>
export function PolicyEvents({
  events,
  devices,
  runtime,
  event,
  locale,
  canSubmit,
}: {
  events: EventsUseCases
  devices: DevicesUseCases
  runtime: Runtime
  event: string | null
  locale: Locale
  canSubmit: boolean
}) {
  const l = labels(locale),
    [params, setParams] = useSearchParams(),
    [verified, setVerified] = useState<string | null>(null),
    guard = useSelectionGuard(),
    device = guard.locked && verified ? verified : params.get('eventDevice'),
    source = resultReturnPath(params.get('returnTo'))
  usePendingSelection(guard.locked)
  useEffect(() => {
    if (guard.locked && verified && params.get('eventDevice') !== verified) {
      const next = new URLSearchParams(params)
      next.set('eventDevice', verified)
      for (const key of ['batch', 'member', 'batchCursor', 'memberCursor']) next.delete(key)
      setParams(next, { replace: true })
    }
  }, [guard.locked, verified, params, setParams])
  function select(id: string) {
    const next = new URLSearchParams(params)
    next.set('eventDevice', id)
    for (const key of ['batch', 'member', 'batchCursor', 'memberCursor']) next.delete(key)
    setVerified(id)
    setParams(next)
  }

  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card title={l('独立设备事件', 'Independent device events')}>
        {source && <Link to={source}>{l('返回来源', 'Return to source')}</Link>}
        <p className="subtitle">
          {l(
            '事件面向一个已核对终端，可匹配多个策略；批次接受、成员决定和设备执行分别读取。',
            'An event targets one verified endpoint and may match several policies. Read batch acceptance, member decisions and device execution separately.',
          )}
        </p>
        <fieldset className="permission-panel" disabled={guard.locked}>
          <EndpointPicker devices={devices} locale={locale} onChange={select} />
        </fieldset>
        {device && (
          <DeviceEvents
            key={device}
            events={events}
            runtime={runtime}
            device={device}
            initialEvent={event ?? ''}
            locale={locale}
            canSubmit={canSubmit && device === verified}
          />
        )}
      </Card>
    </SelectionGuard.Provider>
  )
}
function DeviceEvents({
  events,
  runtime,
  device,
  initialEvent,
  locale,
  canSubmit,
}: {
  events: EventsUseCases
  runtime: Runtime
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
    [params, setParams] = useSearchParams(),
    selected = params.get('batch'),
    cursor = params.get('batchCursor'),
    query = { limit: 20, ...(cursor ? { cursor } : {}) },
    read = usePageRead(
      `policy-event-batches/${device}/${JSON.stringify(query)}`,
      (signal) => events.batches(device, query, signal),
      { retryReadConflict: !query.cursor },
    ),
    locked = action.busy || outcome === 'unknown'
  usePendingSelection(locked)
  function setSelected(id: string) {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('batch', id)
      next.delete('member')
      next.delete('memberCursor')
      return next
    })
  }
  function setQuery(next: Query) {
    const value = new URLSearchParams(params)
    if (next.cursor) value.set('batchCursor', next.cursor)
    else value.delete('batchCursor')
    setParams(value)
  }
  async function submit() {
    const request = freeze({
      operationId: crypto.randomUUID(),
      event: event.trim().toLowerCase(),
      source: { kind: 'human' as const },
    })
    setPending(request)
    setApproved(false)
    const result = await action.run(() => {
      validateInput(() => validateEventRequest(device, request))
      return events.submit(device, request)
    })
    if (result.ok) {
      setOutcome('accepted')
      setSelected(result.value.batchId)
      read.reload()
    } else {
      setOutcome(isUnknown(result.error) ? 'unknown' : 'rejected')
      if (!isUnknown(result.error)) setPending(null)
    }
  }
  async function reconcile() {
    if (!pending) return
    const result = await action.run(() => events.original(device, pending))
    if (result.ok && result.value) {
      setSelected(result.value.id)
      setOutcome('accepted')
      read.reload()
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
      <ReadState
        locale={locale}
        busy={read.busy}
        error={read.error}
        onRetry={read.reload}
        onRestart={() => (query.cursor ? setQuery(firstPage(query)) : read.reload())}
      />
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
          runtime={runtime}
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
  runtime,
  device,
  batch,
  locale,
}: {
  events: EventsUseCases
  runtime: Runtime
  device: string
  batch: string
  locale: Locale
}) {
  const l = labels(locale),
    location = useLocation(),
    [params, setParams] = useSearchParams(),
    source = location.pathname + location.search,
    member = params.get('member'),
    cursor = params.get('memberCursor'),
    query = { limit: 20, ...(cursor ? { cursor } : {}) },
    detail = usePageRead(
      `policy-event/${device}/${batch}`,
      (signal) => events.batch(device, batch, signal),
      { retryReadConflict: true },
    ),
    read = usePageRead(
      `policy-event-members/${device}/${batch}/${JSON.stringify(query)}/${member ?? ''}`,
      async (signal) => {
        const page = await events.members(
          device,
          batch,
          member ? { limit: 1, filter: `id=='${uuid(member)}'` } : query,
          signal,
        )
        if (
          member &&
          (page.nextCursor ||
            page.items.length > 1 ||
            page.items.some((item) => item.id !== member))
        )
          throw new Error('Wrong event member identity')
        return page
      },
      { retryReadConflict: !query.cursor },
    )
  function setQuery(next: Query) {
    const value = new URLSearchParams(params)
    if (next.cursor) value.set('memberCursor', next.cursor)
    else value.delete('memberCursor')
    setParams(value)
  }
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
        empty={read.value?.items.length === 0}
        onRetry={() => {
          detail.reload()
          read.reload()
        }}
        onRestart={() => (query.cursor ? setQuery(firstPage(query)) : read.reload())}
      />
      {member && (
        <Button
          onClick={() => {
            const next = new URLSearchParams(params)
            next.delete('member')
            next.delete('memberCursor')
            setParams(next)
          }}
        >
          {l('查看全部成员', 'View all members')}
        </Button>
      )}
      {detail.value && !read.error && (
        <>
          <p>
            {detail.value.event} · {l('来源', 'Source')}: {detail.value.request.source.kind} ·{' '}
            {l('截止时间（UTC 秒）', 'Deadline (UTC seconds)')} {detail.value.deadline} ·{' '}
            {detail.value.processingFailure ?? '—'}
          </p>
          <Link to={auditHref({ view: 'activities', device, batch })}>
            {l('查看批次管理活动', 'View batch management activity')}
          </Link>
          <EntryCopies
            runtime={runtime}
            locale={locale}
            device={device}
            entries={[
              {
                label: l('原事件批次', 'Original event batch'),
                target: { selector: { kind: 'batch', id: batch } },
              },
              {
                label: l('共享事件', 'Shared event'),
                target: { selector: { kind: 'event', name: detail.value.event } },
              },
            ]}
          />
        </>
      )}
      {detail.value && read.value && (
        <>
          <DataTable
            locale={locale}
            rowKey="id"
            dataSource={read.value.items}
            columns={[
              {
                title: l('策略 / 执行版本', 'Policy / execution version'),
                render: (_, row) => (
                  <>
                    <Link
                      to={`/policies?${new URLSearchParams({ policy: row.policyId, tab: 'definition', returnTo: source })}`}
                    >
                      {row.policyId}
                    </Link>{' '}
                    / {row.versionId} · r{row.revision}
                  </>
                ),
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
                          <Link
                            to={
                              operation.reference.kind === 'retirement'
                                ? retirementPath(device, operation.reference.id, source)
                                : executionPath(
                                    operation.reference.kind === 'run' ? 'action_run' : 'command',
                                    operation.reference.id,
                                    operation.reference.kind === 'run' ? row.policyId : undefined,
                                    source,
                                  )
                            }
                          >
                            {operation.reference.kind}/{operation.reference.id}
                          </Link>{' '}
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
