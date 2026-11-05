import { useState } from 'react'
import { Alert, Button, Card, Checkbox, Form, Input, InputNumber, Select, Space } from 'antd'
import type {
  MailIntent,
  MailReceipt,
  StorageIntent,
  StorageReceipt,
  StorageSource,
  WnsIntent,
  WnsReceipt,
} from '@rss/mdm-connections'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import {
  CursorControls,
  Failure,
  isUnknown,
  labels,
  ReadState,
  type Query,
  useAction,
  useRead,
} from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { Status, timestamp } from './DevicePresentation'
import { inputFingerprint, useProtectedDelivery } from './useProtectedDelivery'
import { StorageMigration } from './StorageMigration'
type Receipt = StorageReceipt | MailReceipt | WnsReceipt
type Pending =
  | { kind: 'storage'; intent: StorageIntent; fingerprint: string }
  | { kind: 'mail'; intent: MailIntent; fingerprint: string }
  | { kind: 'wns'; intent: WnsIntent; fingerprint: string }
type Values = {
  profile: string
  sourceKind: 'generate' | 'import'
  accessKey: string
  secretKey: string
  sessionToken: string
  expiresAt: number | null
  sender: string
  recipient: string
  username: string
  password: string
  packageFamilyName: string
  sid: string
  clientSecret: string
}
function storageSource(values: Values, kind = values.sourceKind): StorageSource {
  return kind === 'generate'
    ? { kind }
    : {
        kind,
        access_key: values.accessKey ?? '',
        secret_key: values.secretKey ?? '',
        session_token: values.sessionToken || null,
        expires_at: values.expiresAt ?? null,
      }
}
function privateInput(
  kind: Pending['kind'],
  values: Values,
  sourceKind?: StorageSource['kind'],
): string {
  return JSON.stringify(
    kind === 'storage'
      ? storageSource(values, sourceKind)
      : kind === 'mail'
        ? { password: values.password ?? '' }
        : { clientSecret: values.clientSecret ?? '' },
  )
}
export function ProviderReceipt({ value, locale }: { value: Receipt; locale: Locale }) {
  const l = labels(locale)
  return (
    <dl className="device-facts">
      <div>
        <dt>{l('材料版本', 'Material revision')}</dt>
        <dd>{value.revision}</dd>
      </div>
      <div>
        <dt>{l('原操作', 'Original operation')}</dt>
        <dd>{value.operationId}</dd>
      </div>
      {'state' in value && (
        <div>
          <dt>{l('资格 / 测试状态', 'Qualification / test state')}</dt>
          <dd>
            <Status locale={locale} value={value.state} />
          </dd>
        </div>
      )}
      {'qualifiedAt' in value && (
        <div>
          <dt>{l('资格验证时间', 'Qualified at')}</dt>
          <dd>{timestamp(locale, value.qualifiedAt)}</dd>
        </div>
      )}
      {'acceptedAt' in value && (
        <div>
          <dt>{l('测试投递已接受', 'Test delivery accepted')}</dt>
          <dd>{timestamp(locale, value.acceptedAt)}</dd>
        </div>
      )}
      <div>
        <dt>{l('失败原因', 'Failure reason')}</dt>
        <dd>{value.failureReason ?? '—'}</dd>
      </div>
      {'revoked' in value && (
        <div>
          <dt>{l('已撤销', 'Revoked')}</dt>
          <dd>{value.revoked ? l('是', 'Yes') : l('否', 'No')}</dd>
        </div>
      )}
    </dl>
  )
}
export function ProviderConnections({
  runtime,
  locale,
  kind,
  canWrite,
}: {
  runtime: Runtime
  locale: Locale
  kind: 'storage' | 'mail' | 'wns'
  canWrite: boolean
}) {
  const l = labels(locale),
    { connections, binding } = useAdministration(runtime),
    action = useAction(),
    [form] = Form.useForm<Values>(),
    [recoveryForm] = Form.useForm<Values>(),
    sourceKind = Form.useWatch('sourceKind', form) ?? 'generate',
    [historyQuery, setHistoryQuery] = useState<Query>({ limit: 20 }),
    [operationId, setOperationId] = useState(''),
    [operationDraft, setOperationDraft] = useState(''),
    [pending, setPending] = useState<Pending | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    [revoke, setRevoke] = useState<{
      operationId: string
      expectedRevision: number
      materialRevision: number
    } | null>(null),
    [materialRevision, setMaterialRevision] = useState<number | null>(null),
    [revokeApproved, setRevokeApproved] = useState(false)
  const read = useRead(`${binding}/provider/${kind}`, async () =>
      kind === 'storage'
        ? connections.storage.read()
        : kind === 'mail'
          ? connections.mail.read()
          : connections.wns.read(),
    ),
    history = useRead(
      `${binding}/provider-history/${kind}/${JSON.stringify(historyQuery)}`,
      async () => {
        const page =
          kind === 'storage'
            ? await connections.storage.history(historyQuery)
            : kind === 'mail'
              ? await connections.mail.history(historyQuery)
              : await connections.wns.history(historyQuery)
        return { items: page.items as readonly Receipt[], nextCursor: page.nextCursor }
      },
    ),
    original = useRead(`${binding}/provider-operation/${kind}/${operationId}`, async () => {
      if (!operationId) return null
      if (kind === 'storage')
        return {
          kind: 'material' as const,
          receipt: await connections.storage.operation(operationId),
        }
      if (kind === 'mail')
        return { kind: 'material' as const, receipt: await connections.mail.operation(operationId) }
      return connections.wns.operation(operationId)
    })
  const clearPrivate = () => {
    form.setFieldsValue({
      accessKey: '',
      secretKey: '',
      sessionToken: '',
      password: '',
      clientSecret: '',
    })
    recoveryForm.resetFields()
  }
  useProtectedDelivery(clearPrivate, canWrite)
  function refresh() {
    read.reload()
    history.reload()
  }
  async function submit(change: Pending, values: Values) {
    const result = await action.run(async () => {
      if (
        (await inputFingerprint(
          privateInput(
            change.kind,
            values,
            change.kind === 'storage' ? change.intent.sourceKind : undefined,
          ),
        )) !== change.fingerprint
      )
        throw { cause: 'client', code: 'input_changed' }
      return change.kind === 'storage'
        ? connections.storage.save(change.intent, storageSource(values, change.intent.sourceKind))
        : change.kind === 'mail'
          ? connections.mail.save(change.intent, values.password ?? '')
          : connections.wns.save(change.intent, values.clientSecret ?? '')
    })
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) refresh()
  }
  async function prepare(values: Values) {
    clearPrivate()
    const result = await action.run(async (): Promise<Pending> => {
      const operationId = crypto.randomUUID(),
        expectedRevision = read.value!.revision,
        fingerprint = await inputFingerprint(privateInput(kind, values))
      if (kind === 'storage')
        return {
          kind,
          fingerprint,
          intent: connections.storage.prepare(
            operationId,
            expectedRevision,
            values.profile,
            storageSource(values),
          ),
        }
      if (kind === 'mail')
        return {
          kind,
          fingerprint,
          intent: connections.mail.prepare(
            {
              operationId,
              expectedRevision,
              profile: values.profile,
              sender: values.sender,
              recipient: values.recipient,
              username: values.username ?? '',
            },
            values.password ?? '',
          ),
        }
      return {
        kind,
        fingerprint,
        intent: connections.wns.prepare(
          {
            operationId,
            expectedRevision,
            packageFamilyName: values.packageFamilyName,
            sid: values.sid,
          },
          values.clientSecret,
        ),
      }
    })
    if (result.ok) {
      setPending(result.value)
      void submit(result.value, values)
    }
  }
  async function revokeWns(change: NonNullable<typeof revoke>) {
    const result = await action.run(() =>
      connections.wns.revoke(change.operationId, change.expectedRevision, change.materialRevision),
    )
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) refresh()
  }
  const selectedRevision = read.value
      ? 'activeRevision' in read.value
        ? read.value.activeRevision
        : 'selectedRevision' in read.value
          ? read.value.selectedRevision
          : read.value.desiredRevision
      : null,
    selectionLabel =
      kind === 'storage'
        ? l('有效存储凭据版本', 'Active storage credential revision')
        : kind === 'mail'
          ? l('选定邮件版本', 'Selected mail revision')
          : l('期望 Windows 推送版本', 'Desired Windows push revision'),
    title =
      kind === 'storage'
        ? l('对象存储连接', 'Object storage connection')
        : kind === 'mail'
          ? l('邮件连接与固定测试投递', 'Mail connection and fixed test delivery')
          : l('Windows 推送材料', 'Windows push material')
  function secretFields(recovery = false) {
    const prefix = recovery ? l('重提原输入：', 'Re-enter original: ') : ''
    return kind === 'storage' ? (
      <>
        {!recovery && (
          <Form.Item name="sourceKind" label={l('凭据来源', 'Credential source')}>
            <Select
              value={sourceKind}
              options={[
                { value: 'generate', label: l('由后台生成', 'Generate on backend') },
                { value: 'import', label: l('导入当前凭据', 'Import credentials') },
              ]}
            />
          </Form.Item>
        )}
        {((recovery && pending?.kind === 'storage' && pending.intent.sourceKind === 'import') ||
          (!recovery && sourceKind === 'import')) && (
          <>
            <Form.Item
              name="accessKey"
              label={prefix + l('Access key', 'Access key')}
              rules={[{ required: true }]}
            >
              <Input.Password autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="secretKey"
              label={prefix + l('Secret key', 'Secret key')}
              rules={[{ required: true }]}
            >
              <Input.Password autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="sessionToken"
              label={prefix + l('Session token（可选）', 'Session token (optional)')}
            >
              <Input.Password autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="expiresAt"
              label={
                prefix + l('凭据到期 UTC 秒（可选）', 'Credential expiry UTC seconds (optional)')
              }
            >
              <InputNumber min={1} precision={0} />
            </Form.Item>
          </>
        )}
      </>
    ) : kind === 'mail' ? (
      <Form.Item name="password" label={prefix + l('SMTP 密码', 'SMTP password')}>
        <Input.Password autoComplete="off" />
      </Form.Item>
    ) : (
      <Form.Item
        name="clientSecret"
        label={prefix + l('WNS Client secret', 'WNS client secret')}
        rules={[{ required: true }]}
      >
        <Input.Password autoComplete="off" />
      </Form.Item>
    )
  }
  return (
    <>
      <h2>{title}</h2>
      <Alert
        type="info"
        title={
          kind === 'storage'
            ? l(
                '材料资格通过不代表已切换存储。不同存储目标必须完成代次迁移。',
                'Qualified credentials do not establish storage cutover. A different storage target requires generation migration.',
              )
            : kind === 'mail'
              ? l(
                  '仅提交完整邮件设置并观察固定测试投递；accepted 不证明邮箱收件或其它系统通知已启用。',
                  'Submit complete mail settings and observe the fixed test delivery. Accepted does not prove inbox receipt or other notifications are enabled.',
                )
              : l(
                  '材料资格、期望版本与宿主已应用版本分别展示。',
                  'Material qualification, desired version and host-applied version are separate facts.',
                )
        }
      />
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      <Failure error={action.error} locale={locale} />
      {read.value && (
        <>
          <dl className="device-facts">
            <div>
              <dt>{l('材料登记版本', 'Material registry revision')}</dt>
              <dd>{read.value.revision}</dd>
            </div>
            <div>
              <dt>{selectionLabel}</dt>
              <dd>{selectedRevision ?? l('未选定', 'Not selected')}</dd>
            </div>
            {'applied' in read.value && (
              <div>
                <dt>{l('已应用材料版本', 'Applied material revision')}</dt>
                <dd>
                  {read.value.applied?.revision ?? l('尚无应用观察', 'No application observation')}
                </dd>
              </div>
            )}
          </dl>
          {read.value.latest && (
            <Card title={l('最新材料回执', 'Latest material receipt')}>
              <ProviderReceipt value={read.value.latest} locale={locale} />
            </Card>
          )}
          <Form
            key={read.value.revision}
            form={form}
            layout="vertical"
            disabled={!canWrite || action.busy || pending !== null || revoke !== null}
            initialValues={{
              profile:
                read.value.latest && 'profile' in read.value.latest
                  ? read.value.latest.profile
                  : '',
              sourceKind: 'generate',
              sender: '',
              recipient: '',
              username: '',
              password: '',
              packageFamilyName: '',
              sid: '',
              clientSecret: '',
            }}
            onFinish={(values) => void prepare(values)}
          >
            {kind !== 'wns' && (
              <Form.Item
                name="profile"
                label={l('部署端连接配置别名', 'Deployment connection profile')}
                rules={[{ required: true }]}
              >
                <Input maxLength={512} />
              </Form.Item>
            )}
            {kind === 'mail' && (
              <>
                <Form.Item
                  name="sender"
                  label={l('测试发件地址', 'Test sender')}
                  rules={[{ required: true }]}
                >
                  <Input maxLength={512} />
                </Form.Item>
                <Form.Item
                  name="recipient"
                  label={l('固定测试收件地址', 'Fixed test recipient')}
                  rules={[{ required: true }]}
                >
                  <Input maxLength={512} />
                </Form.Item>
                <Form.Item name="username" label={l('SMTP 账户', 'SMTP username')}>
                  <Input maxLength={512} />
                </Form.Item>
              </>
            )}
            {kind === 'wns' && (
              <>
                <Form.Item
                  name="packageFamilyName"
                  label={l('Package Family Name', 'Package Family Name')}
                  rules={[{ required: true }]}
                >
                  <Input maxLength={512} />
                </Form.Item>
                <Form.Item name="sid" label="SID" rules={[{ required: true }]}>
                  <Input maxLength={512} />
                </Form.Item>
              </>
            )}
            {secretFields()}
            {canWrite && (
              <Button type="primary" htmlType="submit">
                {l('提交完整连接配置', 'Submit complete connection configuration')}
              </Button>
            )}
          </Form>
        </>
      )}
      <Button onClick={refresh}>
        {l('读取连接状态与版本', 'Read connection state and versions')}
      </Button>
      <ReadState busy={history.busy} error={history.error} locale={locale} />
      {history.value && (
        <>
          <DataTable<Receipt>
            locale={locale}
            dataSource={history.value.items}
            rowKey="revision"
            columns={[
              {
                title: l('版本', 'Revision'),
                dataIndex: 'revision',
                render: (_, row) => (
                  <Button
                    type="link"
                    onClick={() => {
                      setOperationDraft(row.operationId)
                      setOperationId(row.operationId)
                    }}
                  >
                    {row.revision}
                  </Button>
                ),
              },
              { title: l('原操作', 'Original operation'), dataIndex: 'operationId' },
              {
                title: l('资格 / 测试', 'Qualification / test'),
                render: (_, row) =>
                  'state' in row ? (
                    <Status value={row.state} locale={locale} />
                  ) : 'selected' in row ? (
                    row.qualifiedAt !== null ? (
                      l('资格曾通过', 'Previously qualified')
                    ) : (
                      l('资格未确认', 'Qualification unconfirmed')
                    )
                  ) : (
                    '—'
                  ),
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
      <Form
        className="admin-toolbar"
        layout="inline"
        onFinish={() => {
          setOperationId(operationDraft)
          original.reload()
        }}
      >
        <Form.Item label={l('原连接操作标识', 'Original connection operation ID')}>
          <Input
            aria-label={l('原连接操作标识', 'Original connection operation ID')}
            value={operationDraft}
            onChange={(event) => setOperationDraft(event.target.value)}
          />
        </Form.Item>
        <Button htmlType="submit">
          {l('查询原连接操作', 'Read original connection operation')}
        </Button>
      </Form>
      <ReadState busy={original.busy} error={original.error} locale={locale} />
      {original.value &&
        (original.value.kind === 'material' ? (
          <ProviderReceipt value={original.value.receipt} locale={locale} />
        ) : (
          <p>
            {l('撤销材料版本', 'Revoked material revision')} ·{' '}
            {original.value.receipt.materialRevision}
          </p>
        ))}
      {pending && (
        <div className="admin-recovery">
          <code>{pending.intent.operationId}</code>
          {outcome === 'confirmed' ||
          outcome === 'rejected' ||
          original.value?.receipt.operationId === pending.intent.operationId ? (
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
                ? l('放弃已拒绝提交并重读', 'Discard rejected submission and read again')
                : l('原材料已登记，读取最新状态', 'Original material recorded; read latest state')}
            </Button>
          ) : (
            <>
              <Button
                onClick={() => {
                  setOperationId(pending.intent.operationId)
                  setOperationDraft(pending.intent.operationId)
                  original.reload()
                }}
              >
                {l('查询本次原操作', 'Query this original operation')}
              </Button>
              <Alert
                type="warning"
                title={l(
                  '原提交未知，先查询原操作。如需重提，必须重新输入相同秘密；页面不保留秘密。',
                  'Original outcome unknown. Query it first. Resubmission requires the same private input; the page does not retain it.',
                )}
              />
              <Form
                form={recoveryForm}
                layout="vertical"
                disabled={action.busy || !canWrite}
                onFinish={(values) => {
                  clearPrivate()
                  void submit(pending, values)
                }}
              >
                {secretFields(true)}
                <Button htmlType="submit">
                  {l('显式重提原连接请求', 'Resubmit original connection request')}
                </Button>
              </Form>
            </>
          )}
        </div>
      )}
      {kind === 'wns' && canWrite && read.value && (
        <div className="device-editor">
          <InputNumber
            aria-label={l('要撤销的 WNS 材料版本', 'WNS material revision to revoke')}
            min={1}
            precision={0}
            value={materialRevision}
            disabled={pending !== null || revoke !== null}
            onChange={(value) => setMaterialRevision(value === null ? null : Number(value))}
          />
          <Checkbox
            checked={revokeApproved}
            disabled={pending !== null || revoke !== null}
            onChange={(event) => setRevokeApproved(event.target.checked)}
          >
            {l('确认撤销指定推送材料', 'Confirm revocation of the selected push material')}
          </Checkbox>
          <Button
            danger
            disabled={
              !materialRevision ||
              !revokeApproved ||
              pending !== null ||
              revoke !== null ||
              action.busy
            }
            onClick={() => {
              const change = Object.freeze({
                operationId: crypto.randomUUID(),
                expectedRevision: read.value!.revision,
                materialRevision: materialRevision!,
              })
              setRevoke(change)
              void revokeWns(change)
            }}
          >
            {l('撤销 WNS 材料', 'Revoke WNS material')}
          </Button>
        </div>
      )}
      {revoke && (
        <div className="admin-recovery">
          <code>{revoke.operationId}</code>
          {outcome === 'confirmed' ||
          outcome === 'rejected' ||
          original.value?.receipt.operationId === revoke.operationId ? (
            <Button
              onClick={() => {
                setRevoke(null)
                setOutcome('none')
                setRevokeApproved(false)
                action.clear()
                refresh()
              }}
            >
              {l('结束原撤销并读取最新状态', 'Finish original revocation and read latest')}
            </Button>
          ) : (
            <Space wrap>
              <Button
                onClick={() => {
                  setOperationId(revoke.operationId)
                  original.reload()
                }}
              >
                {l('查询原推送撤销', 'Read original push revocation')}
              </Button>
              <Button disabled={action.busy} onClick={() => void revokeWns(revoke)}>
                {l('显式重提原推送撤销', 'Resubmit original push revocation')}
              </Button>
            </Space>
          )}
        </div>
      )}
      {kind === 'storage' && (
        <StorageMigration runtime={runtime} locale={locale} canWrite={canWrite} />
      )}
    </>
  )
}
