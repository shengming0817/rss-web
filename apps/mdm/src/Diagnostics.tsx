import { useState } from 'react'
import { Alert, Button, Descriptions, Empty, Space } from 'antd'
import { Link } from 'react-router-dom'
import type { Component } from '@rss/mdm-runtime-diagnostics'
import { queueText } from '@rss/mdm-runtime-diagnostics'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { codeOf, Heading, labels, ReadState, usePageRead } from './AdminUi'
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
      {allowed &&
        (codeOf(snapshot.error) === 'diagnostics_contract_unavailable' ? (
          <Alert
            type="warning"
            showIcon
            title={l(
              '按组件所属模块拆分的诊断尚未就绪',
              'Diagnostics by component owner are not yet available',
            )}
            description={l(
              '后端仍提供旧聚合，当前无法确认各模块健康。后端缺口 #3140；不会将缺失观察显示为正常。',
              'The backend still exposes the old aggregate. Individual owner health cannot be confirmed. Tracked in #3140; missing observations are not shown as healthy.',
            )}
          />
        ) : (
          <ReadState locale={locale} busy={snapshot.busy} error={snapshot.error} />
        ))}
      {current && (
        <>
          {current.value.source === 'mock' && (
            <Alert
              type="warning"
              showIcon
              title={l('模拟诊断 · 仅验证界面', 'Mock diagnostics · UI validation only')}
              description={l(
                '以下数据来自显式模拟场景，不代表后端、外部服务或设备的实际状态。',
                'These observations come from an explicit mock scenario and do not represent backend, provider or device health.',
              )}
            />
          )}
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
          <section className="panel">
            <div className="panel-head">
              <h2>{l('实际组件', 'Actual components')}</h2>
            </div>
            <DataTable
              locale={locale}
              dataSource={current.value.components}
              rowKey="owner"
              columns={[
                { title: l('所属模块', 'Owner'), render: (_, r) => setupName(locale, r.owner) },
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
            <ComponentDetail key={c.owner} component={c} locale={locale} />
          ))}
        </>
      )}
    </div>
  )
}
function ComponentDetail({ component: c, locale }: { component: Component; locale: Locale }) {
  const l = labels(locale)
  return (
    <section className="panel" data-diagnostic-owner={c.owner}>
      <div className="panel-head">
        <h2>{setupName(locale, c.owner)}</h2>
        <SetupStatus locale={locale} value={c.health} />
      </div>
      <div className="panel-body admin-stack">
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
        {c.recovery && (
          <Descriptions
            size="small"
            column={1}
            items={[
              {
                key: 'unresolved',
                label: l('未结算尝试', 'Unresolved attempts'),
                children: `${c.recovery.truncated ? '≥' : ''}${c.recovery.unresolvedAttempts}`,
              },
              {
                key: 'failure',
                label: l('最近失败', 'Latest failure'),
                children: c.recovery.lastFailure ?? l('未观察', 'Unobserved'),
              },
            ]}
          />
        )}
        {!c.queues.length &&
          !c.dependencies.length &&
          !c.progress &&
          !c.recovery &&
          !c.reasons.length && (
            <p className="subtitle">{l('没有附加观察。', 'No additional observations.')}</p>
          )}
      </div>
    </section>
  )
}
