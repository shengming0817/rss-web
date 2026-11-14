import { useState } from 'react'
import { Alert, Button, Descriptions, Empty, Space } from 'antd'
import { Link } from 'react-router-dom'
import type { Component } from '@rss/mdm-runtime-diagnostics'
import { queueText } from '@rss/mdm-runtime-diagnostics'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Heading, labels, ReadState, usePageRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { SetupStatus } from './SetupStatus'
import { setupName } from './setup-presentation'
export function Diagnostics({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { diagnostics, authorization, binding } = useAdministration(runtime),
    [refresh, setRefresh] = useState(0),
    permission = usePageRead(
      `${binding}/diagnostic-permission/${refresh}`,
      authorization.effective,
    ),
    allowed =
      !permission.busy &&
      !permission.error &&
      permission.value?.grants.some(
        (g) => g.scope.kind === 'tenant' && g.operation === 'runtime_diagnostics_read',
      ),
    snapshot = usePageRead(`${binding}/diagnostic/${refresh}/${!!allowed}`, async () =>
      allowed
        ? {
            value: await diagnostics.snapshot(),
            readAt: new Date().toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US'),
          }
        : null,
    ),
    current = allowed ? snapshot.value : undefined,
    prefix = runtime.management ? '/platform' : ''
  return (
    <div className="admin-stack diagnostics-page">
      <Heading
        title={l('运行诊断', 'Runtime diagnostics')}
        hint={l(
          '查看实际组件与通道的当前观察。进程存活、准入就绪、任务执行与健康分别表达。',
          'Inspect current component and channel observations. Process liveness, readiness, task execution and health are separate facts.',
        )}
        actions={
          <Button onClick={() => setRefresh((v) => v + 1)}>
            {l('刷新当前观察', 'Refresh observations')}
          </Button>
        }
      />
      <Space wrap>
        <Link to={`${prefix}/settings`}>{l('设置', 'Settings')}</Link>
        {!runtime.management && <Link to="/setup">{l('租户初始化', 'Tenant setup')}</Link>}
      </Space>
      <ReadState locale={locale} busy={permission.busy} error={permission.error} />
      {!allowed && !permission.busy && !permission.error && (
        <Alert
          type="info"
          title={l(
            '当前账户没有运行诊断读取权限。',
            'This account cannot read runtime diagnostics.',
          )}
        />
      )}
      {allowed && <ReadState locale={locale} busy={snapshot.busy} error={snapshot.error} />}
      {current && (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2>{l('进程与准入', 'Process and readiness')}</h2>
              <span className="subtitle">
                {l('浏览器读取时间', 'Browser read time')}: {current.readAt}
              </span>
            </div>
            <div className="panel-body">
              <Descriptions
                column={1}
                items={[
                  {
                    key: 'alive',
                    label: l('进程存活', 'Process alive'),
                    children: current.value.alive ? l('是', 'Yes') : l('否', 'No'),
                  },
                  {
                    key: 'ready',
                    label: l('准入就绪', 'Readiness'),
                    children: (
                      <SetupStatus
                        locale={locale}
                        value={current.value.ready ? 'ready' : 'not_ready'}
                      />
                    ),
                  },
                ]}
              />
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>{l('通道与加载材料', 'Channels and loaded materials')}</h2>
            </div>
            <DataTable
              locale={locale}
              dataSource={current.value.channels}
              rowKey="name"
              columns={[
                { title: l('通道', 'Channel'), dataIndex: 'name' },
                {
                  title: l('状态', 'State'),
                  render: (_, r) => <SetupStatus locale={locale} value={r.state} />,
                },
                {
                  title: l('已挂载', 'Mounted'),
                  render: (_, r) => (r.mounted ? l('是', 'Yes') : l('否', 'No')),
                },
                {
                  title: l('已加载版本', 'Loaded revisions'),
                  render: (_, r) =>
                    Object.entries(r.loadedMaterials).length
                      ? Object.entries(r.loadedMaterials).map(([key, version]) => (
                          <div key={key}>
                            {key} · {version}
                          </div>
                        ))
                      : '—',
                },
                { title: l('原因', 'Reasons'), render: (_, r) => r.reasons.join(', ') || '—' },
              ]}
            />
          </section>
          {current.value.firstUse && (
            <section className="panel">
              <div className="panel-head">
                <h2>{l('首次使用意图', 'First-use intent')}</h2>
              </div>
              <div className="panel-body">
                {current.value.firstUse.access === 'available' ? (
                  <>
                    <p>
                      {l('修订', 'Revision')} · {current.value.firstUse.summary.revision} ·{' '}
                      {l('已完成意图', 'Completion intent')} ·{' '}
                      {String(current.value.firstUse.summary.complete)} ·{' '}
                      {l('当前可完成', 'Can complete now')} ·{' '}
                      {String(current.value.firstUse.summary.canComplete)}
                    </p>
                    {current.value.firstUse.summary.steps.map((step) => (
                      <p key={step.id}>
                        {setupName(locale, step.id)} ·{' '}
                        <SetupStatus locale={locale} value={step.status} />
                      </p>
                    ))}
                  </>
                ) : (
                  <SetupStatus locale={locale} value={current.value.firstUse.access} />
                )}
              </div>
            </section>
          )}
          <section className="panel">
            <div className="panel-head">
              <h2>{l('实际组件', 'Actual components')}</h2>
            </div>
            <DataTable
              locale={locale}
              dataSource={current.value.components}
              rowKey="name"
              columns={[
                { title: l('所属模块', 'Owner'), render: (_, r) => setupName(locale, r.name) },
                {
                  title: l('就绪', 'Readiness'),
                  render: (_, r) => <SetupStatus locale={locale} value={r.readiness} />,
                },
                {
                  title: l('健康', 'Health'),
                  render: (_, r) => <SetupStatus locale={locale} value={r.health} />,
                },
                {
                  title: l('任务', 'Task'),
                  render: (_, r) => (r.task ? <SetupStatus locale={locale} value={r.task} /> : '—'),
                },
              ]}
            />
          </section>
          {!current.value.components.length && (
            <Empty
              description={l(
                '没有组件观察，不能推断正常。',
                'No component observations; health cannot be inferred.',
              )}
            />
          )}
          {current.value.components.map((c) => (
            <ComponentDetail key={c.name} component={c} locale={locale} />
          ))}
        </>
      )}
    </div>
  )
}
function ComponentDetail({ component: c, locale }: { component: Component; locale: Locale }) {
  const l = labels(locale)
  return (
    <section className="panel" data-diagnostic-owner={c.name}>
      <div className="panel-head">
        <h2>{setupName(locale, c.name)}</h2>
        <SetupStatus locale={locale} value={c.health} />
      </div>
      <div className="panel-body admin-stack">
        <p>
          {l('已挂载', 'Mounted')} · {l(c.mounted ? '是' : '否', c.mounted ? 'Yes' : 'No')}
        </p>
        {c.phases.map((phase) => (
          <p key={phase.name}>
            {phase.name} · <SetupStatus locale={locale} value={phase.state} /> {phase.reason ?? ''}
          </p>
        ))}
        {c.dispatch && (
          <p>
            {l('分发位置 / 窗口开放', 'Dispatch position / window open')} · {c.dispatch.eventAfter}{' '}
            / {String(c.dispatch.windowOpen)}
          </p>
        )}
        {c.runner?.scan && (
          <p>
            {l('最近扫描', 'Latest scan')} · {String(c.runner.scan.successful)} ·{' '}
            {c.runner.scan.reason ?? '—'} · {c.runner.scan.observedAt ?? '—'}
          </p>
        )}
        {c.reasons.length > 0 && (
          <p>
            {l('原因', 'Reasons')}: {c.reasons.join(', ')}
          </p>
        )}
        {c.dependencies.length > 0 && (
          <div>
            <h2>{l('依赖', 'Dependencies')}</h2>
            {c.dependencies.map((d) => (
              <div key={d.name}>
                {d.name} · <SetupStatus locale={locale} value={d.state} />
              </div>
            ))}
          </div>
        )}
        {c.queues.length > 0 && (
          <div>
            <h2>{l('队列', 'Queues')}</h2>
            {c.queues.map((q) => (
              <p key={q.name}>
                {q.name} · {queueText(q)}
                {q.count === null &&
                  ` · ${l('未观察，不表示零积压', 'Unobserved; does not mean zero backlog')}`}
                {q.count !== null &&
                  q.truncated === null &&
                  ` · ${l('完整性未知', 'Completeness unknown')}`}
              </p>
            ))}
          </div>
        )}
        {c.progress && (
          <>
            <Descriptions
              size="small"
              column={1}
              items={[
                {
                  key: 'state',
                  label: l('进度', 'Progress'),
                  children: <SetupStatus locale={locale} value={c.progress.state} />,
                },
                {
                  key: 'position',
                  label: l('确认位置 / 来源位置', 'Confirmed position / source head'),
                  children: `${c.progress.confirmedPosition ?? '—'} / ${c.progress.sourceHead ?? '—'}`,
                },
                {
                  key: 'lagging',
                  label: l('坐标落后', 'Coordinate lag'),
                  children:
                    c.progress.lagging === null
                      ? l('未知', 'Unknown')
                      : c.progress.lagging
                        ? l('是', 'Yes')
                        : l('否', 'No'),
                },
                {
                  key: 'ages',
                  label: l(
                    '调用 / 完成扫描 / 来源观察年龄（毫秒）',
                    'Invocation / completed pass / source observation age (ms)',
                  ),
                  children: `${c.progress.invocationAgeMs ?? '—'} / ${c.progress.completedPassAgeMs ?? '—'} / ${c.progress.sourceObservationAgeMs ?? '—'}`,
                },
                {
                  key: 'applied',
                  label: l('本轮应用数量', 'Applied in pass'),
                  children: c.progress.applied ?? '—',
                },
              ]}
            />
            <p className="subtitle">
              {l(
                '位置差异不是事件数量，也不是原子快照。',
                'Coordinate differences are not event counts or an atomic snapshot.',
              )}
            </p>
          </>
        )}
        {c.runner && (
          <Descriptions
            size="small"
            column={1}
            items={[
              {
                key: 'unresolved',
                label: l('未结算尝试', 'Unresolved attempts'),
                children: `${c.runner.truncated ? '≥' : ''}${c.runner.unresolvedAttempts}`,
              },
              {
                key: 'failure',
                label: l('最近失败', 'Latest failure'),
                children: c.runner.latestFailure
                  ? `${c.runner.latestFailure.stage}: ${c.runner.latestFailure.reason} · ${c.runner.latestFailure.observedAt ?? '—'}`
                  : l('未观察', 'Unobserved'),
              },
            ]}
          />
        )}
        {!c.queues.length &&
          !c.dependencies.length &&
          !c.progress &&
          !c.runner &&
          !c.reasons.length && (
            <p className="subtitle">{l('没有附加观察。', 'No additional observations.')}</p>
          )}
      </div>
    </section>
  )
}
