import { useEffect, useState } from 'react'
import { Alert, Button, Card, Form, Input, Space } from 'antd'
import { agentIntent, type AgentIntent } from '@rss/mdm-connections'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, ReadState, useAction, useRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { timestamp } from './DevicePresentation'
import { useProtectedDelivery } from './useProtectedDelivery'
type Pending =
  | { kind: 'save'; intent: AgentIntent }
  | { kind: 'publish'; operationId: string; expectedRevision: number }
export function AgentConnections({
  runtime,
  locale,
  canWrite,
}: {
  runtime: Runtime
  locale: Locale
  canWrite: boolean
}) {
  const l = labels(locale),
    { connections, binding } = useAdministration(runtime),
    agent = connections.agent,
    action = useAction(),
    [form] = Form.useForm<{ preferredOrigin: string; originsText: string }>(),
    [dirty, setDirty] = useState(false),
    [pending, setPending] = useState<Pending | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    [operationId, setOperationId] = useState(''),
    [operationDraft, setOperationDraft] = useState(''),
    [page, setPage] = useState<{ revision: number; after?: string }>({ revision: 0 }),
    [downloadedRevision, setDownloadedRevision] = useState<number | null>(null),
    read = useRead(`${binding}/agent-connections`, agent.read),
    original = useRead(`${binding}/agent-connection-operation/${operationId}`, () =>
      operationId ? agent.operation(operationId) : Promise.resolve(null),
    ),
    targetRevision = read.value?.published?.configuration.revision ?? null,
    after = page.revision === targetRevision ? page.after : undefined,
    devices = useRead(`${binding}/agent-convergence/${targetRevision ?? ''}/${after ?? ''}`, () =>
      targetRevision === null ? Promise.resolve(null) : agent.devices(targetRevision, after),
    ),
    delivery = useProtectedDelivery()
  useEffect(() => {
    const configuration = read.value?.draft?.configuration ?? read.value?.published?.configuration
    if (read.value) {
      form.setFieldsValue({
        preferredOrigin: configuration?.preferredOrigin ?? '',
        originsText: configuration?.origins.join('\n') ?? '',
      })
      setDirty(false)
    }
  }, [read.value, form])
  const pendingId = pending?.kind === 'save' ? pending.intent.operationId : pending?.operationId,
    originalMatches =
      pending &&
      operationId === pendingId &&
      original.value !== null &&
      original.value !== undefined &&
      (pending.kind === 'save'
        ? original.value.action === 'saved' &&
          original.value.draft.configuration.revision === pending.intent.expectedRevision + 1
        : original.value.action === 'published' &&
          original.value.configuration.configuration.revision === pending.expectedRevision)
  async function submit(change: Pending) {
    const result = await action.run(() =>
      change.kind === 'save'
        ? agent.save(change.intent)
        : agent.publish(change.operationId, change.expectedRevision),
    )
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) read.reload()
  }
  return (
    <>
      <Alert
        type="info"
        title={l(
          '保存草稿、发布签名连接、网关部署观察和设备 ACK 是四种事实。发布不会自动证明网关可用或设备收敛。',
          'Draft save, signed publication, gateway deployment observation and device ACK are four separate facts. Publication does not establish gateway availability or device convergence.',
        )}
      />
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      <Failure error={action.error} locale={locale} />
      {read.value && (
        <>
          <div className="device-detail-grid">
            <Card title={l('连接草稿', 'Connection draft')}>
              <p>
                {l('版本', 'Revision')} ·{' '}
                {read.value.draft?.configuration.revision ?? l('未创建', 'Not created')}
              </p>
              <p>{read.value.draft?.configuration.preferredOrigin}</p>
            </Card>
            <Card title={l('已发布连接', 'Published connections')}>
              <p>
                {l('版本', 'Revision')} ·{' '}
                {read.value.published?.configuration.revision ?? l('未发布', 'Not published')}
              </p>
              <p>{read.value.published?.configuration.preferredOrigin}</p>
            </Card>
          </div>
          <Form
            form={form}
            layout="vertical"
            disabled={!canWrite || action.busy || pending !== null}
            onValuesChange={() => setDirty(true)}
            onFinish={(values) =>
              void action
                .run(async () =>
                  agentIntent(
                    crypto.randomUUID(),
                    read.value!.draft?.configuration.revision ??
                      read.value!.published?.configuration.revision ??
                      0,
                    values.preferredOrigin,
                    values.originsText.split(/\s+/).filter(Boolean),
                  ),
                )
                .then((result) => {
                  if (result.ok) {
                    const change: Pending = { kind: 'save', intent: result.value }
                    setPending(change)
                    void submit(change)
                  }
                })
            }
          >
            <Form.Item
              name="preferredOrigin"
              label={l('首选 HTTPS origin', 'Preferred HTTPS origin')}
              rules={[{ required: true }]}
            >
              <Input maxLength={2048} />
            </Form.Item>
            <Form.Item
              name="originsText"
              label={l(
                '允许的 HTTPS origins（1–8 个，每行一个）',
                'Allowed HTTPS origins (1–8, one per line)',
              )}
              rules={[{ required: true }]}
            >
              <Input.TextArea rows={5} />
            </Form.Item>
            {canWrite && (
              <Button type="primary" htmlType="submit">
                {l('仅保存连接草稿', 'Save connection draft only')}
              </Button>
            )}
          </Form>
          {canWrite && (
            <Button
              disabled={dirty || !read.value.draft || action.busy || pending !== null}
              onClick={() => {
                const change: Pending = Object.freeze({
                  kind: 'publish',
                  operationId: crypto.randomUUID(),
                  expectedRevision: read.value!.draft!.configuration.revision,
                })
                setPending(change)
                void submit(change)
              }}
            >
              {l('明确发布已保存草稿', 'Explicitly publish the saved draft')} ·{' '}
              {read.value.draft?.configuration.revision ?? '—'}
            </Button>
          )}
          {dirty && (
            <p>
              {l(
                '有未保存输入，请先保存并重新读取，再发布确定版本。',
                'Unsaved input exists. Save and read the definite revision before publishing.',
              )}
            </p>
          )}
          <h2>{l('网关部署观察', 'Gateway deployment observations')}</h2>
          <DataTable
            locale={locale}
            dataSource={read.value.deployments}
            rowKey="origin"
            columns={[
              { title: 'Origin', dataIndex: 'origin' },
              { title: l('宿主', 'Host'), dataIndex: 'hostId' },
              {
                title: l('部署观察版本', 'Deployment observation revision'),
                dataIndex: 'revision',
              },
              {
                title: l('使用的连接版本', 'Connection revision'),
                dataIndex: 'configurationRevision',
              },
              {
                title: l('观察时间', 'Observed at'),
                dataIndex: 'observedAt',
                render: (_, row) => timestamp(locale, row.observedAt),
              },
            ]}
          />
          <p>
            {l('确认 / 当前有效设备', 'Confirmed / active devices')} ·{' '}
            {read.value.convergence.confirmedDevices} / {read.value.convergence.activeDevices} ·{' '}
            {l('目标连接版本', 'Target revision')} {read.value.convergence.targetRevision ?? '—'}
          </p>
          <p>
            {l(
              '退役阻断：安装配置 / 已安装实例',
              'Retirement blockers: enrollment configurations / installations',
            )}{' '}
            · {read.value.retirementBlockers.configurations} /{' '}
            {read.value.retirementBlockers.installations}
          </p>
        </>
      )}
      <Button onClick={read.reload}>
        {l('读取连接发布与部署状态', 'Read publication and deployment state')}
      </Button>
      <ReadState busy={devices.busy} error={devices.error} locale={locale} />
      {devices.value && (
        <>
          <h2>
            {l('设备收敛', 'Device convergence')} · {devices.value.targetRevision}
          </h2>
          <DataTable
            locale={locale}
            dataSource={devices.value.items}
            rowKey="device"
            columns={[
              { title: l('终端', 'Endpoint'), dataIndex: 'device' },
              {
                title: l('已安装连接版本', 'Installed connection revision'),
                dataIndex: 'installedRevision',
              },
              { title: 'Origin', dataIndex: 'origin' },
              {
                title: l('接收时间', 'Received at'),
                dataIndex: 'receivedAt',
                render: (_, row) => timestamp(locale, row.receivedAt),
              },
            ]}
          />
          <Space wrap>
            <Button
              disabled={!after}
              onClick={() => setPage({ revision: devices.value!.targetRevision })}
            >
              {l('收敛首页', 'First convergence page')}
            </Button>
            <Button
              disabled={!devices.value.next}
              onClick={() => {
                if (devices.value?.next)
                  setPage({ revision: devices.value.targetRevision, after: devices.value.next })
              }}
            >
              {l('下一收敛页', 'Next convergence page')}
            </Button>
          </Space>
        </>
      )}
      <Form
        className="admin-toolbar"
        layout="inline"
        onFinish={() => {
          setOperationId(operationDraft)
          original.reload()
        }}
      >
        <Form.Item label={l('原 Agent 连接操作标识', 'Original Agent connection operation ID')}>
          <Input
            aria-label={l('原 Agent 连接操作标识', 'Original Agent connection operation ID')}
            value={operationDraft}
            onChange={(event) => setOperationDraft(event.target.value)}
          />
        </Form.Item>
        <Button htmlType="submit">
          {l('查询原 Agent 连接操作', 'Read original Agent connection operation')}
        </Button>
      </Form>
      <ReadState busy={original.busy} error={original.error} locale={locale} />
      {original.value && (
        <p>
          {original.value.action === 'saved'
            ? l('草稿已保存', 'Draft saved')
            : l('签名连接已发布', 'Signed connections published')}{' '}
          ·{' '}
          {original.value.action === 'saved'
            ? original.value.draft.configuration.revision
            : original.value.configuration.configuration.revision}
        </p>
      )}
      {pending && (
        <div className="admin-recovery">
          <code>{pendingId}</code>
          {outcome === 'confirmed' || outcome === 'rejected' || originalMatches ? (
            <Button
              disabled={action.busy}
              onClick={() => {
                setPending(null)
                setOutcome('none')
                action.clear()
                read.reload()
              }}
            >
              {outcome === 'rejected'
                ? l('放弃已拒绝请求并重读', 'Discard rejected request and read again')
                : l(
                    '原连接操作已确认，读取最新版本',
                    'Original connection action confirmed; read latest',
                  )}
            </Button>
          ) : (
            <Space wrap>
              <Button
                onClick={() => {
                  setOperationId(pendingId!)
                  setOperationDraft(pendingId!)
                  original.reload()
                }}
              >
                {l('查询本次原连接操作', 'Query this original connection action')}
              </Button>
              <Button disabled={action.busy || !canWrite} onClick={() => void submit(pending)}>
                {l('显式重提原连接操作', 'Resubmit original connection action')}
              </Button>
            </Space>
          )}
        </div>
      )}
      <Button
        disabled={!read.value?.published || action.busy}
        onClick={() => {
          delivery.clear()
          const ticket = delivery.capture()
          void action
            .run(async () => {
              const result = await agent.download()
              return {
                revision: result.document.configuration.revision,
                disclosed: delivery.deliver(result.file, ticket),
              }
            })
            .then((result) => {
              if (result.ok)
                setDownloadedRevision(result.value.disclosed ? result.value.revision : null)
            })
        }}
      >
        {l('下载后台当前已发布连接文档', 'Download the current published connection document')}
      </Button>
      {delivery.download && (
        <Space wrap>
          <a href={delivery.download.url} download={delivery.download.filename}>
            {l('保存连接文档', 'Save connection document')} · {downloadedRevision}
          </a>
          <Button onClick={delivery.clear}>{l('清除下载', 'Clear download')}</Button>
        </Space>
      )}
    </>
  )
}
