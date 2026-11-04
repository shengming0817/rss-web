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
import { timestamp, Status } from './DevicePresentation'
export function executionPath(kind: 'command' | 'action_run', id: string, policy?: string) {
  return `/operations?${new URLSearchParams({ kind, operation: id, ...(policy ? { policy } : {}) })}`
}
export function deviceExecutionsPath(device: string) {
  const literal = `'${device.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
  return `/operations?${new URLSearchParams({ filter: `device==${literal}` })}`
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
    { execution, binding } = useAdministration(runtime),
    read = usePageRead(
      `${binding}/execution/${reference.kind}/${reference.id}/${reference.policy ?? ''}`,
      () => execution.detail(reference),
    )
  return (
    <Card title={l('原操作与结果', 'Original operation and result')}>
      <ReadState locale={locale} busy={read.busy} error={read.error} empty={read.value === null} />
      <Button onClick={read.reload}>{l('重新查询原操作', 'Read original operation again')}</Button>
      {read.value && (
        <>
          <dl className="device-facts">
            <div>
              <dt>{l('操作', 'Operation')}</dt>
              <dd>{read.value.detail.id}</dd>
            </div>
            <div>
              <dt>{l('设备', 'Device')}</dt>
              <dd>
                <Link to={devicePath('endpoint', read.value.detail.device)}>
                  {read.value.detail.device}
                </Link>
              </dd>
            </div>
            <div>
              <dt>{l('执行注册 / 代次', 'Execution registration / generation')}</dt>
              <dd>
                {read.value.detail.registrationId ?? read.value.item?.registrationId ?? '—'} @
                {read.value.detail.generation ?? read.value.item?.generation ?? '—'}
              </dd>
            </div>
            <div>
              <dt>{l('原策略', 'Original policy')}</dt>
              <dd>
                {read.value.policy ? (
                  <Link to={`/policies?${new URLSearchParams({ policy: read.value.policy })}`}>
                    {read.value.policy}
                  </Link>
                ) : (
                  l('直接操作', 'Direct operation')
                )}
              </dd>
            </div>
            <div>
              <dt>{l('投递 / 命令状态', 'Delivery / command state')}</dt>
              <dd>{read.value.detail.delivery}</dd>
            </div>
            <div>
              <dt>{l('设备执行', 'Device execution')}</dt>
              <dd>
                {read.value.detail.execution ??
                  l('无独立执行回执', 'No separate execution receipt')}
              </dd>
            </div>
            <div>
              <dt>{l('效果证据', 'Effect evidence')}</dt>
              <dd>
                {read.value.detail.effect ??
                  l('未提供独立效果投影', 'No separate effect projection provided')}
              </dd>
            </div>
            <div>
              <dt>{l('取消', 'Cancellation')}</dt>
              <dd>{read.value.detail.cancellation ?? '—'}</dd>
            </div>
            <div>
              <dt>{l('当前尝试', 'Current attempt')}</dt>
              <dd>{read.value.detail.attempt ?? '—'}</dd>
            </div>
            <div>
              <dt>{l('执行授权 / 来源', 'Execution authorization / source')}</dt>
              <dd>{read.value.detail.authorization ?? l('未提供', 'Not provided')}</dd>
            </div>
            <div>
              <dt>{l('截止时间', 'Deadline')}</dt>
              <dd>{timestamp(locale, read.value.detail.deadline)}</dd>
            </div>
          </dl>
          <Alert
            type="info"
            showIcon
            title={l(
              '命令受理、投递、设备回执与实际效果分别观察。无回执保持未知。',
              'Observe admission, delivery, device receipts and actual effects separately. Missing receipts remain unknown.',
            )}
          />
        </>
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
    read = usePageRead(`${binding}/executions/${JSON.stringify(query)}`, () =>
      execution.list(query),
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
    setParams(
      new URLSearchParams({
        ...(next.filter ? { filter: next.filter } : {}),
        ...(next.cursor ? { cursor: next.cursor } : {}),
      }),
    )
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
      <p className="subtitle">
        {l(
          '此目录展示后端已支持的执行类型；脚本与采集的完整历史请从原策略读取。',
          'This directory shows execution families supported by the server. Read complete script and collection history from the original policy.',
        )}
      </p>
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
        <Button onClick={read.reload}>{l('刷新', 'Refresh')}</Button>
      </Form>
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
              { title: l('类型', 'Kind'), dataIndex: 'kind' },
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
