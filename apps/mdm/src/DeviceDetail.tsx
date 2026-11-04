import { DeviceControl } from './DeviceControl'
import { deviceExecutionsPath } from './Executions'
import { DeviceSecurity, hasDeviceSecurity } from './DeviceSecurity'
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
import { AssetFacts } from './AssetFacts'
import { DeviceCompliance } from './DeviceCompliance'
import { AuditWorkspace } from './Audit'
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
    { devices, inventory, compliance, authorization, binding } = useAdministration(runtime),
    permissions = useRead(`${binding}/device-asset-presentation`, authorization.effective),
    has = (operation: string) =>
      permissions.value?.grants.some((grant) => grant.operation === operation) ?? false,
    [selected, setSelected] = useState(''),
    [snapshot, setSnapshot] = useState<DeviceView>(),
    [heldEndpoint, setHeldEndpoint] = useState<ViewEndpoint>(),
    read = useRead(`${binding}/device-view/${reference.kind}/${reference.id}`, () =>
      devices.view(reference),
    )
  useEffect(() => {
    if (read.value) setSnapshot(read.value)
  }, [read.value])
  // Old facts are hidden on a failed read. Retain operation owners until the same bound
  // endpoint is observed again; a changed tenant/principal/session remounts this subtree.
  const retained = read.value ?? snapshot,
    view = read.error ? undefined : retained,
    endpoint = selected ? view?.endpoints.find((e) => e.id === selected) : view?.endpoints[0],
    mountedEndpoint = endpoint ?? heldEndpoint
  useEffect(() => {
    if (endpoint) {
      setHeldEndpoint(endpoint)
      if (!selected) setSelected(endpoint.id)
    }
  }, [endpoint, selected])
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
      <Button onClick={permissions.reload}>
        {l('读取设备资产与合规权限', 'Read device inventory and compliance permissions')}
      </Button>
      <ReadState busy={permissions.busy} error={permissions.error} locale={locale} />
      {retained && (
        <fieldset className="permission-panel" hidden={!view} disabled={!view}>
          {read.busy && (
            <p className="subtitle">
              {l(
                '正在读取最新快照；当前操作保留原请求。',
                'Reading the latest snapshot; current operations retain their original requests.',
              )}
            </p>
          )}
          {retained.association && (
            <Alert
              type={retained.association.state === 'needs_verification' ? 'warning' : 'info'}
              title={
                <span>
                  {l('关联状态', 'Association')} ·{' '}
                  <Status value={retained.association.state} locale={locale} /> ·{' '}
                  {l('版本', 'Version')} {retained.association.version}
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
              options={retained.endpoints.map((e) => ({
                value: e.id,
                label: `${deviceName(e.displayName, e.id)} · ${e.id}`,
              }))}
              onChange={(value: string) => setSelected(value)}
            />
          </div>
          {!endpoint && mountedEndpoint && (
            <Alert
              type="warning"
              title={l(
                '原操作终端暂不在当前视图。原请求已保留，请重新读取当前终端事实。',
                'The original endpoint is absent from the current view. Original requests are retained; read current endpoint facts again.',
              )}
            />
          )}
          {mountedEndpoint ? (
            <SelectionGuard.Provider value={guard.register}>
              <SecretTabs
                key={mountedEndpoint.id}
                uiLocale={locale}
                authorizedKeys={
                  endpoint && view
                    ? [
                        'overview',
                        'registration',
                        'people',
                        'association',
                        'fields',
                        'retirement',
                        'asset',
                        ...(has('inventory_read') ? ['inventory'] : []),
                        ...(has('compliance_read') ? ['compliance'] : []),
                        ...(has('audit_read') || has('operation_read') ? ['history'] : []),
                        ...(hasDeviceSecurity(permissions.value?.grants ?? [], mountedEndpoint.id)
                          ? ['security']
                          : []),
                      ]
                    : []
                }
                items={[
                  {
                    key: 'overview',
                    label: l('概览', 'Overview'),
                    children: (
                      <div className="device-detail-grid">
                        <EndpointFacts
                          runtime={runtime}
                          locale={locale}
                          endpoint={mountedEndpoint}
                        />
                        <div>
                          <Link to={deviceExecutionsPath(mountedEndpoint.id)}>
                            {l('查看设备执行', 'View device executions')}
                          </Link>
                          <br />
                          <Link to="/device-access">Device Access</Link>
                        </div>
                        <DeviceControl
                          key={`${binding}/${mountedEndpoint.id}/${mountedEndpoint.primaryMdmRegistration?.registrationId}/${mountedEndpoint.primaryMdmRegistration?.generation}`}
                          runtime={runtime}
                          locale={locale}
                          endpoint={mountedEndpoint}
                          grants={permissions.value?.grants ?? []}
                        />
                        <AgentObservation
                          runtime={runtime}
                          locale={locale}
                          endpoint={mountedEndpoint}
                        />
                      </div>
                    ),
                  },
                  {
                    key: 'registration',
                    label: l('注册', 'Enrollment'),
                    children: (
                      <DeviceRegistration
                        runtime={runtime}
                        locale={locale}
                        device={mountedEndpoint.id}
                      />
                    ),
                  },
                  {
                    key: 'people',
                    label: l('人员', 'People'),
                    children: (
                      <DevicePersonnel
                        runtime={runtime}
                        locale={locale}
                        endpoint={mountedEndpoint}
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
                        endpoint={mountedEndpoint}
                        prior={retained.association}
                        onChanged={read.reload}
                      />
                    ),
                  },
                  {
                    key: 'inventory',
                    label: l('资产信息', 'Inventory'),
                    children: (
                      <AssetFacts
                        inventory={inventory}
                        locale={locale}
                        reference={reference}
                        endpoint={mountedEndpoint.id}
                        canAssign={has('inventory_assign')}
                      />
                    ),
                  },
                  {
                    key: 'history',
                    label: l('历史与活动', 'History and activity'),
                    children: (
                      <AuditWorkspace
                        runtime={runtime}
                        locale={locale}
                        device={mountedEndpoint.id}
                      />
                    ),
                  },
                  {
                    key: 'security',
                    label: l('设备安全', 'Device security'),
                    children: (
                      <DeviceSecurity
                        runtime={runtime}
                        locale={locale}
                        endpoint={mountedEndpoint}
                        grants={permissions.value?.grants ?? []}
                      />
                    ),
                  },
                  {
                    key: 'compliance',
                    label: l('安全与合规', 'Security and compliance'),
                    children: (
                      <DeviceCompliance
                        compliance={compliance}
                        locale={locale}
                        device={mountedEndpoint.id}
                      />
                    ),
                  },
                  {
                    key: 'fields',
                    label: l('设备字段', 'Device fields'),
                    children: (
                      <DataTable
                        locale={locale}
                        dataSource={Object.entries(retained.fields).map(([field, value]) => ({
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
        </fieldset>
      )}
    </>
  )
}
export function DeviceDetail({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const { kind, id } = useParams()
  if ((kind !== 'endpoint' && kind !== 'association') || !id) return <Result status="404" />
  return <Detail key={`${kind}/${id}`} runtime={runtime} locale={locale} reference={{ kind, id }} />
}
