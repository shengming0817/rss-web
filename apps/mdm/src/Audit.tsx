import { useEffect, useId, useRef, useState } from 'react'
import { Alert, Button, Card, Form, Input, InputNumber, Select, Space } from 'antd'
import { useSearchParams } from 'react-router-dom'
import type {
  ActivityPage,
  Audit as AuditUseCases,
  AuditPage,
  ManagementActivity,
} from '@rss/mdm-audit'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import {
  codeOf,
  CursorControls,
  Failure,
  Heading,
  labels,
  ReadState,
  useRead,
  validateInput,
} from './AdminUi'
import { useAdministration } from './useAdministration'
import { useSecretVisibility } from './SecretTabs'
import { DataTable } from './DataTable'
import { Status, timestamp } from './DevicePresentation'
import { ActivityFactView, AuditFactView } from './AuditFacts'
import { AuditPolicyLocator } from './AuditPolicyLookup'
import {
  activityQuery,
  auditFirstPage,
  auditHref,
  factQuery,
  localDate,
  readAuditContext,
  recordedTime,
  type AuditContext,
  type AuditView,
} from './audit-context'

type Facts = { kind: 'audit'; page: AuditPage } | { kind: 'activities'; page: ActivityPage }
type Draft = {
  view: AuditView
  device?: string | undefined
  from?: string | undefined
  until?: string | undefined
  limit?: number | undefined
  targetType?: string | undefined
  targetId?: string | undefined
  operationId?: string | undefined
  actor?: string | undefined
  action?: string | undefined
  outcome?: AuditContext['outcome']
  source?: string | undefined
  kind?: string | undefined
  status?: string | undefined
  policy?: string | undefined
  request?: string | undefined
  batch?: string | undefined
  task?: string | undefined
  operation?: string | undefined
  related?: string | undefined
}
function ActivityRows({
  rows,
  locale,
  onOpen,
}: {
  rows: readonly ManagementActivity[]
  locale: Locale
  onOpen: (id: string, trigger: HTMLElement) => void
}) {
  const l = labels(locale)
  return (
    <DataTable
      locale={locale}
      dataSource={rows}
      rowKey="id"
      columns={[
        {
          title: l('活动', 'Activity'),
          render: (_, row) => (
            <Button type="link" onClick={(event) => onOpen(row.id, event.currentTarget)}>
              {row.kind} · {row.phase}
            </Button>
          ),
        },
        { title: l('来源', 'Source'), dataIndex: 'source' },
        { title: l('记录时间', 'Recorded'), render: (_, row) => timestamp(locale, row.recordedAt) },
        { title: l('观察时间', 'Observed'), render: (_, row) => timestamp(locale, row.observedAt) },
        {
          title: l('执行事实', 'Execution fact'),
          render: (_, row) =>
            row.execution === null ? '—' : <Status value={row.execution} locale={locale} />,
        },
        {
          title: l('效果证据', 'Effect evidence'),
          render: (_, row) =>
            row.effect === null ? '—' : <Status value={row.effect} locale={locale} />,
        },
      ]}
    />
  )
}
function ActivityDetail({
  audit,
  binding,
  device,
  id,
  locale,
  context,
  onClose,
  onOpen,
  onDenied,
}: {
  audit: AuditUseCases
  binding: string
  device: string
  id: string
  locale: Locale
  context: AuditContext
  onClose: () => void
  onOpen: (id: string, trigger: HTMLElement) => void
  onDenied: () => void
}) {
  const l = labels(locale),
    title = useRef<HTMLHeadingElement>(null),
    read = useRead(`${binding}/activity-detail/${device}/${id}`, () => audit.activity(device, id)),
    [cursor, setCursor] = useState<string>(),
    related = useRead(`${binding}/activity-related/${device}/${id}/${cursor ?? ''}`, async () =>
      cursor ? audit.activities(device, { related: id, limit: 50, cursor }) : null,
    )
  useEffect(() => {
    title.current?.focus()
    setCursor(undefined)
  }, [id])
  const denied = [read.error, related.error].some((error) =>
    ['forbidden', 'permission_denied', 'insufficient_privilege'].includes(codeOf(error)),
  )
  useEffect(() => {
    if (denied) onDenied()
  }, [denied])
  return (
    <Card
      title={
        <h2 tabIndex={-1} ref={title}>
          {l('管理活动详情', 'Management activity detail')}
        </h2>
      }
      extra={
        <Space>
          <Button
            onClick={() => {
              setCursor(undefined)
              read.reload()
            }}
          >
            {l('重新读取活动详情', 'Read activity detail again')}
          </Button>
          <Button onClick={onClose}>{l('关闭活动详情', 'Close activity detail')}</Button>
        </Space>
      }
    >
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      <ReadState busy={!!cursor && related.busy} error={related.error} locale={locale} />
      {read.value && !read.error && !related.error && !denied && (
        <>
          <ActivityFactView
            fact={read.value.activity}
            device={device}
            locale={locale}
            context={context}
          />
          <p className="subtitle">
            {l('详情观察时间', 'Detail observed as of')} · {timestamp(locale, read.value.asOf)}
          </p>
          {read.value.missing.length > 0 && (
            <Alert
              type="warning"
              title={l('部分关联事实不可用', 'Some related facts are unavailable')}
              description={read.value.missing.join(' · ')}
            />
          )}
          <h3>{l('关联事实', 'Related facts')}</h3>
          {!related.error && (!cursor || related.value) && (
            <ActivityRows
              rows={cursor ? (related.value?.items ?? []) : read.value.related}
              locale={locale}
              onOpen={onOpen}
            />
          )}
          <Space>
            <Button disabled={!cursor} onClick={() => setCursor(undefined)}>
              {l('关联首页', 'First related page')}
            </Button>
            <Button
              disabled={
                related.busy || !(cursor ? related.value?.nextCursor : read.value.relatedCursor)
              }
              onClick={() => {
                const next = cursor ? related.value?.nextCursor : read.value?.relatedCursor
                if (next) setCursor(next)
              }}
            >
              {l('下一页关联事实', 'Next related facts')}
            </Button>
          </Space>
          <p className="subtitle">
            {l(
              '关联事实使用独立范围，不套用上方列表筛选。',
              'Related facts use their own scope, independently of the list filters above.',
            )}
          </p>
        </>
      )}
    </Card>
  )
}

export function Audit({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale)
  return (
    <section className="audit-page">
      <Heading
        title={l('审计与管理活动', 'Audit and management activity')}
        hint={l(
          '按原目标与操作读取安全事实，分别核对记录、观察、提交与设备效果。',
          'Read safe facts by original target and operation, keeping recording, observation, submission and device effects separate.',
        )}
      />
      <AuditWorkspace runtime={runtime} locale={locale} />
    </section>
  )
}
/** Also embedded on a selected endpoint. Independent routes never require DeviceView first. */
export function AuditWorkspace({
  runtime,
  locale,
  device: fixedDevice,
}: {
  runtime: Runtime
  locale: Locale
  device?: string
}) {
  const l = labels(locale),
    prefix = useId(),
    visible = useSecretVisibility(),
    { audit, auditPolicyLookup, authorization, binding } = useAdministration(runtime),
    permissions = useRead(`${binding}/audit-permissions`, authorization.effective),
    [params, setParams] = useSearchParams(),
    [form] = Form.useForm<Draft>(),
    [inputError, setInputError] = useState<unknown>(null),
    [denied, setDenied] = useState(false),
    [selected, setSelected] = useState(''),
    trigger = useRef<HTMLElement | null>(null),
    factTitle = useRef<HTMLHeadingElement>(null)
  let context: AuditContext = { view: fixedDevice ? 'timeline' : 'audit' },
    invalid: unknown
  try {
    context = readAuditContext(params, context.view)
  } catch (error) {
    invalid = error
  }
  if (fixedDevice)
    context =
      context.device && context.device !== fixedDevice
        ? {
            view: context.view,
            device: fixedDevice,
            from: context.from,
            until: context.until,
            limit: context.limit,
          }
        : { ...context, device: fixedDevice }
  const { activity: selectedActivity, ...listContext } = context
  const key = JSON.stringify(listContext) + (invalid ? `/invalid/${params.toString()}` : ''),
    grants = permissions.value?.grants ?? [],
    authority = permissions.busy || permissions.error ? '' : JSON.stringify(grants),
    has = (operation: string) =>
      !!authority &&
      grants.some((grant) => grant.operation === operation && grant.scope.kind === 'tenant'),
    canAudit = has('audit_read'),
    canLookup = has('policy_read'),
    canActivities =
      !!context.device &&
      !!authority &&
      grants.some(
        (grant) =>
          grant.operation === 'operation_read' &&
          (grant.scope.kind === 'all_devices' ||
            (grant.scope.kind === 'device' && grant.scope.id === context.device)),
      ),
    permitted = visible && !denied && (context.view === 'activities' ? canActivities : canAudit),
    read = useRead<Facts>(
      `${binding}/${authority}/${visible}/${permitted}/audit-facts/${key}`,
      async () => {
        if (invalid) throw { cause: 'client', code: 'invalid_input' }
        if (!permitted) throw { code: 'forbidden', status: 403 }
        if (context.view === 'activities') {
          if (!context.device) throw { cause: 'client', code: 'invalid_input' }
          return {
            kind: 'activities',
            page: await audit.activities(
              context.device,
              activityQuery({ ...context, limit: context.limit ?? 20 }),
            ),
          }
        }
        const query = factQuery({ ...context, limit: context.limit ?? 20 })
        if (context.view === 'timeline') {
          if (!context.device) throw { cause: 'client', code: 'invalid_input' }
          const { device, ...window } = query
          void device
          return { kind: 'audit', page: await audit.timeline(context.device, window) }
        }
        return { kind: 'audit', page: await audit.search(query) }
      },
    ),
    draftView = Form.useWatch('view', form) ?? context.view
  useEffect(() => {
    setSelected('')
    setDenied(false)
    form.resetFields()
    if (visible && authority)
      form.setFieldsValue({
        ...context,
        from: localDate(context.from),
        until: localDate(context.until),
        limit: context.limit ?? 20,
      })
    setInputError(null)
  }, [key, visible, authority, form])
  useEffect(() => {
    if (selected) factTitle.current?.focus()
  }, [selected])
  function apply(next: AuditContext) {
    setSelected('')
    setInputError(null)
    const href = auditHref(next)
    setParams(new URLSearchParams(href.split('?')[1] ?? ''))
  }
  function submit(value: Draft) {
    try {
      const raw: AuditContext = {
        ...value,
        view: value.view,
        ...(fixedDevice ? { device: fixedDevice } : {}),
        from: recordedTime(value.from),
        until: recordedTime(value.until),
      }
      const next = Object.fromEntries(
        Object.entries(raw).filter(([, value]) => value !== undefined && value !== ''),
      ) as unknown as AuditContext
      validateInput(() => {
        factQuery(next)
        activityQuery(next)
        if (next.view !== 'audit' && !next.device) throw new Error('Device required')
      })
      apply(auditFirstPage(next))
    } catch (error) {
      setInputError(error)
    }
  }
  function open(id: string, button: HTMLElement) {
    trigger.current = button
    apply({ ...context, activity: id })
  }
  function close() {
    const { activity, ...rest } = context
    void activity
    apply(rest)
    queueMicrotask(() => {
      if (trigger.current?.isConnected) trigger.current.focus()
    })
  }
  const facts = permitted && !read.error && read.value?.kind === 'audit' ? read.value.page : null,
    activities =
      permitted && !read.error && read.value?.kind === 'activities' ? read.value.page : null,
    current = facts?.items.find(
      (fact) => `${fact.source}/${fact.position}/${fact.eventId}` === selected,
    )
  return (
    <div className="audit-page admin-stack">
      <Space wrap>
        <Button
          onClick={() => {
            setDenied(false)
            permissions.reload()
            read.reload()
          }}
        >
          {l('读取当前权限与事实', 'Read current authority and facts')}
        </Button>
      </Space>
      <ReadState busy={permissions.busy} error={permissions.error} locale={locale} />
      <Card title={l('检索范围', 'Search scope')}>
        <Form
          name={prefix + '-query'}
          form={form}
          layout="vertical"
          onFinish={submit}
          disabled={!visible || !authority}
        >
          <div className="admin-form-grid">
            <Form.Item name="view" label={l('事实类型', 'Fact type')}>
              <Select
                options={[
                  { value: 'audit', label: l('审计检索', 'Audit search') },
                  { value: 'timeline', label: l('设备时间线', 'Device timeline') },
                  { value: 'activities', label: l('设备管理活动', 'Device management activity') },
                ]}
              />
            </Form.Item>
            {!fixedDevice && (
              <Form.Item
                name="device"
                label={l('设备 ID（设备视图必需）', 'Device ID (required for device views)')}
              >
                <Input maxLength={256} autoComplete="off" />
              </Form.Item>
            )}
            <Form.Item
              name="from"
              label={l('记录开始（本地时间，含）', 'Recorded from (local, inclusive)')}
            >
              <Input type="datetime-local" step={1} />
            </Form.Item>
            <Form.Item
              name="until"
              label={l('记录结束（本地时间，不含）', 'Recorded until (local, exclusive)')}
            >
              <Input type="datetime-local" step={1} />
            </Form.Item>
          </div>
          <details>
            <summary>{l('高级定位条件', 'Advanced locators')}</summary>
            <div className="admin-form-grid">
              {(draftView === 'activities'
                ? [
                    ['policy', l('Policy ID', 'Policy ID')],
                    ['operation', l('原生 operation ID', 'Native operation ID')],
                    ['request', l('原请求 ID', 'Original request ID')],
                    ['task', l('任务 ID', 'Task ID')],
                    ['batch', l('批次 ID', 'Batch ID')],
                    ['source', l('来源', 'Source')],
                    ['kind', l('活动类别', 'Activity kind')],
                    ['status', l('状态维度', 'Status dimension')],
                    ['related', l('关联活动 ID', 'Related activity ID')],
                  ]
                : [
                    ['targetType', l('目标类型', 'Target type')],
                    ['targetId', l('目标 ID', 'Target ID')],
                    ['operationId', l('原 operation ID', 'Original operation ID')],
                    ['actor', l('主体', 'Actor')],
                    ['action', l('行为', 'Action')],
                  ]
              ).map(([name, label]) => (
                <Form.Item key={name} name={name!} label={label}>
                  <Input maxLength={256} autoComplete="off" />
                </Form.Item>
              ))}
              {draftView !== 'activities' && (
                <Form.Item name="outcome" label={l('审计结果', 'Audit outcome')}>
                  <Select
                    allowClear
                    options={['succeeded', 'denied', 'failed', 'unknown'].map((value) => ({
                      value,
                      label: value,
                    }))}
                  />
                </Form.Item>
              )}
              <Form.Item name="limit" label={l('每页', 'Page size')}>
                <InputNumber min={1} max={200} precision={0} />
              </Form.Item>
            </div>
          </details>
          <Space wrap>
            <Button type="primary" htmlType="submit">
              {l('查询', 'Search')}
            </Button>
            <Button
              onClick={() =>
                apply({
                  view: fixedDevice ? 'timeline' : 'audit',
                  ...(fixedDevice ? { device: fixedDevice } : {}),
                })
              }
            >
              {l('清除筛选', 'Clear filters')}
            </Button>
          </Space>
        </Form>
        <Failure error={inputError} locale={locale} kind="read" />
      </Card>
      <AuditPolicyLocator
        lookup={auditPolicyLookup}
        locale={locale}
        permitted={visible && canLookup}
        device={context.device}
        onPolicy={(policy, activity) =>
          apply(
            auditFirstPage({
              view: activity ? 'activities' : 'audit',
              device: context.device,
              from: context.from,
              until: context.until,
              limit: context.limit,
              ...(activity ? { policy: policy.id } : { targetType: 'policy', targetId: policy.id }),
            }),
          )
        }
      />
      {!permissions.busy && !permitted && (
        <Alert
          type="info"
          title={l(
            '当前所选事实的读取权限尚未确认；审计和设备活动分别授权。',
            'Read permission for these facts is unconfirmed. Audit and device activity are independently authorized.',
          )}
        />
      )}
      {permitted && (
        <Card
          title={
            context.view === 'activities'
              ? l('设备管理活动', 'Device management activity')
              : l('审计事实', 'Audit facts')
          }
        >
          <ReadState busy={read.busy} error={read.error} locale={locale} />
          {context.cursor && !!read.error && (
            <Button onClick={() => apply(auditFirstPage(context))}>
              {l('从首页重新查询事实', 'Restart fact search from the first page')}
            </Button>
          )}
          {facts && (
            <>
              <p className="subtitle">
                {l('索引观察范围', 'Observed index coverage')} ·{' '}
                {facts.coverage.complete
                  ? l('本次未观察到索引缺口', 'No index gaps observed on this read')
                  : l('存在未覆盖事实', 'Some facts are not covered')}
              </p>
              <DataTable
                locale={locale}
                dataSource={facts.items}
                rowKey={(fact) => `${fact.source}/${fact.position}/${fact.eventId}`}
                columns={[
                  {
                    title: l('行为', 'Action'),
                    render: (_, row) => (
                      <Button
                        type="link"
                        onClick={(event) => {
                          trigger.current = event.currentTarget
                          setSelected(`${row.source}/${row.position}/${row.eventId}`)
                        }}
                      >
                        {row.action}
                      </Button>
                    ),
                  },
                  { title: l('主体', 'Actor'), dataIndex: 'actor' },
                  {
                    title: l('目标', 'Target'),
                    render: (_, row) => `${row.target.type} · ${row.target.id}`,
                  },
                  {
                    title: l('记录时间', 'Recorded'),
                    render: (_, row) => timestamp(locale, row.recordedAt),
                  },
                  {
                    title: l('观察时间', 'Observed'),
                    render: (_, row) => timestamp(locale, row.observedAt),
                  },
                  {
                    title: l('审计结果', 'Audit outcome'),
                    render: (_, row) => <Status value={row.auditOutcome} locale={locale} />,
                  },
                ]}
              />
            </>
          )}
          {activities && (
            <>
              <p className="subtitle">
                {l('快照观察时间', 'Snapshot observed as of')} ·{' '}
                {timestamp(locale, activities.asOf)} ·{' '}
                {l('最早保留记录', 'Earliest retained recording')} ·{' '}
                {activities.retainedFrom === null
                  ? l('没有事实', 'Unavailable')
                  : timestamp(locale, activities.retainedFrom)}
              </p>
              {activities.coverage.map((coverage) => (
                <p className="subtitle" key={coverage.source}>
                  {coverage.source} ·{' '}
                  {coverage.complete
                    ? l('本次覆盖', 'Covered on this read')
                    : l('覆盖不完整', 'Incomplete coverage')}{' '}
                  {coverage.reasons.join(' · ')}
                </p>
              ))}
              <ActivityRows rows={activities.items} locale={locale} onOpen={open} />
              <p className="subtitle">
                {l(
                  '固定历史快照，不提供浏览器增量同步。',
                  'A fixed historical snapshot; browser incremental synchronization is unavailable.',
                )}
              </p>
            </>
          )}
          {(facts || activities) && (
            <CursorControls
              locale={locale}
              query={context}
              next={(facts ?? activities)!.nextCursor}
              count={(facts ?? activities)!.items.length}
              onChange={(value) => apply({ ...value, view: context.view })}
            />
          )}
        </Card>
      )}
      {current && (
        <Card
          title={
            <h2 tabIndex={-1} ref={factTitle}>
              {l('审计事实详情', 'Audit fact detail')}
            </h2>
          }
          extra={
            <Button
              onClick={() => {
                setSelected('')
                queueMicrotask(() => trigger.current?.focus())
              }}
            >
              {l('关闭事实详情', 'Close fact detail')}
            </Button>
          }
        >
          <AuditFactView fact={current} locale={locale} context={context} />
        </Card>
      )}
      {permitted &&
        !invalid &&
        !read.error &&
        context.view === 'activities' &&
        context.device &&
        selectedActivity && (
          <ActivityDetail
            key={`${binding}/${authority}/${context.device}/${selectedActivity}`}
            audit={audit}
            binding={`${binding}/${authority}`}
            device={context.device}
            id={selectedActivity}
            locale={locale}
            context={context}
            onClose={close}
            onOpen={open}
            onDenied={() => setDenied(true)}
          />
        )}
    </div>
  )
}
