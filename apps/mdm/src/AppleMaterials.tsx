import { useState } from 'react'
import { Alert, Button, Card, Form, Input, InputNumber, Select } from 'antd'
import type { AppleCommand, ApplePurpose } from '@rss/mdm-connections'
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
type SafeCommand =
  | Exclude<AppleCommand, { kind: 'certificate' }>
  | { kind: 'certificate'; expectedRevision: number; keyRevision: number }
type Pending = { operationId: string; command: SafeCommand; fingerprint: string | null }
type Values = {
  kind: AppleCommand['kind']
  sourceKind: 'generate' | 'import'
  privateKeyPem: string
  certificateChainPem: string
  keyRevision: number
  materialRevision: number
  accountAlias: string
}
export function AppleMaterials({
  runtime,
  locale,
  purpose,
  canWrite,
}: {
  runtime: Runtime
  locale: Locale
  purpose: ApplePurpose
  canWrite: boolean
}) {
  const l = labels(locale),
    { connections, binding } = useAdministration(runtime),
    apple = connections.apple,
    action = useAction(),
    [form] = Form.useForm<Values>(),
    [recovery] = Form.useForm<{ material: string }>(),
    kind = Form.useWatch('kind', form) ?? 'key',
    sourceKind = Form.useWatch('sourceKind', form) ?? 'generate',
    [historyQuery, setHistoryQuery] = useState<Query>({ limit: 20 }),
    [pending, setPending] = useState<Pending | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    [operationId, setOperationId] = useState(''),
    [operationDraft, setOperationDraft] = useState(''),
    read = useRead(`${binding}/apple-materials/${purpose}`, () => apple.read(purpose)),
    history = useRead(
      `${binding}/apple-material-versions/${purpose}/${JSON.stringify(historyQuery)}`,
      () => apple.history(purpose, historyQuery),
    ),
    original = useRead(`${binding}/apple-material-operation/${operationId}`, () =>
      operationId ? apple.operation(operationId) : Promise.resolve(null),
    )
  const clearInputs = () => {
    form.setFieldsValue({ privateKeyPem: '', certificateChainPem: '' })
    recovery.resetFields()
  }
  useProtectedDelivery(clearInputs, canWrite)
  function refresh() {
    read.reload()
    history.reload()
  }
  async function submit(change: Pending, material = '') {
    const result = await action.run(async () => {
      if (change.fingerprint !== null && (await inputFingerprint(material)) !== change.fingerprint)
        throw { cause: 'client', code: 'input_changed' }
      const command: AppleCommand =
        change.command.kind === 'certificate'
          ? { ...change.command, certificateChainPem: material }
          : change.command
      return apple.submit(
        purpose,
        change.operationId,
        command,
        change.command.kind === 'key' && change.command.sourceKind === 'import'
          ? material
          : undefined,
      )
    })
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) {
      setOperationId(change.operationId)
      setOperationDraft(change.operationId)
      original.reload()
      refresh()
    }
  }
  async function prepare(values: Values) {
    clearInputs()
    const result = await action.run(async () => {
      const expectedRevision = read.value!.revision,
        operationId = crypto.randomUUID(),
        command: AppleCommand =
          values.kind === 'key'
            ? { kind: 'key', expectedRevision, sourceKind: values.sourceKind }
            : values.kind === 'certificate'
              ? {
                  kind: 'certificate',
                  expectedRevision,
                  keyRevision: values.keyRevision,
                  certificateChainPem: values.certificateChainPem,
                }
              : values.kind === 'apply'
                ? {
                    kind: 'apply',
                    expectedRevision,
                    materialRevision: values.materialRevision,
                    accountAlias: values.accountAlias || null,
                  }
                : { kind: 'revoke', expectedRevision, materialRevision: values.materialRevision },
        material =
          values.kind === 'certificate'
            ? values.certificateChainPem
            : values.kind === 'key' && values.sourceKind === 'import'
              ? values.privateKeyPem
              : ''
      apple.prepare(
        purpose,
        operationId,
        command,
        values.kind === 'key' && values.sourceKind === 'import' ? material : undefined,
      )
      const safe: SafeCommand =
        command.kind === 'certificate'
          ? {
              kind: command.kind,
              expectedRevision: command.expectedRevision,
              keyRevision: command.keyRevision,
            }
          : command
      return {
        change: {
          operationId,
          command: safe,
          fingerprint: material ? await inputFingerprint(material) : null,
        },
        material,
      }
    })
    if (result.ok) {
      setPending(result.value.change)
      void submit(result.value.change, result.value.material)
    }
  }
  return (
    <>
      <Alert
        type="info"
        title={l(
          'Apple 连接材料只管理 APNs、配置签名和受管账户用途。设备 PKI、恢复材料和任务签名由各自模块持有。应用请求与宿主加载观察独立。',
          'Apple connection materials cover APNs, profile signing and managed accounts. Device PKI, recovery and task-signing materials have separate owners. Application requests and host-loaded observations are distinct.',
        )}
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
              <dt>{l('期望材料版本', 'Desired material revision')}</dt>
              <dd>{read.value.desiredRevision ?? '—'}</dd>
            </div>
            <div>
              <dt>{l('宿主加载', 'Host loading')}</dt>
              <dd>{l('在独立运行观察中确认', 'Confirmed by a separate runtime observation')}</dd>
            </div>
          </dl>
          <Form
            key={`${purpose}/${read.value.revision}`}
            form={form}
            layout="vertical"
            initialValues={{
              kind: 'key',
              sourceKind: 'generate',
              accountAlias: '',
              privateKeyPem: '',
              certificateChainPem: '',
            }}
            disabled={!canWrite || action.busy || pending !== null}
            onFinish={(values) => void prepare(values)}
          >
            <Form.Item name="kind" label={l('材料操作', 'Material action')}>
              <Select
                options={[
                  {
                    value: 'key',
                    label: l('生成或导入密钥 / CSR', 'Generate or import key / CSR'),
                  },
                  { value: 'certificate', label: l('导入证书链', 'Import certificate chain') },
                  { value: 'apply', label: l('请求应用指定材料', 'Request material application') },
                  { value: 'revoke', label: l('撤销指定材料', 'Revoke material') },
                ]}
              />
            </Form.Item>
            {kind === 'key' && (
              <>
                <Form.Item name="sourceKind" label={l('密钥来源', 'Key source')}>
                  <Select
                    options={[
                      { value: 'generate', label: l('后台生成', 'Generate on backend') },
                      { value: 'import', label: l('导入私钥', 'Import private key') },
                    ]}
                  />
                </Form.Item>
                {sourceKind === 'import' && (
                  <Form.Item
                    name="privateKeyPem"
                    label={l('私钥 PEM（提交后清除）', 'Private key PEM (cleared on submission)')}
                    rules={[{ required: true }]}
                  >
                    <Input.TextArea
                      rows={8}
                      autoComplete="off"
                      maxLength={262144}
                      spellCheck={false}
                    />
                  </Form.Item>
                )}
              </>
            )}
            {kind === 'certificate' && (
              <>
                <Form.Item
                  name="keyRevision"
                  label={l('对应密钥版本', 'Key revision')}
                  rules={[{ required: true }]}
                >
                  <InputNumber min={1} precision={0} />
                </Form.Item>
                <Form.Item
                  name="certificateChainPem"
                  label={l(
                    '证书链 PEM（提交后清除输入）',
                    'Certificate chain PEM (input cleared on submission)',
                  )}
                  rules={[{ required: true }]}
                >
                  <Input.TextArea rows={8} maxLength={262144} spellCheck={false} />
                </Form.Item>
              </>
            )}
            {(kind === 'apply' || kind === 'revoke') && (
              <Form.Item
                name="materialRevision"
                label={l('指定材料版本', 'Material revision')}
                rules={[{ required: true }]}
              >
                <InputNumber min={1} precision={0} />
              </Form.Item>
            )}
            {kind === 'apply' && (
              <Form.Item
                name="accountAlias"
                label={l('受管账户密钥别名（可选）', 'Managed-account key alias (optional)')}
              >
                <Input maxLength={256} />
              </Form.Item>
            )}
            {canWrite && (
              <Button htmlType="submit" danger={kind === 'revoke'} type="primary">
                {l('明确提交材料操作', 'Submit material action')}
              </Button>
            )}
          </Form>
        </>
      )}
      <Button onClick={refresh}>{l('读取材料与版本', 'Read materials and versions')}</Button>
      <ReadState busy={history.busy} error={history.error} locale={locale} />
      {history.value && (
        <>
          <DataTable
            locale={locale}
            dataSource={history.value.items}
            rowKey="revision"
            columns={[
              { title: l('版本', 'Revision'), dataIndex: 'revision' },
              { title: l('密钥标识', 'Key ID'), dataIndex: 'keyId' },
              { title: l('主题', 'Topic'), dataIndex: 'topic' },
              {
                title: l('到期', 'Expires'),
                dataIndex: 'expiresAt',
                render: (_, row) => timestamp(locale, row.expiresAt),
              },
              {
                title: l('撤销', 'Revoked'),
                dataIndex: 'revoked',
                render: (value) => (value ? l('是', 'Yes') : l('否', 'No')),
              },
              {
                title: l('公开 CSR', 'Public CSR'),
                render: (_, row) => (
                  <details>
                    <summary>{l('查看 CSR', 'View CSR')}</summary>
                    <pre className="material-public-text">{row.csr}</pre>
                  </details>
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
        <Form.Item label={l('原 Apple 材料操作标识', 'Original Apple material operation ID')}>
          <Input
            aria-label={l('原 Apple 材料操作标识', 'Original Apple material operation ID')}
            value={operationDraft}
            onChange={(event) => setOperationDraft(event.target.value)}
          />
        </Form.Item>
        <Button htmlType="submit">{l('读取原材料操作', 'Read original material operation')}</Button>
      </Form>
      <ReadState busy={original.busy} error={original.error} locale={locale} />
      {original.value && (
        <Card title={l('Apple 材料回执', 'Apple material receipt')}>
          <Status locale={locale} value={original.value.state} />
          <p>
            {l('登记版本', 'Registry revision')} · {original.value.revision}
          </p>
          {original.value.state === 'awaiting_certificate' && (
            <pre className="material-public-text">{original.value.csr}</pre>
          )}
          {original.value.state === 'pending_application' && (
            <Alert
              type="info"
              title={l(
                '材料应用请求已登记；请单独核对宿主已加载版本。',
                'Application request recorded; separately verify the host-loaded revision.',
              )}
            />
          )}
        </Card>
      )}
      {pending && (
        <div className="admin-recovery">
          <code>{pending.operationId}</code>
          {outcome === 'confirmed' ||
          outcome === 'rejected' ||
          original.value?.operationId === pending.operationId ? (
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
                ? l('放弃已拒绝材料请求并重读', 'Discard rejected material request and read again')
                : l(
                    '原材料操作已登记，读取最新版本',
                    'Original material action recorded; read latest',
                  )}
            </Button>
          ) : (
            <>
              <Button
                onClick={() => {
                  setOperationId(pending.operationId)
                  setOperationDraft(pending.operationId)
                  original.reload()
                }}
              >
                {l('查询本次原材料操作', 'Query this original material action')}
              </Button>
              {pending.fingerprint !== null ? (
                <Form
                  form={recovery}
                  layout="vertical"
                  disabled={action.busy || !canWrite}
                  onFinish={(values) => {
                    clearInputs()
                    void submit(pending, values.material)
                  }}
                >
                  <Form.Item
                    name="material"
                    label={l(
                      '显式重提需要原始 PEM 输入',
                      'Original PEM input for explicit resubmission',
                    )}
                    rules={[{ required: true }]}
                  >
                    <Input.TextArea rows={8} autoComplete="off" spellCheck={false} />
                  </Form.Item>
                  <Button htmlType="submit">
                    {l('显式重提原材料请求', 'Resubmit original material request')}
                  </Button>
                </Form>
              ) : (
                <Button disabled={action.busy || !canWrite} onClick={() => void submit(pending)}>
                  {l('显式重提原材料请求', 'Resubmit original material request')}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}
