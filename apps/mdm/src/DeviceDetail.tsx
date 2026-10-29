import { SelectionGuard, useSelectionGuard, usePendingSelection } from './SelectionGuard'
import { useEffect, useState } from 'react'
import { Alert, Button, Card, Checkbox, Form, Result, Select } from 'antd'
import { Link, useParams } from 'react-router-dom'
import type { AssetState, DeviceRef, DeviceView, ViewEndpoint } from '@rss/mdm-devices'
import { SecretTabs } from './SecretTabs'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, Heading, isUnknown, labels, ReadState, useAction, useRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { deviceName, FieldValue, Status, timestamp } from './DevicePresentation'
import { AssociationEditor } from './AssociationEditor'
import { DevicePersonnel } from './DevicePersonnel'
import { DeviceRetirement } from './DeviceRetirement'
import { DeviceRegistration } from './DeviceRegistration'
function AgentObservation({
  runtime,
  locale,
  endpoint,
}: {
  runtime: Runtime
  locale: Locale
  endpoint: ViewEndpoint
}) {
  const l = labels(locale),
    { connections, binding } = useAdministration(runtime),
    registration = endpoint.channels.find((c) => c.channel === 'agent' && c.status === 'active'),
    read = useRead(
      `${binding}/device-connection/${endpoint.id}/${registration?.registrationId ?? ''}/${registration?.generation ?? ''}`,
      () =>
        registration
          ? connections.agent.observation(endpoint.id, registration)
          : Promise.resolve(null),
    )
  return (
    <Card title={l('Agent 连接观察', 'Agent connection observation')}>
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      {!registration && <p>{l('没有有效 Agent 注册。', 'No active Agent registration.')}</p>}
      {registration && !read.busy && !read.error && !read.value && (
        <p>
          {l('当前注册尚无连接观察。', 'No connection observation for the current registration.')}
        </p>
      )}
      {read.value && (
        <dl className="device-facts">
          <div>
            <dt>{l('注册 / 代次', 'Registration / generation')}</dt>
            <dd>
              {read.value.registration} · {read.value.generation}
            </dd>
          </div>
          <div>
            <dt>{l('目标版本', 'Target revision')}</dt>
            <dd>{read.value.targetRevision ?? '—'}</dd>
          </div>
          <div>
            <dt>{l('确认的连接版本', 'Acknowledged revision')}</dt>
            <dd>{read.value.acknowledgement?.revision ?? l('尚未确认', 'Not yet confirmed')}</dd>
          </div>
          <div>
            <dt>{l('确认接收时间', 'Acknowledgement received')}</dt>
            <dd>{timestamp(locale, read.value.receivedAt)}</dd>
          </div>
          <div>
            <dt>{l('报告的失败', 'Reported failure')}</dt>
            <dd>
              {read.value.failure
                ? `${read.value.failure.report.reason} · ${read.value.failure.origin} · ${timestamp(locale, read.value.failure.receivedAt)}`
                : '—'}
            </dd>
          </div>
        </dl>
      )}
      <Button onClick={read.reload}>
        {l('重新读取连接观察', 'Read connection observation again')}
      </Button>
    </Card>
  )
}
function AssetRecord({
  runtime,
  locale,
  reference,
  onChanged,
}: {
  runtime: Runtime
  locale: Locale
  reference: DeviceRef
  onChanged(): void
}) {
  const l = labels(locale),
    { devices } = useAdministration(runtime),
    action = useAction(),
    [state, setState] = useState<AssetState>('archived'),
    [approved, setApproved] = useState(false),
    [pending, setPending] = useState<{ operationId: string; state: AssetState } | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none')
  usePendingSelection(
    action.busy || (pending !== null && !['confirmed', 'rejected'].includes(outcome)),
  )
  async function submit(change: { operationId: string; state: AssetState }) {
    const result = await action.run(() =>
      devices.assetState(reference, change.operationId, change.state),
    )
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) onChanged()
  }
  return (
    <Card title={l('资产记录处置', 'Asset record lifecycle')}>
      <Alert
        type="warning"
        title={l(
          '归档或删除资产记录不等于退管、撤销注册或擦除设备。关联视图将作用于其实际终端。',
          'Archiving or deleting the asset record does not unenroll, revoke or wipe a device. An association targets its actual endpoints.',
        )}
      />
      <Failure error={action.error} locale={locale} />
      <Form layout="vertical" disabled={action.busy || pending !== null}>
        <Form.Item label={l('资产记录状态', 'Asset record state')}>
          <Select
            aria-label={l('资产记录状态', 'Asset record state')}
            value={state}
            options={[
              { value: 'active', label: l('在用', 'Active') },
              { value: 'archived', label: l('归档', 'Archived') },
              { value: 'deleted', label: l('删除', 'Deleted') },
            ]}
            onChange={setState}
          />
        </Form.Item>
        <Checkbox checked={approved} onChange={(event) => setApproved(event.target.checked)}>
          {l('确认仅更改资产记录', 'Confirm asset record change')}
        </Checkbox>
        <Button
          danger={state === 'deleted'}
          disabled={!approved || pending !== null || action.busy}
          onClick={() => {
            const change = Object.freeze({ operationId: crypto.randomUUID(), state })
            setPending(change)
            void submit(change)
          }}
        >
          {l('更改资产记录', 'Change asset record')}
        </Button>
      </Form>
      {pending && outcome !== 'confirmed' && (
        <div className="admin-recovery">
          <code>{pending.operationId}</code>
          {outcome === 'rejected' ? (
            <Button
              onClick={() => {
                setPending(null)
                setOutcome('none')
                setApproved(false)
                action.clear()
                onChanged()
              }}
            >
              {l('放弃已拒绝请求并重读', 'Discard rejected request and read again')}
            </Button>
          ) : (
            <Button disabled={action.busy} onClick={() => void submit(pending)}>
              {l('显式重提原资产请求', 'Resubmit original asset request')}
            </Button>
          )}
        </div>
      )}
      {outcome === 'confirmed' && (
        <Alert
          type="success"
          title={l('原资产记录操作已确认。', 'The original asset record change is confirmed.')}
        />
      )}
    </Card>
  )
}
function EndpointFacts({
  runtime,
  locale,
  endpoint,
}: {
  runtime: Runtime
  locale: Locale
  endpoint: ViewEndpoint
}) {
  const l = labels(locale),
    { devices, binding } = useAdministration(runtime),
    read = useRead(`${binding}/endpoint-detail/${endpoint.id}`, () => devices.endpoint(endpoint.id))
  return (
    <>
      <Card title={l('终端摘要', 'Endpoint summary')}>
        <dl className="device-facts">
          <div>
            <dt>{l('终端标识', 'Endpoint ID')}</dt>
            <dd>{endpoint.id}</dd>
          </div>
          <div>
            <dt>{l('名称', 'Name')}</dt>
            <dd>
              <FieldValue value={endpoint.displayName} locale={locale} />
            </dd>
          </div>
          <div>
            <dt>{l('序列号', 'Serial number')}</dt>
            <dd>
              <FieldValue value={endpoint.serialNumber} locale={locale} />
            </dd>
          </div>
          <div>
            <dt>{l('设备状态', 'Device state')}</dt>
            <dd>
              <Status locale={locale} value={endpoint.status} />
            </dd>
          </div>
          <div>
            <dt>{l('资产状态', 'Asset state')}</dt>
            <dd>
              <Status locale={locale} value={endpoint.assetState} />
            </dd>
          </div>
          <div>
            <dt>{l('平台观察', 'Platform observation')}</dt>
            <dd>
              {endpoint.platform.values.join(' / ') || '—'}{' '}
              <Status value={endpoint.platform.state} locale={locale} />
            </dd>
          </div>
        </dl>
      </Card>
      <Card title={l('注册通道', 'Registration channels')}>
        <DataTable
          locale={locale}
          dataSource={endpoint.channels}
          rowKey="registrationId"
          columns={[
            { title: l('通道', 'Channel'), dataIndex: 'channel' },
            { title: l('注册标识', 'Registration'), dataIndex: 'registrationId' },
            { title: l('代次', 'Generation'), dataIndex: 'generation' },
            {
              title: l('状态', 'State'),
              dataIndex: 'status',
              render: (value) => <Status value={String(value)} locale={locale} />,
            },
            { title: l('来源', 'Source'), dataIndex: 'source' },
            {
              title: l('最近通信', 'Last communication'),
              dataIndex: 'lastCommunicationReceivedAt',
              render: (_, row) => timestamp(locale, row.lastCommunicationReceivedAt),
            },
          ]}
        />
        {endpoint.channels.map((channel) => (
          <div key={channel.channel} className="subtitle">
            {channel.children.map((child) => (
              <p key={child.registrationId}>
                {l('子通道', 'Child channel')} · {child.registrationId} ·{' '}
                {l('父代次', 'Parent generation')} {child.parentGeneration} ·{' '}
                <Status locale={locale} value={child.status} /> ·{' '}
                {child.ready ? l('就绪', 'Ready') : l('未就绪', 'Not ready')}
              </p>
            ))}
            {channel.userContext && (
              <p>
                {l('用户上下文', 'User context')} · {channel.userContext.id} ·{' '}
                <Status locale={locale} value={channel.userContext.registrationStatus} />
              </p>
            )}
          </div>
        ))}
      </Card>
      <Card title={l('当前能力事实', 'Current capability facts')}>
        <ReadState busy={read.busy} error={read.error} locale={locale} />
        {read.value && (
          <DataTable
            locale={locale}
            dataSource={read.value.capabilities}
            rowKey={(row) => `${row.channel}/${row.action}`}
            columns={[
              { title: l('能力', 'Capability'), dataIndex: 'action' },
              { title: l('通道', 'Channel'), dataIndex: 'channel' },
              {
                title: l('产品支持', 'Product support'),
                render: (_, row) => <Status value={row.productSupport.state} locale={locale} />,
              },
              {
                title: l('设备前提', 'Device prerequisite'),
                render: (_, row) => <Status value={row.devicePrerequisite.state} locale={locale} />,
              },
              {
                title: l('当前权限', 'Current permission'),
                render: (_, row) =>
                  row.permission.allowed ? l('允许', 'Allowed') : l('拒绝', 'Denied'),
              },
            ]}
          />
        )}
      </Card>
    </>
  )
}
function Detail({
  runtime,
  locale,
  reference,
}: {
  runtime: Runtime
  locale: Locale
  reference: DeviceRef
}) {
  const guard = useSelectionGuard()
  const l = labels(locale),
    { devices, binding } = useAdministration(runtime),
    [selected, setSelected] = useState(''),
    [snapshot, setSnapshot] = useState<DeviceView>(),
    read = useRead(`${binding}/device-view/${reference.kind}/${reference.id}`, () =>
      devices.view(reference),
    )
  useEffect(() => {
    if (read.error) setSnapshot(undefined)
    else if (read.value) setSnapshot(read.value)
  }, [read.value, read.error])
  // Keep local panels mounted during a same-resource read so their frozen unknown intents survive.
  // Any denied/failed read removes the old projection immediately; session changes remount the root.
  const view = read.error ? undefined : (read.value ?? snapshot),
    endpoint = selected ? view?.endpoints.find((e) => e.id === selected) : view?.endpoints[0]
  return (
    <>
      <Link to="/devices">← {l('设备目录', 'Devices')}</Link>
      <Heading
        title={deviceName(view?.endpoints[0]?.displayName, l('设备详情', 'Device detail'))}
        hint={`${reference.kind} · ${reference.id}`}
        actions={
          <Button disabled={read.busy} onClick={read.reload}>
            {l('读取最新设备事实', 'Read latest device facts')}
          </Button>
        }
      />
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      {view && (
        <>
          {read.busy && (
            <p className="subtitle">
              {l(
                '正在读取最新快照；当前操作保留原请求。',
                'Reading the latest snapshot; current operations retain their original requests.',
              )}
            </p>
          )}
          {view.association && (
            <Alert
              type={view.association.state === 'needs_verification' ? 'warning' : 'info'}
              title={
                <span>
                  {l('关联状态', 'Association')} ·{' '}
                  <Status value={view.association.state} locale={locale} /> · {l('版本', 'Version')}{' '}
                  {view.association.version}
                </span>
              }
            />
          )}
          <div className="device-endpoint-select">
            <label htmlFor="device-endpoint">{l('当前操作终端', 'Endpoint for actions')}</label>
            <Select
              id="device-endpoint"
              disabled={guard.locked}
              value={endpoint?.id ?? null}
              options={view.endpoints.map((e) => ({
                value: e.id,
                label: `${deviceName(e.displayName, e.id)} · ${e.id}`,
              }))}
              onChange={(value: string) => setSelected(value)}
            />
          </div>
          {endpoint ? (
            <SelectionGuard.Provider value={guard.register}>
              <SecretTabs
                key={endpoint.id}
                items={[
                  {
                    key: 'overview',
                    label: l('概览', 'Overview'),
                    children: (
                      <div className="device-detail-grid">
                        <EndpointFacts runtime={runtime} locale={locale} endpoint={endpoint} />
                        <AgentObservation runtime={runtime} locale={locale} endpoint={endpoint} />
                      </div>
                    ),
                  },
                  {
                    key: 'registration',
                    label: l('注册', 'Enrollment'),
                    children: (
                      <DeviceRegistration runtime={runtime} locale={locale} device={endpoint.id} />
                    ),
                  },
                  {
                    key: 'people',
                    label: l('人员', 'People'),
                    children: (
                      <DevicePersonnel
                        runtime={runtime}
                        locale={locale}
                        endpoint={endpoint}
                        onChanged={read.reload}
                      />
                    ),
                  },
                  {
                    key: 'association',
                    label: l('终端关联', 'Association'),
                    children: (
                      <AssociationEditor
                        runtime={runtime}
                        locale={locale}
                        endpoint={endpoint}
                        prior={view.association}
                        onChanged={read.reload}
                      />
                    ),
                  },
                  {
                    key: 'fields',
                    label: l('设备字段', 'Device fields'),
                    children: (
                      <DataTable
                        locale={locale}
                        dataSource={Object.entries(view.fields).map(([field, value]) => ({
                          field,
                          value,
                        }))}
                        rowKey="field"
                        columns={[
                          { title: l('字段', 'Field'), dataIndex: 'field' },
                          {
                            title: l('当前值与状态', 'Current value and state'),
                            render: (_, row) => <FieldValue value={row.value} locale={locale} />,
                          },
                        ]}
                      />
                    ),
                  },
                  {
                    key: 'retirement',
                    label: l('退管状态', 'Retirement'),
                    children: (
                      <DeviceRetirement runtime={runtime} locale={locale} reference={reference} />
                    ),
                  },
                  {
                    key: 'asset',
                    label: l('资产记录', 'Asset record'),
                    children: (
                      <AssetRecord
                        runtime={runtime}
                        locale={locale}
                        reference={reference}
                        onChanged={read.reload}
                      />
                    ),
                  },
                ]}
              />
            </SelectionGuard.Provider>
          ) : (
            <Alert
              type="warning"
              title={l(
                '原终端已不属于此视图，请显式选择当前终端。',
                'The previous endpoint is no longer in this view. Select a current endpoint.',
              )}
            />
          )}
        </>
      )}
    </>
  )
}
export function DeviceDetail({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const { kind, id } = useParams()
  if ((kind !== 'endpoint' && kind !== 'association') || !id) return <Result status="404" />
  return <Detail key={`${kind}/${id}`} runtime={runtime} locale={locale} reference={{ kind, id }} />
}
