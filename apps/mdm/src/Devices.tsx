import { useDirectoryQuery } from './directory-location'
import { useState } from 'react'
import { Alert, Button, Card, Collapse, Modal, Tabs } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import type { Association, EndpointRow, ViewRow } from '@rss/mdm-devices'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import {
  CursorControls,
  DirectoryControls,
  Heading,
  labels,
  ReadState,
  directoryQuery,
  firstPage,
  type Query,
  useRead,
} from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { deviceName, Status, timestamp } from './DevicePresentation'

const viewFields = ['key', 'reference', 'association', 'endpoints'] as const,
  endpointFields = [
    'id',
    'status',
    'registeredAt',
    'channel',
    'source',
    'platform',
    'lastCommunicationReceivedAt',
    'enrollment',
    'inventoryAvailable',
  ] as const,
  associationFields = ['id', 'version', 'confirmedAt', 'association'] as const

export function devicePath(kind: 'endpoint' | 'association', id: string): string {
  return `/devices/${kind}/${encodeURIComponent(id)}`
}
function ViewDirectory({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { devices, binding } = useAdministration(runtime),
    [query, setQuery] = useDirectoryQuery('devices.', { limit: 20 })
  const read = useRead(
      `${binding}/views/${JSON.stringify(query)}`,
      (signal) =>
        devices.views(
          {
            ...directoryQuery(query, viewFields),
            filter: query.filter ?? "assetState=='active'",
          },
          signal,
        ),
      { retryReadConflict: !query.cursor },
    ),
    stats = useRead(
      `${binding}/view-statistics/${query.filter ?? ''}`,
      (signal) => devices.viewStatistics(query.filter, signal),
      { retryReadConflict: true },
    )
  const columns = query.fields ?? viewFields
  return (
    <>
      <div className="device-metrics">
        <Card>
          <span>{l('设备视图', 'Device views')}</span>
          <strong>{stats.value?.statistics.deviceViewCount ?? '—'}</strong>
        </Card>
        <Card>
          <span>{l('独立终端', 'Distinct endpoints')}</span>
          <strong>{stats.value?.statistics.endpointCount ?? '—'}</strong>
        </Card>
        <p className="subtitle">
          {l('服务端统计时间', 'Server statistics as of')} · {timestamp(locale, stats.value?.asOf)}
        </p>
      </div>
      <ReadState busy={stats.busy} error={stats.error} locale={locale} onRetry={stats.reload} />
      <DirectoryControls
        catalog="devices"
        key={query.filter ?? ''}
        locale={locale}
        query={query}
        onChange={setQuery}
        fields={viewFields}
        sort={['key']}
        required="key"
        maximum={100}
      />
      <ReadState
        busy={read.busy}
        error={read.error}
        locale={locale}
        onRetry={read.reload}
        onRestart={() => (query.cursor ? setQuery(firstPage(query)) : read.reload())}
      />
      {read.value && (
        <>
          <DataTable<ViewRow>
            locale={locale}
            dataSource={read.value.items}
            rowKey="key"
            columns={[
              {
                title: l('设备', 'Device'),
                dataIndex: 'key',
                render: (_, row) => (
                  <div>
                    {row.reference ? (
                      <Link to={devicePath(row.reference.kind, row.reference.id)}>
                        {deviceName(row.endpoints?.[0]?.displayName, row.key)}
                      </Link>
                    ) : (
                      row.key
                    )}
                    <div className="subtitle">{row.key}</div>
                  </div>
                ),
              },
              ...(columns.includes('association')
                ? [
                    {
                      title: l('关联状态', 'Association'),
                      dataIndex: 'association' as const,
                      render: (_: unknown, row: ViewRow) =>
                        row.association ? (
                          <Status value={row.association.state} locale={locale} />
                        ) : (
                          l('独立终端', 'Single endpoint')
                        ),
                    },
                  ]
                : []),
              ...(columns.includes('endpoints')
                ? [
                    {
                      title: l('终端与通道', 'Endpoints and channels'),
                      dataIndex: 'endpoints' as const,
                      render: (_: unknown, row: ViewRow) =>
                        row.endpoints?.map((endpoint) => (
                          <div key={endpoint.id}>
                            <Link to={devicePath('endpoint', endpoint.id)}>{endpoint.id}</Link> ·{' '}
                            <Status value={endpoint.status} locale={locale} />
                            <br />
                            {endpoint.platform.values.join(' / ') ||
                              l('平台未知', 'Platform unknown')}{' '}
                            {endpoint.platform.state === 'conflict' && (
                              <Status value="conflict" locale={locale} />
                            )}{' '}
                            · {endpoint.channel ?? '—'}
                          </div>
                        )),
                    },
                  ]
                : []),
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
    </>
  )
}
function EndpointDirectory({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { devices, binding } = useAdministration(runtime),
    [query, setQuery] = useDirectoryQuery('endpoints.'),
    read = useRead(
      `${binding}/endpoints/${JSON.stringify(query)}`,
      (signal) => devices.endpoints(directoryQuery(query, endpointFields), signal),
      { retryReadConflict: !query.cursor },
    ),
    stats = useRead(
      `${binding}/endpoint-statistics/${query.filter ?? ''}`,
      (signal) => devices.endpointStatistics(query.filter, signal),
      { retryReadConflict: true },
    )
  const selected = query.fields ?? endpointFields
  return (
    <>
      <p className="subtitle">
        {l(
          '每行是一个真实终端身份；MDM 与 Agent 关联不会改变它。最后通信不等于在线。',
          'Each row is a real endpoint identity, retained after MDM/Agent association. Last communication does not imply online status.',
        )}
      </p>
      {stats.value && (
        <p>
          {l('总数', 'Total')} {stats.value.statistics.total} · {l('有效', 'Active')}{' '}
          {stats.value.statistics.active} · {l('待处理', 'Pending')}{' '}
          {stats.value.statistics.pending} · {l('已撤销', 'Revoked')}{' '}
          {stats.value.statistics.revoked}
        </p>
      )}
      <ReadState busy={stats.busy} error={stats.error} locale={locale} onRetry={stats.reload} />
      <DirectoryControls
        catalog="endpoints"
        locale={locale}
        query={query}
        onChange={setQuery}
        fields={endpointFields}
        sort={['id', 'status']}
        maximum={1000}
      />
      <Button
        onClick={() => {
          read.reload()
          stats.reload()
        }}
      >
        {l('重新读取终端', 'Read endpoints again')}
      </Button>
      <ReadState
        busy={read.busy}
        error={read.error}
        locale={locale}
        onRetry={read.reload}
        onRestart={() => (query.cursor ? setQuery(firstPage(query)) : read.reload())}
      />
      {read.value && (
        <>
          <DataTable<EndpointRow>
            locale={locale}
            dataSource={read.value.items}
            rowKey="id"
            columns={[
              {
                title: l('终端标识', 'Endpoint'),
                dataIndex: 'id',
                render: (_, row) => <Link to={devicePath('endpoint', row.id)}>{row.id}</Link>,
              },
              ...(selected.includes('status')
                ? [
                    {
                      title: l('状态', 'State'),
                      dataIndex: 'status' as const,
                      render: (_: unknown, row: EndpointRow) =>
                        row.status && <Status locale={locale} value={row.status} />,
                    },
                  ]
                : []),
              ...(selected.includes('channel')
                ? [{ title: l('通道', 'Channel'), dataIndex: 'channel' as const }]
                : []),
              ...(selected.includes('source')
                ? [{ title: l('来源', 'Source'), dataIndex: 'source' as const }]
                : []),
              ...(selected.includes('registeredAt')
                ? [
                    {
                      title: l('首次注册时间', 'First enrollment'),
                      render: (_: unknown, row: EndpointRow) => timestamp(locale, row.registeredAt),
                    },
                  ]
                : []),
              ...(selected.includes('lastCommunicationReceivedAt')
                ? [
                    {
                      title: l('最近通信', 'Last communication'),
                      render: (_: unknown, row: EndpointRow) =>
                        timestamp(locale, row.lastCommunicationReceivedAt),
                    },
                  ]
                : []),
              ...(selected.includes('enrollment')
                ? [
                    {
                      title: l('注册申请', 'Enrollment request'),
                      render: (_: unknown, row: EndpointRow) => row.enrollment?.enrollmentId ?? '—',
                    },
                  ]
                : []),
              ...(selected.includes('inventoryAvailable')
                ? [
                    {
                      title: l('资产数据', 'Inventory'),
                      dataIndex: 'inventoryAvailable' as const,
                      render: (value: unknown) =>
                        value === true
                          ? l('可读取', 'Readable')
                          : value === false
                            ? l('不可读取', 'Unavailable')
                            : l('未提供', 'Not provided'),
                    },
                  ]
                : []),
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
    </>
  )
}
function Relationships({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { devices, binding } = useAdministration(runtime),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    [historyQuery, setHistoryQuery] = useState<Query>({ limit: 20 }),
    [selected, setSelected] = useState<string>(),
    read = useRead(
      `${binding}/associations/${JSON.stringify(query)}`,
      (signal) => devices.associations(directoryQuery(query, associationFields), signal),
      { retryReadConflict: !query.cursor },
    ),
    history = useRead(
      `${binding}/association-changes/${JSON.stringify(historyQuery)}`,
      (signal) => devices.changes(historyQuery, signal),
      { retryReadConflict: false },
    ),
    detail = useRead(
      `${binding}/association-detail/${selected ?? ''}`,
      (signal) => (selected ? devices.association(selected, signal) : Promise.resolve(null)),
      { retryReadConflict: true },
    )
  return (
    <>
      <DirectoryControls
        locale={locale}
        query={query}
        onChange={setQuery}
        fields={associationFields}
        sort={['id', 'version', 'confirmedAt']}
        maximum={100}
      />
      <Button
        onClick={() => {
          read.reload()
          history.reload()
          detail.reload()
        }}
      >
        {l('读取最新关系', 'Read current associations')}
      </Button>
      <ReadState
        busy={read.busy}
        error={read.error}
        locale={locale}
        onRetry={read.reload}
        onRestart={() => (query.cursor ? setQuery(firstPage(query)) : read.reload())}
      />
      {read.value && (
        <>
          <DataTable
            locale={locale}
            dataSource={read.value.items}
            rowKey="id"
            columns={[
              {
                title: l('关系', 'Association'),
                dataIndex: 'id',
                render: (_, row) => (
                  <Button type="link" onClick={() => setSelected(row.id)}>
                    {row.id}
                  </Button>
                ),
              },
              { title: l('版本', 'Version'), dataIndex: 'version' },
              {
                title: l('状态', 'State'),
                dataIndex: 'association',
                render: (_, row) =>
                  row.association && <Status value={row.association.state} locale={locale} />,
              },
              {
                title: l('确认时间', 'Confirmed at'),
                dataIndex: 'confirmedAt',
                render: (_, row) => timestamp(locale, row.confirmedAt),
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
      <Collapse
        items={[
          {
            key: 'changes',
            label: l('关系变更记录', 'Association changes'),
            children: (
              <>
                <p className="subtitle">
                  {l(
                    '按页查看普通历史；重新读取从当前首页观察，不作为可靠增量订阅。',
                    'Paged history. Read from the first page to observe current changes; this is not an incremental subscription.',
                  )}
                </p>
                <ReadState
                  busy={history.busy}
                  error={history.error}
                  locale={locale}
                  onRetry={history.reload}
                  onRestart={() =>
                    historyQuery.cursor
                      ? setHistoryQuery(firstPage(historyQuery))
                      : history.reload()
                  }
                />
                {history.value && (
                  <>
                    <DataTable
                      locale={locale}
                      dataSource={history.value.items}
                      rowKey={(row) => row.position}
                      columns={[
                        { title: l('位置', 'Position'), dataIndex: 'position' },
                        {
                          title: l('关系', 'Association'),
                          render: (_, row) => (
                            <Button type="link" onClick={() => setSelected(row.association.id)}>
                              {row.association.id}
                            </Button>
                          ),
                        },
                        { title: l('动作', 'Action'), dataIndex: 'action' },
                        {
                          title: l('时间', 'Time'),
                          dataIndex: 'recordedAt',
                          render: (_, row) => timestamp(locale, row.recordedAt),
                        },
                      ]}
                    />
                    <CursorControls
                      locale={locale}
                      query={historyQuery}
                      onChange={setHistoryQuery}
                      next={history.value.nextCursor}
                      count={history.value.items.length}
                    />
                  </>
                )}
              </>
            ),
          },
        ]}
      />
      <Modal
        open={!!selected}
        getContainer={false}
        title={l('完整关系详情', 'Full association detail')}
        footer={null}
        onCancel={() => setSelected(undefined)}
      >
        <ReadState
          busy={detail.busy}
          error={detail.error}
          locale={locale}
          onRetry={detail.reload}
        />
        {detail.value && <AssociationFacts value={detail.value} locale={locale} />}
      </Modal>
    </>
  )
}
function AssociationFacts({ value, locale }: { value: Association; locale: Locale }) {
  const l = labels(locale)
  return (
    <>
      <Status value={value.state} locale={locale} />
      <p>
        {l('关系版本', 'Association version')} · {value.version}
      </p>
      {value.members.map((member) => (
        <p key={member.channel}>
          <Link to={devicePath('endpoint', member.device)}>{member.device}</Link>
          <br />
          {member.channel}
        </p>
      ))}
      <p>{value.evidence}</p>
      <p>{value.reason}</p>
      {value.state !== 'revoked' && (
        <Link to={devicePath('association', value.id)}>
          {l('查看关联设备', 'Open associated device')}
        </Link>
      )}
    </>
  )
}
export function Devices({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    [params, setParams] = useSearchParams(),
    tab = params.get('tab') ?? 'views'
  return (
    <>
      <Heading
        title={l('设备', 'Devices')}
        hint={l(
          '从设备视图进入详情，保留每个终端和独立通道身份。',
          'Explore device views while retaining each endpoint and independent channel identity.',
        )}
        actions={
          <Link className="button-link" to="/enroll">
            {l('注册设备', 'Enroll device')}
          </Link>
        }
      />
      <Alert
        type="info"
        title={l(
          '设备状态、资产记录状态与退管进度各自独立；授权始终由服务端执行。',
          'Device, asset and retirement states are independent. The server enforces authorization.',
        )}
      />
      <Tabs
        activeKey={['views', 'endpoints', 'associations'].includes(tab) ? tab : 'views'}
        onChange={(value) =>
          setParams((current) => {
            const next = new URLSearchParams(current)
            next.set('tab', value)
            return next
          })
        }
        items={[
          {
            key: 'views',
            label: l('设备视图', 'Device views'),
            children: <ViewDirectory runtime={runtime} locale={locale} />,
          },
          {
            key: 'endpoints',
            label: l('终端目录', 'Endpoint directory'),
            children: <EndpointDirectory runtime={runtime} locale={locale} />,
          },
          {
            key: 'associations',
            label: l('关联关系', 'Associations'),
            children: <Relationships runtime={runtime} locale={locale} />,
          },
        ]}
      />
    </>
  )
}
