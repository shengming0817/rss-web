import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { Alert, Button, Card, Checkbox, Form, Input, Space, Typography } from 'antd'
import type { Trust, TrustChange } from '@rss/mdm-task-trust'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, ReadState, useAction, usePageRead } from './AdminUi'
import { DataTable } from './DataTable'
import { Status, timestamp } from './DevicePresentation'
import { useAdministration } from './useAdministration'
import { devicePermission } from './DeviceSecurity'
type TrustOperation = {
  id: string
  status: 'submitting' | 'confirmed' | 'unknown' | 'rejected'
}
const TaskTrustOperation = createContext<
  [TrustOperation | null, Dispatch<SetStateAction<TrustOperation | null>>] | null
>(null)

export function TaskTrustSession({ children }: { children: ReactNode }) {
  const operation = useState<TrustOperation | null>(null)
  return <TaskTrustOperation.Provider value={operation}>{children}</TaskTrustOperation.Provider>
}

export function TaskTrust({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const operation = useContext(TaskTrustOperation)
  if (!operation) throw new Error('Missing authenticated task trust scope')
  const [pending, setPending] = operation
  const l = labels(locale),
    { taskTrust, authorization, binding } = useAdministration(runtime),
    permissions = usePageRead(`${binding}/task-trust-permissions`, authorization.effective),
    has = (operation: string) =>
      !permissions.busy &&
      !permissions.error &&
      (permissions.value?.grants.some(
        (g) => g.operation === operation && g.scope.kind === 'tenant',
      ) ??
        false),
    canRead = has('registration_configuration_read'),
    canWrite = has('registration_configuration_write'),
    read = usePageRead(`${binding}/task-trust/${canRead}`, () =>
      canRead ? taskTrust.trust() : Promise.resolve(null),
    ),
    write = useAction(),
    lookup = useAction(),
    busy = write.busy || lookup.busy || pending?.status === 'submitting',
    [approved, setApproved] = useState(false),
    [receipt, setReceipt] = useState<{ id: string; trust: Trust } | null>(null),
    [knownOperation, setKnownOperation] = useState(''),
    [draft, setDraft] = useState(''),
    [device, setDevice] = useState(''),
    grants = permissions.busy || permissions.error ? [] : (permissions.value?.grants ?? []),
    canObserveDevices = grants.some(
      (grant) =>
        grant.operation === 'inventory_read' &&
        (grant.scope.kind === 'all_devices' || grant.scope.kind === 'device'),
    ),
    canObserve = !!device && devicePermission(grants, device, 'inventory_read'),
    observation = usePageRead(`${binding}/task-trust-observation/${device}/${canObserve}`, () =>
      canObserve ? taskTrust.trustObservation(device) : Promise.resolve(null),
    )
  useEffect(() => setApproved(false), [canWrite, read.value?.revision])
  function settle(id: string, status: TrustOperation['status']) {
    setPending((current) => (current?.id === id ? { id, status } : current))
  }
  async function change(input: TrustChange) {
    if (!approved || !canRead || !canWrite || pending || busy) return
    const id = crypto.randomUUID()
    setPending({ id, status: 'submitting' })
    setApproved(false)
    setReceipt(null)
    lookup.clear()
    const result = await write.run(() => taskTrust.changeTrust(id, input))
    settle(id, result.ok ? 'confirmed' : isUnknown(result.error) ? 'unknown' : 'rejected')
    if (result.ok) {
      setReceipt({ id, trust: result.value })
      read.reload()
    }
  }
  async function original(id: string) {
    if (!canRead || !id || busy) return
    setReceipt(null)
    if (pending?.id === id) write.clear()
    const result = await lookup.run(() => taskTrust.trustOperation(id))
    if (result.ok) {
      setReceipt({ id, trust: result.value })
      settle(id, 'confirmed')
      read.reload()
    }
  }
  return (
    <Card title={<h1>{l('任务签名信任', 'Task signing trust')}</h1>}>
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
          disabled={!canRead || busy || pending?.status === 'unknown'}
          onClick={() => {
            setPending(null)
            setReceipt(null)
            write.clear()
            lookup.clear()
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
      {!permissions.busy && !permissions.error && !canRead && !canObserveDevices && (
        <Alert
          type="info"
          title={l(
            '当前权限无法读取任务签名信任。',
            'Current permissions restrict task signing trust.',
          )}
        />
      )}
      {canRead && read.value && (
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
                        !canWrite || !approved || !!pending || busy || row.state !== 'prepared'
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
                        !canWrite || !approved || !!pending || busy || row.state !== 'verify_only'
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
            disabled={!canWrite || !!pending || busy}
            onChange={(e) => setApproved(e.target.checked)}
          >
            {l(
              '已核对信任版本、设备分发与轮换影响',
              'I reviewed the trust revision, device distribution and rotation impact',
            )}
          </Checkbox>
          <Button
            disabled={!canWrite || !approved || !!pending || busy}
            onClick={() =>
              void change({ action: 'prepare', expectedRevision: read.value!.revision })
            }
          >
            {l('准备新的签名 Key', 'Prepare a new signing key')}
          </Button>
        </>
      )}
      <Failure locale={locale} error={write.error} />
      <Failure locale={locale} error={lookup.error} kind="read" />
      {pending && canRead && (
        <>
          <p>
            {l('原操作', 'Original operation')}{' '}
            <Typography.Text code copyable={{ text: pending.id }}>
              {pending.id}
            </Typography.Text>{' '}
            ·{' '}
            {
              {
                submitting: l('正在提交', 'Submitting'),
                confirmed: l('已确认', 'Confirmed'),
                unknown: l('结果未确认', 'Outcome unconfirmed'),
                rejected: l('已拒绝', 'Rejected'),
              }[pending.status]
            }
          </p>
          {pending.status === 'unknown' && (
            <p>
              {l(
                '可复制编号，在刷新或重新登录后按编号查询原回执。',
                'Copy the ID to recover the original receipt after a refresh or new sign-in.',
              )}
            </p>
          )}
          <Button disabled={busy} onClick={() => void original(pending.id)}>
            {l('查询原信任变更', 'Read original trust change')}
          </Button>
        </>
      )}
      {canRead && !pending && (
        <Form
          layout="inline"
          className="admin-toolbar"
          onFinish={() => void original(knownOperation.trim())}
        >
          <Form.Item label={l('原信任操作编号', 'Original trust operation ID')}>
            <Input
              aria-label={l('原信任操作编号', 'Original trust operation ID')}
              value={knownOperation}
              disabled={busy}
              onChange={(event) => {
                setKnownOperation(event.target.value)
                setReceipt(null)
                lookup.clear()
              }}
            />
          </Form.Item>
          <Button htmlType="submit" disabled={busy || !knownOperation.trim()}>
            {l('按编号查询原信任变更', 'Read original trust change by ID')}
          </Button>
        </Form>
      )}
      {receipt && canRead && (
        <p>
          {l('原回执版本', 'Original receipt revision')}: {receipt.trust.revision} ·{' '}
          <code>{receipt.id}</code>
        </p>
      )}
      {canObserveDevices && (
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
          <Button
            htmlType="submit"
            disabled={!draft || !devicePermission(grants, draft, 'inventory_read')}
          >
            {l('读取设备信任观察', 'Read device trust observation')}
          </Button>
        </Form>
      )}
      {canObserve && (
        <>
          <ReadState
            locale={locale}
            busy={observation.busy}
            error={observation.error}
            empty={observation.value === null}
          />
          {observation.value && (
            <p>
              {observation.value.device} · {observation.value.state} ·{' '}
              {l('目标 / 实际版本', 'Target / actual revision')}:{' '}
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
