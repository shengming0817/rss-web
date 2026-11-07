import { executionPath } from './Executions'
import { Alert, Button, Card } from 'antd'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import type { Policy } from '@rss/mdm-policies'
import type { PoliciesUseCases } from './PolicyPreview'
import type { Locale } from './i18n'
import { firstPage, CursorControls, labels, ReadState, usePageRead, type Query } from './AdminUi'
import { Status, statusText, timestamp } from './DevicePresentation'
import { DataTable } from './DataTable'
import { devicePath } from './Devices'

export function PolicyAssignments({
  policies,
  policy,
  locale,
}: {
  policies: PoliciesUseCases
  policy: Policy
  locale: Locale
}) {
  const l = labels(locale),
    location = useLocation(),
    [params, setParams] = useSearchParams(),
    query: Query = {
      limit: 20,
      ...(params.get('assignmentCursor') ? { cursor: params.get('assignmentCursor')! } : {}),
    },
    read = usePageRead(`policy-assignments/${policy.id}/${JSON.stringify(query)}`, () =>
      policies.assignments(policy.id, query),
    )
  function setQuery(next: Query) {
    const value = new URLSearchParams(params)
    if (next.cursor) value.set('assignmentCursor', next.cursor)
    else value.delete('assignmentCursor')
    setParams(value, { replace: true })
  }
  return (
    <Card
      className="policy-assignments"
      title={l('当前设备分配资格', 'Current device assignment qualification')}
    >
      <Button onClick={read.reload}>{l('读取分配', 'Read assignments')}</Button>
      <ReadState
        locale={locale}
        busy={read.busy}
        error={read.error}
        empty={read.value?.items.length === 0}
      />
      <p className="subtitle">
        {l(
          '此为当前服务端投影；配置保存、范围资格与已发生的设备操作分别观察。无操作 ID 不表示成功或失败。',
          'This is the current server projection. Observe saved configuration, scope qualification and device operations separately. No operation ID does not mean success or failure.',
        )}
      </p>
      {read.value && (
        <>
          <DataTable
            locale={locale}
            rowKey={(row) => `${row.object.kind}/${row.object.id}`}
            dataSource={read.value.items}
            columns={[
              {
                title: l('设备', 'Device'),
                render: (_, row) => (
                  <>
                    <Link to={devicePath(row.object.kind, row.object.id)}>{row.object.id}</Link>
                    <p className="subtitle">
                      {row.channel
                        ? statusText(locale, row.channel)
                        : l('未知通道', 'Unknown channel')}
                    </p>
                    <details>
                      <summary>{l('注册坐标', 'Registration coordinates')}</summary>
                      {row.target ? `${row.target.registrationId} @${row.target.generation}` : '—'}
                    </details>
                  </>
                ),
              },
              {
                title: l('范围资格', 'Scope qualification'),
                render: (_, row) => (
                  <>
                    <Status locale={locale} value={row.qualification.state} />
                    <p>{statusText(locale, row.availability)}</p>
                    {row.reason && <p className="subtitle">{statusText(locale, row.reason)}</p>}
                  </>
                ),
              },
              {
                title: l('本轮准入', 'Current admission'),
                render: (_, row) => (
                  <>
                    {row.taskAdmission ? (
                      <>
                        <Status locale={locale} value={row.taskAdmission.state} />
                        {row.taskAdmission.stage ?? ''}
                      </>
                    ) : (
                      '—'
                    )}
                    <p className="subtitle">
                      {l('允许开始', 'Earliest allowed start')}:{' '}
                      {row.taskAdmission?.nextAllowedStartAt != null
                        ? timestamp(locale, row.taskAdmission.nextAllowedStartAt)
                        : l('未知 / 等待事件', 'Unknown / waiting for an event')}
                    </p>
                  </>
                ),
              },
              {
                title: l('原操作', 'Original operations'),
                render: (_, row) =>
                  row.execution.kind === 'restricted' ? (
                    l('无执行事实读取权限', 'Execution facts are restricted')
                  ) : row.execution.kind === 'operations' ? (
                    row.execution.operationIds.length ? (
                      row.execution.operationIds.map((id) => (
                        <p key={id}>
                          <Link
                            to={`/operations?${new URLSearchParams({ filter: `id=='${id}'`, returnTo: location.pathname + location.search })}`}
                          >
                            {id}
                          </Link>
                        </p>
                      ))
                    ) : (
                      l('尚无已受理操作', 'No accepted operation')
                    )
                  ) : (
                    <>
                      <p>
                        {l('最近运行', 'Latest run')}:{' '}
                        {row.execution.latestRun ? (
                          <Link
                            to={executionPath(
                              'action_run',
                              row.execution.latestRun.taskId,
                              policy.id,
                              location.pathname + location.search,
                            )}
                          >
                            {row.execution.latestRun.taskId} ·{' '}
                            {statusText(
                              locale,
                              row.execution.latestRun.state?.execution ??
                                row.execution.latestRun.nativeDelivery ??
                                'unknown',
                            )}
                          </Link>
                        ) : (
                          l('尚无历史运行', 'No historical run')
                        )}
                      </p>
                      <p>
                        {l('当前触发记录', 'Current trigger record')}:{' '}
                        {row.execution.currentRecord.state === 'unknown' ? (
                          l('未知', 'Unknown')
                        ) : row.execution.currentRecord.state === 'absent' ? (
                          l('已核对，尚无运行', 'Checked; no accepted run')
                        ) : (
                          <Link
                            to={executionPath(
                              'action_run',
                              row.execution.currentRecord.taskId,
                              policy.id,
                              location.pathname + location.search,
                            )}
                          >
                            {row.execution.currentRecord.taskId}
                          </Link>
                        )}
                      </p>
                    </>
                  ),
              },
              {
                title: l('来源与范围结果', 'Sources and scope result'),
                render: (_, row) => (
                  <details>
                    <summary>{l('查看来源', 'Inspect sources')}</summary>
                    <p>{row.scopeResult ?? '—'}</p>
                    {row.sources.map((source) => (
                      <p key={`${source.object.kind}/${source.object.id}`}>
                        {source.object.kind}/{source.object.id} · {source.associationVersion ?? '—'}{' '}
                        ·{' '}
                        {source.verified
                          ? l('已核实关联', 'Verified association')
                          : l('关联未核实', 'Unverified association')}{' '}
                        ·{' '}
                        {source.members
                          .map(
                            (member) =>
                              `${member.channel}/${member.registrationId}@${member.generation}`,
                          )
                          .join(' · ')}
                      </p>
                    ))}
                  </details>
                ),
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
export function PolicyRuns({
  policies,
  policy,
  locale,
}: {
  policies: PoliciesUseCases
  policy: Policy
  locale: Locale
}) {
  const l = labels(locale),
    location = useLocation(),
    [params, setParams] = useSearchParams(),
    query: Query = {
      limit: 20,
      ...(params.get('runCursor') ? { cursor: params.get('runCursor')! } : {}),
    },
    read = usePageRead(
      `policy-runs/${policy.id}/${JSON.stringify(query)}`,
      (signal) => policies.runs(policy.id, query, signal),
      { retryReadConflict: !query.cursor },
    )
  function setQuery(next: Query) {
    const value = new URLSearchParams(params)
    if (next.cursor) value.set('runCursor', next.cursor)
    else value.delete('runCursor')
    setParams(value, { replace: true })
  }
  return (
    <Card title={l('已发生的运行', 'Existing runs')}>
      <Button onClick={read.reload}>{l('读取运行', 'Read runs')}</Button>
      <ReadState
        locale={locale}
        busy={read.busy}
        error={read.error}
        empty={read.value?.items.length === 0}
        onRetry={read.reload}
        onRestart={() => (query.cursor ? setQuery(firstPage(query)) : read.reload())}
      />
      {read.value && (
        <>
          <DataTable
            locale={locale}
            rowKey="taskId"
            dataSource={read.value.items}
            columns={[
              {
                title: l('运行', 'Run'),
                render: (_, row) => (
                  <Link
                    to={executionPath(
                      'action_run',
                      row.taskId,
                      policy.id,
                      location.pathname + location.search,
                    )}
                  >
                    {row.taskId}
                  </Link>
                ),
              },
              {
                title: l('设备', 'Device'),
                render: (_, row) => (
                  <Link to={devicePath('endpoint', row.device)}>{row.device}</Link>
                ),
              },
              {
                title: l('投递', 'Delivery'),
                render: (_, row) => row.state?.delivery.kind ?? row.nativeDelivery ?? '—',
              },
              { title: l('执行', 'Execution'), render: (_, row) => row.state?.execution ?? '—' },
              { title: l('效果', 'Effect'), render: (_, row) => row.effect ?? '—' },
              {
                title: l('采集报告', 'Collection report'),
                render: (_, row) =>
                  row.report
                    ? `${row.report.result} · ${row.report.reason ?? '—'}${row.report.projectionPending ? l(' · 资产应用待完成', ' · asset projection pending') : ''}`
                    : '—',
              },
              {
                title: l('取消', 'Cancellation'),
                render: (_, row) => row.state?.cancellation ?? '—',
              },
              {
                title: l('注册与触发', 'Registration and occurrence'),
                render: (_, row) => `${row.registrationId}@${row.generation} · ${row.occurrence}`,
              },
              {
                title: l('可执行时间 / 截止时间（UTC 秒）', 'Available / deadline (UTC seconds)'),
                render: (_, row) => `${row.availableAt} / ${row.deadline}`,
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
export function PolicyRollout({
  policies,
  policy,
  locale,
}: {
  policies: PoliciesUseCases
  policy: Policy
  locale: Locale
}) {
  const l = labels(locale),
    read = usePageRead(`policy-rollout/${policy.id}`, () => policies.rollout(policy.id))
  return (
    <Card title={l('软件批次推进', 'Software rollout progress')}>
      <Button onClick={read.reload}>{l('读取灰度进度', 'Read rollout progress')}</Button>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      {read.value && (
        <>
          <p>
            {l('执行版本', 'Execution version')} · <code>{read.value.versionId}</code> ·{' '}
            {l('观察时间（UTC 秒）', 'Observed at (UTC seconds)')} {read.value.asOf}
          </p>
          {read.value.versionId !== policy.versionId && (
            <Alert
              type="warning"
              title={l(
                '服务端已推进到另一执行版本；请重新读取当前策略。',
                'The server has moved to another execution version. Re-read the policy.',
              )}
            />
          )}
          {read.value.paused && (
            <Alert
              type="warning"
              title={l(
                '已暂停后续准入；已有安装与证据保持。',
                'Further admission is paused; existing installations and evidence remain.',
              )}
            />
          )}
          <DataTable
            locale={locale}
            rowKey="scope"
            dataSource={read.value.stages}
            columns={[
              { title: l('阶段范围', 'Stage scope'), dataIndex: 'scope' },
              { title: l('开放时间（UTC 秒）', 'Opens at (UTC seconds)'), dataIndex: 'opensAt' },
              {
                title: l('当前状态', 'Current state'),
                render: (_, row) =>
                  !row.ready
                    ? l('统计未就绪', 'Statistics unavailable')
                    : row.open
                      ? l('已开放', 'Open')
                      : l('等待时间或成功门槛', 'Waiting for time or success gate'),
              },
              {
                title: l('上一批成功率要求', 'Preceding stage success requirement'),
                render: (_, row) =>
                  row.minimumVerifiedPercent === null
                    ? l('无门槛', 'No gate')
                    : `${row.minimumVerifiedPercent}%`,
              },
              {
                title: l('核实成功 / 当前目标', 'Verified success / targets'),
                render: (_, row) => `${row.verifiedSuccess} / ${row.totalTargets}`,
              },
              {
                title: l(
                  '未知 / 等待用户 / 等待重启 / 失败',
                  'Unknown / waiting user / waiting reboot / failed',
                ),
                render: (_, row) =>
                  `${row.unknown} / ${row.waitingUser} / ${row.waitingReboot} / ${row.failed}`,
              },
            ]}
          />
        </>
      )}
    </Card>
  )
}
