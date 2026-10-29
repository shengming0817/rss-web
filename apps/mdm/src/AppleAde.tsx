import { validateInput } from './AdminUi'
import { validateAdeConfiguration } from '@rss/mdm-enrollment'
import { usePendingSelection } from './SelectionGuard'
import { useState } from 'react'
import { Alert, Button, Checkbox, Collapse, Form, Input, Select, Space } from 'antd'
import {
  setupPanes,
  validateAdeCommand,
  type AdeCommand,
  type AdeConfiguration,
  type AdeProfile,
  type AdeSetup,
} from '@rss/mdm-enrollment'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import {
  CursorControls,
  DirectoryControls,
  Failure,
  isUnknown,
  labels,
  ReadState,
  directoryQuery,
  type Query,
  useAction,
  useRead,
} from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { Status, timestamp } from './DevicePresentation'
import { inputFingerprint, useProtectedDelivery } from './useProtectedDelivery'
type SafeCommand =
  | Exclude<AdeCommand, { kind: 'token' }>
  | { kind: 'token'; expectedRevision: number }
type Pending =
  | { kind: 'configuration'; operationId: string; input: AdeConfiguration }
  | { kind: 'command'; operationId: string; command: SafeCommand; fingerprint: string | null }
export function AppleAde({
  runtime,
  locale,
  organizationId,
  creating,
  canWrite,
  onCreated,
}: {
  runtime: Runtime
  locale: Locale
  organizationId: string
  creating: boolean
  canWrite: boolean
  onCreated(): void
}) {
  const l = labels(locale),
    { appleEnrollment: apple, binding } = useAdministration(runtime),
    action = useAction(),
    [localCreating, setLocalCreating] = useState(false),
    [profileQuery, setProfileQuery] = useState<Query>({ limit: 20 }),
    [deviceQuery, setDeviceQuery] = useState<Query>({ limit: 20 }),
    [selectedProfile, setSelectedProfile] = useState<AdeProfile | null>(null),
    [newProfile, setNewProfile] = useState<string>(),
    [pending, setPending] = useState<Pending | null>(null),
    [outcome, setOutcome] = useState<'none' | 'unknown' | 'rejected' | 'accepted'>('none'),
    [token, setToken] = useState(''),
    [fullSync, setFullSync] = useState(false),
    [serials, setSerials] = useState(''),
    [operationId, setOperationId] = useState(''),
    [operationDraft, setOperationDraft] = useState(''),
    [remoteProfile, setRemoteProfile] = useState(''),
    read = useRead(`${binding}/ade/${organizationId}/${creating || localCreating}`, () =>
      (creating || localCreating) && pending === null
        ? Promise.resolve(null)
        : apple.ade(organizationId),
    ),
    profiles = useRead(
      `${binding}/ade-profiles/${organizationId}/${creating}/${JSON.stringify(profileQuery)}`,
      () =>
        creating
          ? Promise.resolve(null)
          : apple.adeProfiles(
              organizationId,
              directoryQuery(profileQuery, [
                'id',
                'revision',
                'remoteUuid',
                'configuration',
              ] as const),
            ),
    ),
    devices = useRead(
      `${binding}/ade-devices/${organizationId}/${creating}/${JSON.stringify(deviceQuery)}`,
      () =>
        creating
          ? Promise.resolve(null)
          : apple.adeDevices(
              organizationId,
              directoryQuery(deviceQuery, [
                'serial',
                'deleted',
                'profileUuid',
                'observedAt',
                'registration',
              ] as const),
            ),
    ),
    operation = useRead(`${binding}/ade-operation/${organizationId}/${operationId}`, () =>
      operationId ? apple.adeOperation(organizationId, operationId) : Promise.resolve(null),
    ),
    delivery = useProtectedDelivery(() => setToken(''), canWrite)
  const terminal =
    pending &&
    operation.value?.operationId === pending.operationId &&
    ['succeeded', 'failed', 'superseded'].includes(operation.value.state)
  function refresh() {
    read.reload()
    profiles.reload()
    devices.reload()
  }
  usePendingSelection(
    action.busy || (pending !== null && !['accepted', 'rejected'].includes(outcome)),
  )
  async function submit(original: Pending, secret = '') {
    const result = await action.run(async () => {
      if (original.kind === 'configuration')
        return apple.configureAde(organizationId, original.operationId, original.input)
      if (original.command.kind === 'token') {
        if ((await inputFingerprint(secret)) !== original.fingerprint)
          throw { cause: 'client', code: 'input_changed' }
        return apple.adeCommand(organizationId, original.operationId, {
          ...original.command,
          p7m: secret,
        })
      }
      return apple.adeCommand(organizationId, original.operationId, original.command)
    })
    setOutcome((previous) =>
      result.ok
        ? 'accepted'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) {
      setLocalCreating(false)
      onCreated()
      setOperationId(original.operationId)
      setOperationDraft(original.operationId)
      operation.reload()
      refresh()
    }
  }
  async function command(value: AdeCommand) {
    const checked = await action.run(async () => {
      validateAdeCommand(value)
      if (value.kind === 'token')
        return {
          kind: 'command' as const,
          operationId: crypto.randomUUID(),
          command: { kind: 'token' as const, expectedRevision: value.expectedRevision },
          fingerprint: await inputFingerprint(value.p7m),
        }
      return {
        kind: 'command' as const,
        operationId: crypto.randomUUID(),
        command: structuredClone(value),
        fingerprint: null,
      }
    })
    if (checked.ok) {
      setPending(checked.value)
      setOutcome('none')
      void submit(checked.value, value.kind === 'token' ? value.p7m : '')
    }
  }
  return (
    <>
      <Alert
        type="info"
        title={l(
          'ADE 配置、同步与远端分配不代表设备已注册。外部组织和设备资格仍未观察。',
          'ADE configuration, sync and remote assignment do not imply device enrollment. External organization and device eligibility remain unobserved.',
        )}
      />
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      <Failure error={action.error} locale={locale} />
      {(creating || localCreating || read.value) && (
        <Form
          key={`${organizationId}/${read.value?.revision ?? 'new'}`}
          layout="vertical"
          disabled={!canWrite || action.busy || pending !== null}
          initialValues={
            read.value
              ? {
                  enabled: read.value.enabled,
                  serverUuid: read.value.serverUuid,
                  orgId: read.value.orgId,
                  rotateKey: false,
                }
              : { enabled: false, serverUuid: '', orgId: '', rotateKey: false }
          }
          onFinish={(value: Omit<AdeConfiguration, 'expectedRevision'>) => {
            const change: Pending = {
              kind: 'configuration',
              operationId: crypto.randomUUID(),
              input: { ...value, expectedRevision: read.value?.revision ?? 0 },
            }
            void action
              .run(async () => {
                validateInput(() => validateAdeConfiguration(change.input))
                return change
              })
              .then((result) => {
                if (result.ok) {
                  setPending(result.value)
                  void submit(result.value)
                }
              })
          }}
        >
          <Form.Item
            name="serverUuid"
            label={l('Apple ADE 服务器 UUID', 'Apple ADE server UUID')}
            rules={[
              { required: true },
              { pattern: /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/ },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="orgId"
            label={l('Apple 组织标识', 'Apple organization ID')}
            rules={[{ required: true }]}
          >
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item name="enabled" valuePropName="checked">
            <Checkbox>{l('启用 ADE 接入', 'Enable ADE integration')}</Checkbox>
          </Form.Item>
          <Form.Item name="rotateKey" valuePropName="checked">
            <Checkbox>
              {l('明确轮换 ADE 解密密钥', 'Explicitly rotate the ADE decryption key')}
            </Checkbox>
          </Form.Item>
          {canWrite && (
            <Button type="primary" htmlType="submit">
              {l('保存 ADE 配置', 'Save ADE configuration')}
            </Button>
          )}
        </Form>
      )}
      {canWrite &&
        read.error &&
        typeof read.error === 'object' &&
        'status' in read.error &&
        read.error.status === 404 && (
          <Button disabled={pending !== null || action.busy} onClick={() => setLocalCreating(true)}>
            {l(
              '为此组织创建初始 ADE 配置',
              'Create initial ADE configuration for this organization',
            )}
          </Button>
        )}
      <Button onClick={refresh}>{l('重新读取 ADE 状态', 'Read ADE state again')}</Button>
      {read.value && (
        <>
          <dl className="device-facts">
            <div>
              <dt>{l('令牌状态', 'Token state')}</dt>
              <dd>
                <Status value={read.value.tokenState} locale={locale} /> ·{' '}
                {timestamp(locale, read.value.tokenExpiresAt)}
              </dd>
            </div>
            <div>
              <dt>{l('上次同步', 'Last synchronized')}</dt>
              <dd>{timestamp(locale, read.value.syncedAt)}</dd>
            </div>
          </dl>
          <Button
            onClick={() => {
              delivery.clear()
              const ticket = delivery.capture()
              void action.run(async () =>
                delivery.deliver(await apple.adePublicKey(organizationId), ticket),
              )
            }}
          >
            {l('下载 ADE 加密公钥', 'Download ADE encryption public key')}
          </Button>
          {delivery.download && (
            <a href={delivery.download.url} download={delivery.download.filename}>
              {l('保存 ADE 公钥', 'Save ADE public key')}
            </a>
          )}
          {canWrite && (
            <Collapse
              items={[
                {
                  key: 'token',
                  label: l('导入组织 server token', 'Import organization server token'),
                  children: (
                    <div className="device-editor">
                      <input
                        type="file"
                        accept=".p7m"
                        aria-label={l('ADE p7m 文件', 'ADE p7m file')}
                        disabled={pending !== null || action.busy}
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          event.target.value = ''
                          delivery.clear()
                          setToken('')
                          const ticket = delivery.capture()
                          void action
                            .run(async () => {
                              if (!file || file.size < 1 || file.size > 180 * 1024)
                                throw { cause: 'client', code: 'invalid_input' }
                              const bytes = new Uint8Array(await file.arrayBuffer())
                              try {
                                let binary = ''
                                for (const byte of bytes) binary += String.fromCharCode(byte)
                                return btoa(binary)
                              } finally {
                                bytes.fill(0)
                              }
                            })
                            .then((result) => {
                              if (result.ok && delivery.isCurrent(ticket)) setToken(result.value)
                            })
                        }}
                      />
                      <p>
                        {token
                          ? l(
                              '令牌已在内存准备，提交或隐藏后清除。',
                              'Token prepared in memory; it is cleared on submission or hide.',
                            )
                          : l('尚未选择令牌。', 'No token selected.')}
                      </p>
                      <Button
                        disabled={!token || pending !== null || action.busy}
                        onClick={() => {
                          const p7m = token
                          setToken('')
                          void command({
                            kind: 'token',
                            expectedRevision: read.value!.revision,
                            p7m,
                          })
                        }}
                      >
                        {l('提交 ADE 组织令牌', 'Submit ADE organization token')}
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          )}
          <Space wrap>
            <Checkbox
              checked={fullSync}
              disabled={pending !== null || action.busy}
              onChange={(event) => setFullSync(event.target.checked)}
            >
              {l('完整同步', 'Full sync')}
            </Checkbox>
            {canWrite && (
              <Button
                disabled={pending !== null || action.busy}
                onClick={() => void command({ kind: 'sync', full: fullSync })}
              >
                {l('请求 ADE 同步', 'Request ADE sync')}
              </Button>
            )}
          </Space>
          <h2>{l('ADE 配置描述文件', 'ADE setup profiles')}</h2>
          <DirectoryControls
            locale={locale}
            query={profileQuery}
            onChange={setProfileQuery}
            fields={['id', 'revision', 'remoteUuid', 'configuration']}
            sort={['id', 'revision', 'remoteUuid']}
            maximum={1000}
          />
          <ReadState busy={profiles.busy} error={profiles.error} locale={locale} />
          {profiles.value && (
            <>
              <DataTable
                locale={locale}
                dataSource={profiles.value.items}
                rowKey="id"
                columns={[
                  {
                    title: l('配置标识', 'Profile ID'),
                    dataIndex: 'id',
                    render: (_, row) => (
                      <Button
                        type="link"
                        disabled={pending !== null || action.busy}
                        onClick={() =>
                          void action
                            .run(async () => {
                              const page = await apple.adeProfiles(organizationId, {
                                filter: `id=='${row.id}'`,
                                limit: 1,
                              })
                              const full = page.items[0]
                              if (
                                !full ||
                                full.id !== row.id ||
                                full.revision === undefined ||
                                !full.configuration ||
                                page.nextCursor !== null
                              )
                                throw new Error('Missing full ADE profile')
                              return full
                            })
                            .then((result) => {
                              if (result.ok) {
                                setSelectedProfile(result.value)
                                setNewProfile(undefined)
                              }
                            })
                        }
                      >
                        {row.id}
                      </Button>
                    ),
                  },
                  { title: l('版本', 'Revision'), dataIndex: 'revision' },
                  { title: l('远端标识', 'Remote profile'), dataIndex: 'remoteUuid' },
                ]}
              />
              <CursorControls
                locale={locale}
                query={profileQuery}
                onChange={setProfileQuery}
                next={profiles.value.nextCursor}
                count={profiles.value.items.length}
              />
            </>
          )}
          {canWrite && (
            <Button
              disabled={pending !== null || action.busy}
              onClick={() => {
                setSelectedProfile(null)
                setNewProfile(crypto.randomUUID())
              }}
            >
              {l('新建 ADE 配置描述文件', 'Create ADE setup profile')}
            </Button>
          )}
          {(newProfile || selectedProfile?.configuration) && (
            <Form
              key={`${newProfile ?? selectedProfile?.id}/${selectedProfile?.revision ?? 0}`}
              layout="vertical"
              initialValues={
                selectedProfile?.configuration ?? {
                  name: '',
                  mandatory: true,
                  removable: false,
                  skip: [],
                }
              }
              disabled={!canWrite || pending !== null || action.busy}
              onFinish={(configuration: AdeSetup) =>
                void command({
                  kind: 'profile',
                  id: newProfile ?? selectedProfile!.id,
                  expectedRevision: selectedProfile?.revision ?? 0,
                  configuration,
                })
              }
            >
              <Form.Item
                name="name"
                label={l('配置名称', 'Profile name')}
                rules={[{ required: true }]}
              >
                <Input maxLength={128} />
              </Form.Item>
              <Form.Item name="mandatory" valuePropName="checked">
                <Checkbox>{l('必须注册', 'Mandatory enrollment')}</Checkbox>
              </Form.Item>
              <Form.Item name="removable" valuePropName="checked">
                <Checkbox>{l('允许移除', 'Removable')}</Checkbox>
              </Form.Item>
              <Form.Item name="skip" label={l('跳过的系统设置项', 'Skipped setup panes')}>
                <Select
                  mode="multiple"
                  options={setupPanes.map((value) => ({ value, label: value }))}
                />
              </Form.Item>
              {canWrite && (
                <Button htmlType="submit">
                  {l('保存 ADE 配置描述文件', 'Save ADE setup profile')}
                </Button>
              )}
            </Form>
          )}
          <h2>{l('Apple 组织设备', 'Apple organization devices')}</h2>
          <DirectoryControls
            locale={locale}
            query={deviceQuery}
            onChange={setDeviceQuery}
            fields={['serial', 'deleted', 'profileUuid', 'observedAt', 'registration']}
            sort={['serial', 'deleted', 'profileUuid', 'observedAt']}
            required="serial"
            maximum={1000}
          />
          <ReadState busy={devices.busy} error={devices.error} locale={locale} />
          {devices.value && (
            <>
              <DataTable
                locale={locale}
                dataSource={devices.value.items}
                rowKey="serial"
                columns={[
                  { title: l('序列号', 'Serial'), dataIndex: 'serial' },
                  { title: l('远端配置', 'Remote profile'), dataIndex: 'profileUuid' },
                  {
                    title: l('已删除', 'Deleted'),
                    dataIndex: 'deleted',
                    render: (value) =>
                      value === true ? l('是', 'Yes') : value === false ? l('否', 'No') : '—',
                  },
                  {
                    title: l('观察时间', 'Observed at'),
                    dataIndex: 'observedAt',
                    render: (_, row) => timestamp(locale, row.observedAt),
                  },
                  {
                    title: l('注册含义', 'Enrollment implication'),
                    render: () => l('不代表设备已注册', 'Device enrollment is not implied'),
                  },
                ]}
              />
              <CursorControls
                locale={locale}
                query={deviceQuery}
                onChange={setDeviceQuery}
                next={devices.value.nextCursor}
                count={devices.value.items.length}
              />
            </>
          )}
          {canWrite && (
            <div className="device-editor">
              <Input.TextArea
                aria-label={l('分配目标序列号（每行一个）', 'Target serials (one per line)')}
                value={serials}
                disabled={pending !== null || action.busy}
                onChange={(event) => setSerials(event.target.value)}
              />
              <p>
                {l('选定完整配置版本', 'Selected full profile revision')} ·{' '}
                {selectedProfile?.id ?? '—'} / {selectedProfile?.revision ?? '—'}
              </p>
              <Space wrap>
                <Button
                  disabled={
                    pending !== null || action.busy || !serials.trim() || !selectedProfile?.revision
                  }
                  onClick={() =>
                    void command({
                      kind: 'assign',
                      profile: selectedProfile!.id,
                      revision: selectedProfile!.revision!,
                      devices: serials.split(/\s+/).filter(Boolean),
                    })
                  }
                >
                  {l('明确分配所选配置版本', 'Assign selected profile revision')}
                </Button>
                <Button
                  danger
                  disabled={pending !== null || action.busy || !serials.trim()}
                  onClick={() =>
                    void command({ kind: 'clear', devices: serials.split(/\s+/).filter(Boolean) })
                  }
                >
                  {l('清除这些设备的远端配置分配', 'Clear remote profile assignments')}
                </Button>
              </Space>
            </div>
          )}
        </>
      )}
      <h2>{l('ADE 原操作', 'Original ADE operation')}</h2>
      <Form
        className="admin-toolbar"
        layout="inline"
        onFinish={() => {
          setOperationId(operationDraft)
          operation.reload()
        }}
      >
        <Form.Item label={l('ADE 操作标识', 'ADE operation ID')}>
          <Input
            aria-label={l('ADE 操作标识', 'ADE operation ID')}
            value={operationDraft}
            disabled={pending !== null}
            onChange={(event) => setOperationDraft(event.target.value)}
          />
        </Form.Item>
        <Button htmlType="submit">{l('读取原 ADE 操作', 'Read original ADE operation')}</Button>
      </Form>
      <ReadState busy={operation.busy} error={operation.error} locale={locale} />
      {operation.value && (
        <>
          <p>
            <Status value={operation.value.state} locale={locale} /> · {operation.value.kind} ·{' '}
            {operation.value.operationId}
          </p>
          {typeof operation.value.result?.['reason'] === 'string' && (
            <p>{operation.value.result['reason']}</p>
          )}
          {operation.value.result?.['registration'] === 'not_implied' && (
            <p>{l('此结果不代表设备注册。', 'This result does not imply device enrollment.')}</p>
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
              {l('查询本次原操作', 'Query this original operation')}
            </Button>
            {outcome === 'rejected' || terminal ? (
              <Button
                disabled={action.busy}
                onClick={() => {
                  setPending(null)
                  setOutcome('none')
                  action.clear()
                  refresh()
                }}
              >
                {outcome === 'rejected'
                  ? l('放弃已拒绝请求并重读', 'Discard rejected request and read again')
                  : l('原操作已终结，读取最新版本', 'Original operation terminal; read latest')}
              </Button>
            ) : (
              <>
                <Button
                  disabled={
                    action.busy ||
                    (pending.kind === 'command' && pending.command.kind === 'token' && !token)
                  }
                  onClick={() => {
                    const secret = token
                    setToken('')
                    void submit(pending, secret)
                  }}
                >
                  {l('显式重提原 ADE 请求', 'Resubmit original ADE request')}
                </Button>
                {pending.kind === 'command' && pending.command.kind === 'token' && (
                  <Input.Password
                    aria-label={l(
                      '重提时输入原 p7m Base64',
                      'Original p7m Base64 for resubmission',
                    )}
                    value={token}
                    autoComplete="off"
                    onChange={(event) => setToken(event.target.value)}
                  />
                )}
              </>
            )}
          </Space>
        </div>
      )}
      {canWrite &&
        operation.value?.state === 'unknown' &&
        (!pending || pending.operationId === operation.value.operationId) && (
          <div className="device-editor">
            <Alert
              type="warning"
              title={l(
                '外部结果未知。可显式协调原操作，或在独立核对远端配置后指定其 UUID；不会自动重放外部操作。',
                'The external result is unknown. Explicitly reconcile the original operation, or provide an independently verified remote profile UUID. External operations are never replayed automatically.',
              )}
            />
            <Space wrap>
              <Button
                disabled={action.busy}
                onClick={() =>
                  void command({ kind: 'reconcile', operation: operation.value!.operationId })
                }
              >
                {l('协调原 ADE 操作', 'Reconcile original ADE operation')}
              </Button>
              <Input
                aria-label={l(
                  '独立核对的远端配置 UUID',
                  'Independently verified remote profile UUID',
                )}
                value={remoteProfile}
                onChange={(event) => setRemoteProfile(event.target.value)}
              />
              <Button
                disabled={action.busy || !remoteProfile}
                onClick={() =>
                  void command({
                    kind: 'resolve',
                    operation: operation.value!.operationId,
                    remoteProfile,
                  })
                }
              >
                {l('明确关联远端配置结果', 'Resolve using verified remote profile')}
              </Button>
            </Space>
          </div>
        )}
    </>
  )
}
