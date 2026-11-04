import { useEffect, useState } from 'react'
import { Alert, Button, Card, Form, Input, Space } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { CursorControls, Heading, labels, ReadState, usePageRead, type Query } from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { devicePath } from './Devices'
export function deviceAccessPath(device: string) {
  return `/device-access?${new URLSearchParams({ device })}`
}
function Bindings({
  runtime,
  locale,
  device,
}: {
  runtime: Runtime
  locale: Locale
  device: string
}) {
  const l = labels(locale),
    { deviceAccess, binding } = useAdministration(runtime),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    [original, setOriginal] = useState(''),
    [operation, setOperation] = useState(''),
    read = usePageRead(`${binding}/access/${device}/${JSON.stringify(query)}`, () =>
      deviceAccess.bindings(device, query),
    ),
    receipt = usePageRead(`${binding}/access-receipt/${device}/${operation}`, () =>
      operation ? deviceAccess.operation(device, operation) : Promise.resolve(null),
    )
  return (
    <Card title={l('设备账户绑定', 'Device account bindings')}>
      <Space>
        <Link to={devicePath('endpoint', device)}>{l('返回设备', 'Back to device')}</Link>
        <Button onClick={read.reload}>{l('刷新绑定', 'Refresh bindings')}</Button>
      </Space>
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
            rowKey="id"
            dataSource={read.value.items}
            columns={[
              { title: l('绑定', 'Binding'), dataIndex: 'id' },
              { title: l('服务端状态', 'Server state'), dataIndex: 'serverState' },
              {
                title: l('绑定 / 因子代次', 'Binding / factor generation'),
                render: (_, row) => `${row.bindingGeneration} / ${row.factorGeneration}`,
              },
              {
                title: l('注册 / 代次', 'Registration / generation'),
                render: (_, row) => `${row.registration} @${row.registrationGeneration}`,
              },
              {
                title: l('期望 / 接收 / 应用版本', 'Desired / received / applied revision'),
                render: (_, row) =>
                  `${row.revision} / ${row.receivedRevision ?? '—'} / ${row.appliedRevision ?? '—'}`,
              },
              {
                title: l('效果回执', 'Effect receipt'),
                render: (_, row) => row.effect ?? l('未知', 'Unknown'),
              },
              {
                title: l('原策略', 'Original policy'),
                render: (_, row) => (
                  <Link to={`/policies?${new URLSearchParams({ policy: row.policy })}`}>
                    {row.policy}
                  </Link>
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
      <Form
        className="admin-toolbar"
        layout="inline"
        onFinish={() => {
          setOperation(original)
          if (operation === original) receipt.reload()
        }}
      >
        <Form.Item label={l('原绑定操作 ID', 'Original binding operation ID')}>
          <Input
            aria-label={l('原绑定操作 ID', 'Original binding operation ID')}
            value={original}
            maxLength={36}
            onChange={(e) => setOriginal(e.target.value)}
          />
        </Form.Item>
        <Button htmlType="submit">{l('查询当次快照', 'Read original snapshot')}</Button>
      </Form>
      {operation && (
        <>
          <ReadState locale={locale} busy={receipt.busy} error={receipt.error} />
          {receipt.value && (
            <p>
              {l('原回执', 'Original receipt')}: {receipt.value.operationId} · {receipt.value.id} ·{' '}
              {receipt.value.serverState} · {receipt.value.effect ?? l('未知', 'Unknown')} ·{' '}
              {l('版本', 'Revision')} {receipt.value.revision}
            </p>
          )}
        </>
      )}
      <Alert
        type="info"
        showIcon
        title={l(
          '绑定受理、设备接收、应用与因子就绪分别观察。原回执是当次快照。',
          'Observe binding admission, device receipt, application and factor readiness separately. Original receipts are snapshots.',
        )}
      />
    </Card>
  )
}
export function DeviceAccess({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { deviceAccess, binding } = useAdministration(runtime),
    [params, setParams] = useSearchParams(),
    device = params.get('device') ?? '',
    [draft, setDraft] = useState(device),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    read = usePageRead(`${binding}/enterprise/${JSON.stringify(query)}`, () =>
      deviceAccess.enterprise(query),
    )
  useEffect(() => setDraft(device), [device])
  return (
    <div className="device-access-page">
      <Heading
        title="Device Access"
        hint={l(
          '查看设备接入与账户绑定，核对企业配置事实。',
          'Inspect device access, account bindings and enterprise configuration facts.',
        )}
      />
      <Form
        className="admin-toolbar"
        layout="inline"
        onFinish={() => setParams(draft ? { device: draft } : {})}
      >
        <Form.Item label={l('精确设备 ID', 'Exact device ID')}>
          <Input
            aria-label={l('精确设备 ID', 'Exact device ID')}
            value={draft}
            maxLength={512}
            onChange={(e) => setDraft(e.target.value)}
          />
        </Form.Item>
        <Button htmlType="submit">{l('查看设备绑定', 'Read device bindings')}</Button>
      </Form>
      {device && (
        <Bindings key={`${binding}/${device}`} runtime={runtime} locale={locale} device={device} />
      )}
      <Card title={l('企业配置目录', 'Enterprise configuration directory')}>
        <Button onClick={read.reload}>{l('刷新目录', 'Refresh directory')}</Button>
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
              rowKey="id"
              dataSource={read.value.items}
              columns={[
                { title: l('配置', 'Configuration'), dataIndex: 'id' },
                { title: l('类型', 'Kind'), dataIndex: 'kind' },
                { title: l('版本', 'Revision'), dataIndex: 'revision' },
                {
                  title: l('启用', 'Enabled'),
                  render: (_, row) =>
                    row.enabled === null ? '—' : row.enabled ? l('是', 'Yes') : l('否', 'No'),
                },
                { title: l('目标引用', 'Target reference'), dataIndex: 'reference' },
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
    </div>
  )
}
