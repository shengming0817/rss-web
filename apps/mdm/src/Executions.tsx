import { TaskTrust } from './TaskTrust'
import { ControlRecoveryPanel } from './ControlRecovery'
import { useEffect, useState } from 'react'
import { Alert, Button, Card, Form, Input, Space } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import type { ExecutionRef } from '@rss/mdm-execution'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { CursorControls, Heading, labels, ReadState, usePageRead, type Query } from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { devicePath } from './Devices'
import { ExecutionEvidence } from './ExecutionEvidence'
import { resultReturnPath, resultSourcePath } from './execution-context'
import { timestamp, Status } from './DevicePresentation'
export function executionPath(
  kind: 'command' | 'action_run',
  id: string,
  policy?: string,
  returnTo?: string,
) {
  return `/operations?${new URLSearchParams({ kind, operation: id, ...(policy ? { policy } : {}), ...(returnTo ? { returnTo } : {}) })}`
}
/** Return context is a resource locator, never authority or a redirect to another host. */
export function policyReturnPath(policy: string, returnTo: string | null) {
  const path = resultReturnPath(returnTo, '/policies')
  if (path && new URL(path, 'https://mdm.invalid').searchParams.get('policy') === policy)
    return path
  return `/policies?${new URLSearchParams({ policy })}`
}
export function deviceExecutionsPath(device: string, returnTo?: string) {
  const literal = `'${device.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
  return `/operations?${new URLSearchParams({ filter: `device==${literal}`, ...(returnTo ? { returnTo } : {}) })}`
}
function ExecutionFacts({
  runtime,
  locale,
  reference,
}: {
  runtime: Runtime
  locale: Locale
  reference: ExecutionRef & { readonly policy?: string }
}) {
  const l = labels(locale),
    [params] = useSearchParams(),
    { execution, binding } = useAdministration(runtime),
    summary = usePageRead(
      `${binding}/execution-summary/${reference.kind}/${reference.id}`,
      (signal) => execution.summary(reference, signal),
      { retryReadConflict: true },
    ),
    [expanded, setExpanded] = useState(false),
    read = usePageRead(
      `${binding}/execution/${reference.kind}/${reference.id}/${reference.policy ?? ''}/${expanded}`,
      (signal) => (expanded ? execution.detail(reference, signal) : Promise.resolve(null)),
      { retryReadConflict: true },
    ),
    detail = read.value?.detail,
    item = summary.value,
    policy = read.value?.policy ?? item?.policy,
    device = detail?.device ?? item?.device,
    deviceHref = device ? devicePath('endpoint', device) : null,
    returnDevice = deviceHref ? resultReturnPath(params.get('returnTo'), deviceHref) : null,
    [recovery, setRecovery] = useState<Parameters<typeof ControlRecoveryPanel>[0] | null>(null)
  useEffect(() => {
    if (detail?.kind === 'command' && detail.owner === 'device' && item?.origin === 'direct')
      setRecovery({
        runtime,
        locale,
        device: detail.device,
        id: detail.id,
        revision: detail.revision,
        registration: item.registrationId,
        generation: item.generation,
        canReauthorize: detail.reauthorization?.state === 'available',
        confirmationRequired: detail.reauthorization?.confirmationRequired ?? false,
        terminal: ['applied', 'rejected', 'cancelled', 'timed_out', 'superseded'].includes(
          detail.delivery,
        ),
        onRefresh: read.reload,
      })
    else setRecovery(null)
  }, [detail, item, runtime, locale])
  return (
    <Card title={l('原操作与结果', 'Original operation and result')}>
      <ReadState
        locale={locale}
        busy={summary.busy}
        error={summary.error}
        empty={item === null}
        onRetry={summary.reload}
      />
      <dl className="device-facts">
        <div>
          <dt>{l('操作', 'Operation')}</dt>
          <dd>{reference.id}</dd>
        </div>
        {item && (
          <div>
            <dt>{l('目录状态', 'Directory state')}</dt>
            <dd>
              <Status locale={locale} value={item.status} />
            </dd>
          </div>
        )}
        {deviceHref && (
          <div>
            <dt>{l('设备', 'Device')}</dt>
            <dd>
              <Link to={returnDevice ?? deviceHref}>{device}</Link>
            </dd>
          </div>
        )}
        {policy && (
          <div>
            <dt>{l('原策略', 'Original policy')}</dt>
            <dd>
              <Link to={policyReturnPath(policy, params.get('returnTo'))}>{policy}</Link>
            </dd>
          </div>
        )}
        {item && (
          <div>
            <dt>{l('执行注册 / 代次', 'Execution registration / generation')}</dt>
            <dd>
              {item.registrationId} @{item.generation}
            </dd>
          </div>
        )}
      </dl>
      <Button
        onClick={() => {
          if (expanded) read.reload()
          else setExpanded(true)
        }}
      >
        {l('读取详细结果与证据', 'Read detailed results and evidence')}
      </Button>
      <p className="subtitle">
        {l(
          '详细结果按原权限单独读取；目录可见不授予脚本输出或敏感资产权限。',
          'Details require their original permissions; a visible directory grants no script-output or sensitive-inventory access.',
        )}
      </p>
      {expanded && (
        <ReadState
          locale={locale}
          busy={read.busy}
          error={read.error}
          empty={read.value === null}
          onRetry={read.reload}
        />
      )}
      {detail && <ExecutionEvidence detail={detail} locale={locale} />}
      <Alert
        type="info"
        showIcon
        title={l(
          '命令受理、投递、设备回执与实际效果分别观察。无回执保持未知。',
          'Observe admission, delivery, device receipts and actual effects separately. Missing receipts remain unknown.',
        )}
      />
      {recovery && (
        <fieldset
          className="permission-panel"
          hidden={read.busy || !!read.error || summary.busy || !!summary.error}
          disabled={read.busy || !!read.error || summary.busy || !!summary.error}
        >
          <ControlRecoveryPanel {...recovery} />
        </fieldset>
      )}
    </Card>
  )
}

export function Executions({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { execution, binding } = useAdministration(runtime),
    [params, setParams] = useSearchParams(),
    filter = params.get('filter') ?? '',
    cursor = params.get('cursor'),
    [draft, setDraft] = useState(filter),
    query: Query = { limit: 20, ...(filter ? { filter } : {}), ...(cursor ? { cursor } : {}) },
    read = usePageRead(
      `${binding}/executions/${JSON.stringify(query)}`,
      (signal) => execution.list(query, signal),
      { retryReadConflict: !query.cursor },
    ),
    statistics = usePageRead(
      `${binding}/execution-statistics/${filter}`,
      (signal) => execution.statistics(filter || undefined, signal),
      { retryReadConflict: true },
    ),
    operation = params.get('operation'),
    kind = params.get('kind'),
    reference: (ExecutionRef & { readonly policy?: string }) | null =
      operation && (kind === 'command' || kind === 'action_run')
        ? {
            id: operation,
            kind,
            ...(params.get('policy') ? { policy: params.get('policy')! } : {}),
          }
        : null
  useEffect(() => setDraft(filter), [filter])
  function changeQuery(next: Query) {
    const nextParams = new URLSearchParams(params)
    for (const name of ['filter', 'cursor']) nextParams.delete(name)
    if (next.filter) nextParams.set('filter', next.filter)
    if (next.cursor) nextParams.set('cursor', next.cursor)
    setParams(nextParams)
  }
  return (
    <div className="execution-page">
      <Heading
        title={l('执行与结果', 'Executions and results')}
        hint={l(
          '从设备、策略或原操作定位投递、执行和效果事实。',
          'Locate delivery, execution and effect facts by device, policy or original operation.',
        )}
      />
      {resultSourcePath(params.get('returnTo')) && (
        <Link to={resultSourcePath(params.get('returnTo'))!}>
          {l('返回来源', 'Return to source')}
        </Link>
      )}
      <p className="subtitle">
        {l(
          '目录包含脚本与采集；当前资格和最近结果分别观察，允许开始时间不是设备执行承诺。',
          'The directory includes scripts and collections. Observe current eligibility separately from historical results; an earliest allowed start is not a device execution promise.',
        )}
      </p>
      <ReadState
        locale={locale}
        busy={statistics.busy}
        error={statistics.error}
        onRetry={statistics.reload}
      />
      {statistics.value && (
        <>
          <div className="execution-metrics">
            {[
              [l('执行总数', 'Total executions'), statistics.value.total],
              [l('原生命令', 'Native commands'), statistics.value.commands],
              [l('任务运行', 'Task runs'), statistics.value.actionRuns],
              [l('结果未知', 'Unknown results'), statistics.value.unknown],
            ].map(([title, value]) => (
              <div key={title}>
                <span>{title}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p className="subtitle">
            {l('统计快照', 'Statistics snapshot')}: {timestamp(locale, statistics.value.asOf)}
          </p>
        </>
      )}
      <Form
        className="admin-toolbar"
        layout="inline"
        onFinish={() => changeQuery({ limit: 20, filter: draft })}
      >
        <Form.Item label={l('服务端筛选', 'Server filter')}>
          <Input
            aria-label={l('执行筛选', 'Execution filter')}
            value={draft}
            maxLength={8192}
            onChange={(e) => setDraft(e.target.value)}
          />
        </Form.Item>
        <Button htmlType="submit">{l('应用筛选', 'Apply filter')}</Button>
        <Button
          onClick={() => {
            read.reload()
            statistics.reload()
          }}
        >
          {l('刷新', 'Refresh')}
        </Button>
      </Form>
      <ReadState
        locale={locale}
        busy={read.busy}
        error={read.error}
        empty={read.value?.items.length === 0}
        onRetry={read.reload}
        onRestart={() => {
          if (query.cursor) {
            const next = new URLSearchParams(params)
            next.delete('cursor')
            setParams(next)
          } else read.reload()
        }}
      />
      {read.value && (
        <>
          <DataTable
            locale={locale}
            rowKey={(row) => `${row.kind}/${row.id}`}
            dataSource={read.value.items}
            columns={[
              {
                title: l('操作', 'Operation'),
                render: (_, row) => (
                  <Button
                    type="link"
                    onClick={() => {
                      const next = new URLSearchParams(params)
                      next.set('operation', row.id)
                      next.set('kind', row.kind)
                      if (row.policy) next.set('policy', row.policy)
                      else next.delete('policy')
                      setParams(next)
                    }}
                  >
                    {row.id}
                  </Button>
                ),
              },
              {
                title: l('设备', 'Device'),
                render: (_, row) => (
                  <Link to={devicePath('endpoint', row.device)}>{row.device}</Link>
                ),
              },
              {
                title: l('类型', 'Kind'),
                render: (_, row) => <Status locale={locale} value={row.family ?? row.kind} />,
              },
              {
                title: l('状态', 'State'),
                render: (_, row) => <Status locale={locale} value={row.status} />,
              },
              { title: l('注册代次', 'Registration generation'), dataIndex: 'generation' },
              {
                title: l('截止时间', 'Deadline'),
                render: (_, row) => timestamp(locale, row.deadline),
              },
            ]}
          />
          <CursorControls
            locale={locale}
            query={query}
            onChange={changeQuery}
            next={read.value.nextCursor}
            count={read.value.items.length}
          />
        </>
      )}
      <TaskTrust runtime={runtime} locale={locale} />
      {reference && (
        <>
          <Space>
            <Button
              onClick={() => {
                const next = new URLSearchParams(params)
                next.delete('operation')
                next.delete('kind')
                next.delete('policy')
                setParams(next)
              }}
            >
              {l('关闭详情', 'Close detail')}
            </Button>
          </Space>
          <ExecutionFacts
            key={`${binding}/${reference.kind}/${reference.id}/${reference.policy ?? ''}`}
            runtime={runtime}
            locale={locale}
            reference={reference}
          />
        </>
      )}
    </div>
  )
}
