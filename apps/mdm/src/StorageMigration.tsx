import { useState } from 'react'
import { Alert, Button, Card, Checkbox, Form, Input, InputNumber, Space } from 'antd'
import type { MigrationIntent } from '@rss/mdm-connections'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, ReadState, useAction, useRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { Status, timestamp } from './DevicePresentation'
export function StorageMigration({
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
    storage = connections.storage,
    action = useAction(),
    [target, setTarget] = useState<number | null>(null),
    [approved, setApproved] = useState(false),
    [pending, setPending] = useState<MigrationIntent | null>(null),
    [outcome, setOutcome] = useState<'none' | 'accepted' | 'unknown' | 'rejected'>('none'),
    [operationId, setOperationId] = useState(''),
    [operationDraft, setOperationDraft] = useState(''),
    read = useRead(`${binding}/storage-migrations`, storage.migrations),
    operation = useRead(`${binding}/storage-migration/${operationId}`, () =>
      operationId ? storage.migration(operationId) : Promise.resolve(null),
    ),
    terminal =
      operation.value &&
      (!pending || operation.value.operationId === pending.operationId) &&
      ['committed', 'cancelled'].includes(operation.value.phase)
  async function submit(intent: MigrationIntent) {
    const result = await action.run(() => storage.requestMigration(intent))
    setOutcome((previous) =>
      result.ok
        ? 'accepted'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) {
      setOperationId(intent.operationId)
      setOperationDraft(intent.operationId)
      operation.reload()
      read.reload()
    }
  }
  return (
    <Card title={l('存储代次迁移', 'Storage generation migration')}>
      <Alert
        type="info"
        title={l(
          '不同存储目标通过后台维护完成复制、核验与切换。资格通过、迁移受理与宿主观察分别展示，不在浏览器执行复制或宣布切换。',
          'The backend copies, verifies and cuts over a different storage target. Qualification, accepted migration and host observation are distinct; the browser neither copies objects nor declares cutover.',
        )}
      />
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      <Failure error={action.error} locale={locale} />
      {read.value && (
        <>
          <dl className="device-facts">
            <div>
              <dt>{l('存储设置版本', 'Storage settings revision')}</dt>
              <dd>{read.value.storageRevision}</dd>
            </div>
            <div>
              <dt>{l('当前有效代次', 'Current active generation')}</dt>
              <dd>{read.value.activeGeneration}</dd>
            </div>
            <div>
              <dt>{l('维护状态', 'Maintenance state')}</dt>
              <dd>
                <Status locale={locale} value={read.value.maintenance} />
              </dd>
            </div>
          </dl>
          {canWrite && (
            <Form
              layout="vertical"
              disabled={action.busy || pending !== null}
              onFinish={() => {
                const intent = Object.freeze({
                  operationId: crypto.randomUUID(),
                  expectedStorageRevision: read.value!.storageRevision,
                  targetRevision: target!,
                })
                setPending(intent)
                void submit(intent)
              }}
            >
              <Form.Item label={l('目标存储材料版本', 'Target storage material revision')}>
                <InputNumber
                  aria-label={l('目标存储材料版本', 'Target storage material revision')}
                  min={1}
                  precision={0}
                  value={target}
                  onChange={(value) => setTarget(value === null ? null : Number(value))}
                />
              </Form.Item>
              <Checkbox checked={approved} onChange={(event) => setApproved(event.target.checked)}>
                {l(
                  '确认已核对目标材料资格并请求代次迁移',
                  'I verified target qualification and request generation migration',
                )}
              </Checkbox>
              <Button
                type="primary"
                htmlType="submit"
                disabled={!approved || !target || pending !== null || action.busy}
              >
                {l('请求存储迁移', 'Request storage migration')}
              </Button>
            </Form>
          )}
          <DataTable
            locale={locale}
            dataSource={read.value.history}
            rowKey="operationId"
            columns={[
              {
                title: l('操作', 'Operation'),
                dataIndex: 'operationId',
                render: (_, row) => (
                  <Button
                    type="link"
                    onClick={() => {
                      setOperationId(row.operationId)
                      setOperationDraft(row.operationId)
                    }}
                  >
                    {row.operationId}
                  </Button>
                ),
              },
              {
                title: l('阶段', 'Phase'),
                dataIndex: 'phase',
                render: (value) => <Status locale={locale} value={String(value)} />,
              },
              { title: l('目标材料版本', 'Target material revision'), dataIndex: 'targetRevision' },
              { title: l('已核验对象', 'Verified objects'), dataIndex: 'verifiedObjects' },
              { title: l('受阻原因', 'Block reason'), dataIndex: 'blockedReason' },
            ]}
          />
        </>
      )}
      <Button onClick={read.reload}>
        {l('读取迁移与代次目录', 'Read migration and generation directory')}
      </Button>
      <Form
        className="admin-toolbar"
        layout="inline"
        onFinish={() => {
          setOperationId(operationDraft)
          operation.reload()
        }}
      >
        <Form.Item label={l('原迁移操作标识', 'Original migration operation ID')}>
          <Input
            aria-label={l('原迁移操作标识', 'Original migration operation ID')}
            value={operationDraft}
            disabled={pending !== null}
            onChange={(event) => setOperationDraft(event.target.value)}
          />
        </Form.Item>
        <Button htmlType="submit">{l('读取原存储迁移', 'Read original storage migration')}</Button>
      </Form>
      <ReadState busy={operation.busy} error={operation.error} locale={locale} />
      {operation.value && (
        <>
          <Status value={operation.value.phase} locale={locale} />
          <dl className="device-facts">
            <div>
              <dt>{l('源代次', 'Source generation')}</dt>
              <dd>{operation.value.sourceGeneration}</dd>
            </div>
            <div>
              <dt>{l('目标代次', 'Target generation')}</dt>
              <dd>{operation.value.targetGeneration}</dd>
            </div>
            <div>
              <dt>
                {l('源对象 / 已核验对象 / 字节', 'Source objects / verified objects / bytes')}
              </dt>
              <dd>
                {operation.value.sourceObjects} / {operation.value.verifiedObjects} /{' '}
                {operation.value.verifiedBytes}
              </dd>
            </div>
            <div>
              <dt>{l('后台下一动作', 'Backend next action')}</dt>
              <dd>{operation.value.nextAction}</dd>
            </div>
            <div>
              <dt>{l('宿主观察时间', 'Host observed at')}</dt>
              <dd>{timestamp(locale, operation.value.observedAt)}</dd>
            </div>
            <div>
              <dt>{l('受阻原因', 'Block reason')}</dt>
              <dd>{operation.value.blockedReason ?? '—'}</dd>
            </div>
          </dl>
          {canWrite && !['committed', 'cancelled'].includes(operation.value.phase) && (
            <Button
              danger
              disabled={action.busy}
              onClick={() =>
                void action
                  .run(() => storage.cancelMigration(operation.value!.operationId))
                  .then((result) => {
                    if (result.ok) {
                      operation.reload()
                      read.reload()
                    }
                  })
              }
            >
              {l('取消此原迁移操作', 'Cancel this original migration operation')}
            </Button>
          )}
        </>
      )}
      {pending && (
        <div className="admin-recovery">
          <code>{pending.operationId}</code>
          <Space wrap>
            <Button
              disabled={action.busy}
              onClick={() => {
                setOperationId(pending.operationId)
                setOperationDraft(pending.operationId)
                operation.reload()
              }}
            >
              {l('查询本次原迁移', 'Query this original migration')}
            </Button>
            {outcome === 'rejected' || terminal ? (
              <Button
                disabled={action.busy}
                onClick={() => {
                  setPending(null)
                  setOutcome('none')
                  setApproved(false)
                  action.clear()
                  read.reload()
                }}
              >
                {outcome === 'rejected'
                  ? l('放弃已拒绝迁移并重读', 'Discard rejected migration and read again')
                  : l(
                      '原迁移已终结，读取最新代次',
                      'Original migration terminal; read latest generation',
                    )}
              </Button>
            ) : (
              outcome === 'unknown' && (
                <Button disabled={action.busy} onClick={() => void submit(pending)}>
                  {l('显式重提原迁移请求', 'Resubmit original migration request')}
                </Button>
              )
            )}
          </Space>
        </div>
      )}
    </Card>
  )
}
