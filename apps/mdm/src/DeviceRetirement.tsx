import { usePendingSelection } from './SelectionGuard'
import { useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Alert, Button, Card, Checkbox, Form, Input, Space } from 'antd'
import type { DeviceRef } from '@rss/mdm-devices'
import type { Grant } from '@rss/mdm-authorization'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, ReadState, useAction, useRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { Status, timestamp } from './DevicePresentation'
import { devicePermission } from './DeviceSecurity'
export function DeviceRetirement({
  runtime,
  locale,
  reference,
  grants,
}: {
  runtime: Runtime
  locale: Locale
  reference: DeviceRef
  grants: readonly Grant[]
}) {
  const [params, setParams] = useSearchParams()
  const initial = params.get('retirement') ?? ''
  const l = labels(locale),
    { devices, binding, authorization } = useAdministration(runtime),
    action = useAction(),
    [draft, setDraft] = useState(initial),
    [reason, setReason] = useState(''),
    [approved, setApproved] = useState(false),
    [pending, setPending] = useState<{ id: string; operationId: string; reason: string } | null>(
      null,
    ),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    locked = pending !== null && (action.busy || outcome === 'unknown'),
    id = locked ? pending.id : initial,
    read = useRead(`${binding}/retirement/${reference.kind}/${reference.id}/${id}`, async () => {
      if (!id) return null
      const value = await devices.retirement(id)
      const sameObject =
          value.target.object.kind === reference.kind && value.target.object.id === reference.id,
        memberEndpoint =
          reference.kind === 'endpoint' &&
          value.target.members.some((m) => m.device === reference.id)
      if (!sameObject && !memberEndpoint) throw new Error('Wrong retirement target')
      return value
    }),
    channels = read.value?.channels ?? [],
    allowed = (current: readonly Grant[]) =>
      channels.length > 0 &&
      channels.every(
        (channel) =>
          devicePermission(current, channel.device, 'inventory_read') &&
          devicePermission(current, channel.device, 'device_unmanage'),
      ),
    canForce = allowed(grants)
  usePendingSelection(locked || action.busy)
  useEffect(() => {
    if (locked && initial !== id) {
      const next = new URLSearchParams(params)
      next.set('retirement', id)
      setParams(next, { replace: true })
    }
  }, [locked, initial, id, params, setParams])
  useEffect(() => {
    setDraft(id)
    setApproved(false)
    setReason('')
    setPending(null)
    setOutcome('none')
    action.clear()
  }, [id])
  useEffect(() => {
    if (!canForce) setApproved(false)
  }, [canForce])
  async function force(change: { id: string; operationId: string; reason: string }) {
    if (!canForce || change.id !== id) return
    let dispatched = false
    const result = await action.run(async () => {
      if (!allowed((await authorization.effective()).grants))
        throw { cause: 'client', code: 'forbidden' }
      dispatched = true
      return devices.forceRetirement(change.id, change.operationId, change.reason)
    })
    // A failed authority read did not send a new revocation. If this was an
    // explicit retry, keep any earlier unknown write and its original identity.
    if (!dispatched) {
      if (outcome !== 'unknown') {
        setPending(null)
        setApproved(false)
      }
      return
    }
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
    <Card title={l('退管进度', 'Retirement progress')}>
      <p className="subtitle">
        {l(
          '输入已受理的退管标识查看状态；清理、原生退管与撤销效果分别由后台确认。',
          'Read an accepted retirement by its ID. The backend separately confirms cleanup, native unenrollment and revocation effects.',
        )}
      </p>
      <Form
        className="admin-toolbar"
        layout="inline"
        onFinish={() => {
          if (locked) return
          const next = new URLSearchParams(params)
          if (draft) next.set('retirement', draft)
          else next.delete('retirement')
          setParams(next)
          read.reload()
        }}
      >
        <Form.Item label={l('退管标识', 'Retirement ID')}>
          <Input
            aria-label={l('退管标识', 'Retirement ID')}
            value={draft}
            disabled={pending !== null && outcome !== 'confirmed'}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="UUID"
          />
        </Form.Item>
        <Button htmlType="submit">{l('读取退管状态', 'Read retirement')}</Button>
      </Form>
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      <Failure error={action.error} locale={locale} />
      {read.value && (
        <>
          <p>
            {l('创建时间', 'Created')} · {timestamp(locale, read.value.createdAt)} ·{' '}
            {l('强制撤销请求时间', 'Force requested')} · {timestamp(locale, read.value.forcedAt)}
          </p>
          <DataTable
            locale={locale}
            dataSource={read.value.channels}
            rowKey={(row) => `${row.device}/${row.registration}/${row.generation}`}
            columns={[
              { title: l('终端', 'Endpoint'), dataIndex: 'device' },
              { title: l('通道', 'Channel'), dataIndex: 'channel' },
              { title: l('注册代次', 'Generation'), dataIndex: 'generation' },
              {
                title: l('阶段', 'Stage'),
                dataIndex: 'stage',
                render: (value) => <Status value={String(value)} locale={locale} />,
              },
              {
                title: l('效果', 'Effect'),
                dataIndex: 'effect',
                render: (value) => <Status value={String(value)} locale={locale} />,
              },
              { title: l('受阻原因', 'Block reason'), dataIndex: 'reason' },
            ]}
          />
          {canForce && (
            <div className="device-editor">
              <Input.TextArea
                aria-label={l('强制撤销理由', 'Force-revocation reason')}
                value={reason}
                maxLength={2048}
                disabled={pending !== null || action.busy}
                onChange={(event) => setReason(event.target.value)}
              />
              <Checkbox
                checked={approved}
                disabled={pending !== null || action.busy}
                onChange={(event) => setApproved(event.target.checked)}
              >
                {l(
                  '理解此操作请求撤销注册，不证明设备已完成原生退管',
                  'I understand revocation does not prove native unenrollment completed',
                )}
              </Checkbox>
              <Button
                danger
                disabled={!approved || !reason.trim() || pending !== null || action.busy}
                onClick={() => {
                  const change = Object.freeze({ id, operationId: crypto.randomUUID(), reason })
                  setPending(change)
                  void force(change)
                }}
              >
                {l('请求强制撤销', 'Request forced revocation')}
              </Button>
            </div>
          )}
        </>
      )}
      {outcome === 'confirmed' && (
        <Alert
          type="info"
          title={l(
            '后台已受理撤销，效果仍待确认。请重新读取退管状态。',
            'Revocation accepted; its effect remains pending. Read retirement status again.',
          )}
        />
      )}
      {pending && outcome !== 'confirmed' && (
        <div className="admin-recovery">
          <code>{pending.operationId}</code>
          <Space wrap>
            {outcome === 'rejected' ? (
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
                {l('放弃已拒绝请求并重读', 'Discard rejected request and read again')}
              </Button>
            ) : (
              <Button disabled={action.busy || !canForce} onClick={() => void force(pending)}>
                {l('显式重提原撤销请求', 'Resubmit original revocation request')}
              </Button>
            )}
          </Space>
        </div>
      )}
    </Card>
  )
}
