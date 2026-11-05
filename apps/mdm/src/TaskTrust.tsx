import { useEffect, useState } from 'react'
import { Alert, Button, Card, Checkbox, Form, Input, Space } from 'antd'
import type { Trust, TrustChange } from '@rss/mdm-execution'
import { freeze } from '@rss/mdm-inventory'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, ReadState, useAction, usePageRead } from './AdminUi'
import { DataTable } from './DataTable'
import { Status, timestamp } from './DevicePresentation'
import { useAdministration } from './useAdministration'
import { usePendingSelection } from './SelectionGuard'
export function TaskTrust({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { execution, authorization, binding } = useAdministration(runtime),
    permissions = usePageRead(`${binding}/task-trust-permissions`, authorization.effective),
    has = (operation: string) =>
      permissions.value?.grants.some(
        (g) => g.operation === operation && g.scope.kind === 'tenant',
      ) ?? false,
    canRead = has('registration_configuration_read'),
    canWrite = has('registration_configuration_write'),
    read = usePageRead(`${binding}/task-trust/${canRead}`, () =>
      canRead ? execution.trust() : Promise.resolve(null),
    ),
    action = useAction(),
    [approved, setApproved] = useState(false),
    [pending, setPending] = useState<{ id: string; input: TrustChange } | null>(null),
    [outcome, setOutcome] = useState('none'),
    [receipt, setReceipt] = useState<Trust | null>(null),
    [draft, setDraft] = useState(''),
    [device, setDevice] = useState(''),
    observation = usePageRead(`${binding}/task-trust-observation/${device}`, () =>
      device ? execution.trustObservation(device) : Promise.resolve(null),
    )
  useEffect(() => setApproved(false), [canWrite, read.value?.revision])
  usePendingSelection(action.busy || outcome === 'unknown')
  async function change(input: TrustChange) {
    if (!approved || !canWrite || pending) return
    const original = freeze({ id: crypto.randomUUID(), input })
    setPending(original)
    setApproved(false)
    const result = await action.run(() => execution.changeTrust(original.id, original.input))
    setOutcome(result.ok ? 'confirmed' : isUnknown(result.error) ? 'unknown' : 'rejected')
    if (result.ok) {
      setReceipt(result.value)
      read.reload()
    }
  }
  async function original() {
    if (!pending) return
    const result = await action.run(() => execution.trustOperation(pending.id))
    if (result.ok) {
      setReceipt(result.value)
      setOutcome('confirmed')
    }
  }
  return (
    <Card title={l('任务签名信任', 'Task signing trust')}>
      <Space wrap>
        <Button
          onClick={() => {
            permissions.reload()
            read.reload()
          }}
        >
          {l('读取信任与当前权限', 'Read trust and current permissions')}
        </Button>
        <Button
          disabled={!canRead || action.busy || outcome === 'unknown'}
          onClick={() => {
            setPending(null)
            setReceipt(null)
            setOutcome('none')
          }}
        >
          {l('开始下一次信任变更', 'Start another trust change')}
        </Button>
      </Space>
      <ReadState
        locale={locale}
        busy={permissions.busy || read.busy}
        error={permissions.error ?? read.error}
      />
      {read.value && (
        <>
          <p>
            {l('服务 / 租户 / 版本', 'Service / tenant / revision')}: {read.value.serviceId} /{' '}
            {read.value.tenant} / {read.value.revision}
          </p>
          <DataTable
            locale={locale}
            rowKey="id"
            dataSource={read.value.keys}
            columns={[
              { title: l('签名 Key', 'Signing key'), dataIndex: 'id' },
              {
                title: l('状态', 'State'),
                render: (_, row) => <Status locale={locale} value={row.state} />,
              },
              { title: l('公钥', 'Public key'), dataIndex: 'publicKey' },
              {
                title: l('操作', 'Action'),
                render: (_, row) => (
                  <Space wrap>
                    <Button
                      disabled={
                        !canWrite ||
                        !approved ||
                        !!pending ||
                        action.busy ||
                        row.state !== 'prepared'
                      }
                      onClick={() =>
                        void change({
                          action: 'activate',
                          expectedRevision: read.value!.revision,
                          keyId: row.id,
                        })
                      }
                    >
                      {l('激活', 'Activate')}
                    </Button>
                    <Button
                      disabled={
                        !canWrite ||
                        !approved ||
                        !!pending ||
                        action.busy ||
                        row.state !== 'verify_only'
                      }
                      onClick={() =>
                        void change({
                          action: 'retire',
                          expectedRevision: read.value!.revision,
                          keyId: row.id,
                        })
                      }
                    >
                      {l('退休', 'Retire')}
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
          <Checkbox
            checked={approved}
            disabled={!canWrite || !!pending || action.busy}
            onChange={(e) => setApproved(e.target.checked)}
          >
            {l(
              '已核对信任版本、设备分发与轮换影响',
              'I reviewed the trust revision, device distribution and rotation impact',
            )}
          </Checkbox>
          <Button
            disabled={!canWrite || !approved || !!pending || action.busy}
            onClick={() =>
              void change({ action: 'prepare', expectedRevision: read.value!.revision })
            }
          >
            {l('准备新的签名 Key', 'Prepare a new signing key')}
          </Button>
        </>
      )}
      <Failure locale={locale} error={action.error} />
      {pending && (
        <>
          <p>
            {l('原操作', 'Original operation')}: {pending.id} · {outcome}
          </p>
          <Button disabled={!canRead || action.busy} onClick={() => void original()}>
            {l('查询原信任变更', 'Read original trust change')}
          </Button>
        </>
      )}
      {receipt && canRead && (
        <p>
          {l('原回执版本', 'Original receipt revision')}: {receipt.revision}
        </p>
      )}
      <Form
        layout="inline"
        className="admin-toolbar"
        onFinish={() => {
          if (device === draft) observation.reload()
          else setDevice(draft)
        }}
      >
        <Form.Item label={l('设备 ID', 'Device ID')}>
          <Input
            aria-label={l('信任观察设备 ID', 'Trust observation device ID')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </Form.Item>
        <Button htmlType="submit">{l('读取设备信任观察', 'Read device trust observation')}</Button>
      </Form>
      {device && (
        <>
          <ReadState
            locale={locale}
            busy={observation.busy}
            error={observation.error}
            empty={observation.value === null}
          />
          {observation.value && (
            <p>
              {observation.value.registration} @{observation.value.generation} ·{' '}
              {observation.value.state} · {l('目标 / 实际版本', 'Target / actual revision')}:{' '}
              {observation.value.targetRevision ?? '—'} / {observation.value.actualRevision ?? '—'}{' '}
              · {timestamp(locale, observation.value.receivedAt)}
            </p>
          )}
        </>
      )}
      <Alert
        type="info"
        showIcon
        title={l(
          '服务器信任、设备安装报告、轮换 ACK 和当前连通是不同事实。没有设备观察时保持未知。',
          'Server trust, reported device installation, rotation ACK and current connectivity are distinct. Missing observations remain unknown.',
        )}
      />
    </Card>
  )
}
