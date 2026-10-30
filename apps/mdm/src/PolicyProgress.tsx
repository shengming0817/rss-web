import { useState } from 'react'
import { Alert, Button, Card } from 'antd'
import { Link } from 'react-router-dom'
import type { Policy } from '@rss/mdm-policies'
import type { PoliciesUseCases } from './PolicyPreview'
import type { Locale } from './i18n'
import { CursorControls, labels, ReadState, useRead, type Query } from './AdminUi'
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
    [query, setQuery] = useState<Query>({ limit: 20 }),
    read = useRead(`policy-assignments/${policy.id}/${JSON.stringify(query)}`, () =>
      policies.assignments(policy.id, query),
    )
  return (
    <Card title={l('当前设备分配资格', 'Current device assignment qualification')}>
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
                  <Link to={devicePath(row.object.kind, row.object.id)}>{row.object.id}</Link>
                ),
              },
              { title: l('通道', 'Channel'), dataIndex: 'channel' },
              {
                title: l('范围资格', 'Scope qualification'),
                render: (_, row) => row.qualification.state,
              },
              {
                title: l('通道可用性', 'Channel availability'),
                render: (_, row) => `${row.availability} · ${row.reason ?? '—'}`,
              },
              {
                title: l('本轮准入', 'Current admission'),
                render: (_, row) =>
                  row.taskAdmission
                    ? `${row.taskAdmission.state} · ${row.taskAdmission.stage ?? '—'}`
                    : '—',
              },
              {
                title: l('注册坐标', 'Registration coordinates'),
                render: (_, row) =>
                  row.target ? `${row.target.registrationId} @${row.target.generation}` : '—',
              },
              {
                title: l('来源与范围结果', 'Sources and scope result'),
                render: (_, row) => (
                  <details>
                    <summary>{row.scopeResult ?? '—'}</summary>
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
              {
                title: l('原操作', 'Original operations'),
                render: (_, row) =>
                  row.operationIds.join(' · ') ||
                  l('本轮尚无已受理操作', 'No accepted operation in this projection'),
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
    [query, setQuery] = useState<Query>({ limit: 20 }),
    read = useRead(`policy-runs/${policy.id}/${JSON.stringify(query)}`, () =>
      policies.runs(policy.id, query),
    )
  return (
    <Card title={l('已发生的运行', 'Existing runs')}>
      <Button onClick={read.reload}>{l('读取运行', 'Read runs')}</Button>
      <ReadState
        locale={locale}
        busy={read.busy}
        error={read.error}
        empty={read.value?.items.length === 0}
      />
      {read.value && (
        <>
          <DataTable
            locale={locale}
            rowKey="taskId"
            dataSource={read.value.items}
            columns={[
              { title: l('运行', 'Run'), dataIndex: 'taskId' },
              {
                title: l('设备', 'Device'),
                render: (_, row) => (
                  <Link to={devicePath('endpoint', row.device)}>{row.device}</Link>
                ),
              },
              { title: l('投递', 'Delivery'), render: (_, row) => row.state.delivery.kind },
              { title: l('执行', 'Execution'), render: (_, row) => row.state.execution },
              { title: l('效果', 'Effect'), dataIndex: 'effect' },
              { title: l('取消', 'Cancellation'), render: (_, row) => row.state.cancellation },
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
    read = useRead(`policy-rollout/${policy.id}`, () => policies.rollout(policy.id))
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
