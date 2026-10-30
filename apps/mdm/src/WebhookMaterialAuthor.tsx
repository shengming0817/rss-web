import type { WebhookMaterialRecovery } from './webhook-material-recovery'
import { useEffect, useId, useState } from 'react'
import { Alert, Button, Card, Descriptions, Form, Input, InputNumber, Select, Space } from 'antd'
import { Link } from 'react-router-dom'
import type {
  MaterialDirectory,
  MaterialInput,
  MaterialTransition,
  Webhooks,
} from '@rss/mdm-webhooks'
import type { Locale } from './i18n'
import { codeOf, Failure, labels, useAction } from './AdminUi'
import { useWebhookMaterial } from './useWebhookMaterial'
import { WebhookMaterialFacts } from './WebhookMaterialFacts'
import { auditHref } from './audit-context'

type Fields = {
  operationId: string
  reference: string
  expectedRevision: number
  configurationSha256: string
  endpoint: string
  networkReference: string
  secret?: string
  materialRevision?: number
}
export function WebhookMaterialAuthor({
  webhooks,
  directory,
  reference,
  locale,
  canRead,
  canWrite,
  blocked,
  onChanged,
  onClose,
  materialRecovery,
  binding,
  canReauthenticate,
}: {
  webhooks: Webhooks
  directory: MaterialDirectory | undefined
  reference: string
  locale: Locale
  canRead: boolean
  canWrite: boolean
  blocked: boolean
  onChanged: () => void
  onClose: () => void
  materialRecovery: WebhookMaterialRecovery
  binding: string
  canReauthenticate: boolean
}) {
  const l = labels(locale),
    prefix = useId(),
    [form] = Form.useForm<Fields>(),
    [authenticationForm] = Form.useForm<{ password: string }>(),
    authentication = useAction(),
    [authenticated, setAuthenticated] = useState(false),
    [kind, setKind] = useState<'prepare' | 'activate' | 'revoke' | 'retire_previous'>('prepare'),
    [source, setSource] = useState<'generate' | 'import'>('generate'),
    command = useWebhookMaterial(
      webhooks,
      canRead,
      canWrite,
      () => {
        form.resetFields()
        authenticationForm.resetFields()
        setAuthenticated(false)
      },
      { owner: materialRecovery, binding },
    ),
    disabled =
      !canWrite ||
      blocked ||
      command.restoring ||
      command.action.busy ||
      authentication.busy ||
      !!command.pending
  useEffect(() => {
    if (!canWrite) form.resetFields()
  }, [canWrite, form])
  function useCurrent() {
    if (!directory || command.pending) return
    const selected = form.getFieldValue('reference') || reference,
      head = directory.heads.find((head) => head.reference === selected)
    form.setFieldsValue({
      reference: selected,
      expectedRevision: head?.revision ?? 0,
      configurationSha256: directory.configurationSha256,
      operationId: crypto.randomUUID(),
    })
  }
  async function submit(value: Fields) {
    form.resetFields(['secret'])
    if (kind === 'prepare') {
      const input: MaterialInput = {
        reference: value.reference,
        expectedRevision: value.expectedRevision,
        configurationSha256: value.configurationSha256,
        endpoint: value.endpoint,
        networkReference: value.networkReference,
        source:
          source === 'generate'
            ? { kind: 'generate' }
            : { kind: 'import', secret: value.secret ?? '' },
      }
      const result = await command.prepare(value.operationId, input)
      if (result?.ok) onChanged()
    } else {
      const input: MaterialTransition = {
        reference: value.reference,
        expectedRevision: value.expectedRevision,
        action:
          kind === 'retire_previous'
            ? { kind }
            : { kind, materialRevision: value.materialRevision ?? 0 },
      }
      const result = await command.transition(value.operationId, input)
      if (result?.ok) onChanged()
    }
  }
  return (
    <Card
      title={l('签名材料操作', 'Signing material action')}
      extra={
        <Button disabled={command.action.busy} onClick={onClose}>
          {l('关闭材料任务', 'Close material task')}
        </Button>
      }
    >
      <Alert
        type="info"
        title={l(
          '材料写入要求最近 300 秒内认证。准备与持钥确认、激活分开；私密交付和接收端确认由宿主完成。',
          'Material writes require authentication within 300 seconds. Preparation, key possession confirmation and activation are separate; the host owns private handoff and receiver confirmation.',
        )}
      />
      <details open={command.restored || undefined}>
        <summary>{l('在此任务内重新认证', 'Reauthenticate within this task')}</summary>
        {canReauthenticate ? (
          <Form
            name={prefix + '-reauthenticate'}
            form={authenticationForm}
            layout="vertical"
            preserve={false}
            disabled={!canWrite || command.action.busy || authentication.busy}
            onFinish={(value) => {
              authenticationForm.resetFields()
              setAuthenticated(false)
              void authentication
                .run(() =>
                  materialRecovery.reauthenticate(
                    value.password,
                    command.pending ? { pending: command.pending, outcome: command.outcome } : null,
                  ),
                )
                .then((result) => {
                  if (result.ok) setAuthenticated(true)
                })
            }}
          >
            <Form.Item
              name="password"
              label={l('材料操作重新认证密码', 'Password to reauthenticate material actions')}
              rules={[{ required: true }]}
            >
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Button
              htmlType="submit"
              disabled={!canWrite || command.action.busy || authentication.busy}
            >
              {l('重新认证并保留原操作', 'Reauthenticate and retain the original operation')}
            </Button>
          </Form>
        ) : (
          <p className="subtitle">
            {l(
              '当前身份没有本地密码重新认证能力。宿主认证若重建会话，请保留原操作 UUID，在新会话显式读取原回执，再按完整原输入恢复。',
              'Local-password reauthentication is unavailable for this identity. If host authentication replaces the session, retain the original operation UUID, explicitly read its receipt in the new session, and recover from complete original inputs.',
            )}
          </p>
        )}
        <Failure error={authentication.error} locale={locale} />
        {(authenticated || command.restored) && (
          <Alert
            type="success"
            title={l(
              '重新认证已完成，请显式读取或重提原操作。',
              'Reauthentication completed. Explicitly read or resubmit the original operation.',
            )}
          />
        )}
      </details>
      {!command.pending && (
        <>
          <Space wrap>
            <Select
              aria-label={l('材料操作类型', 'Material action kind')}
              disabled={disabled}
              value={kind}
              onChange={(kind) => {
                setKind(kind)
                form.resetFields()
              }}
              options={[
                { value: 'prepare', label: l('准备新材料', 'Prepare new material') },
                { value: 'activate', label: l('激活已确认材料', 'Activate confirmed material') },
                { value: 'revoke', label: l('撤销精确材料', 'Revoke exact material') },
                {
                  value: 'retire_previous',
                  label: l('结束旧材料退役', 'Retire previous material'),
                },
              ]}
            />
            <Button disabled={disabled || !directory} onClick={useCurrent}>
              {l('采用当前读取的配置版本', 'Use the currently read configuration revision')}
            </Button>
          </Space>
          <Form
            name={prefix + '-author'}
            form={form}
            layout="vertical"
            preserve={false}
            disabled={disabled}
            initialValues={{ reference, expectedRevision: 0, operationId: crypto.randomUUID() }}
            onFinish={(value) => void submit(value)}
          >
            <Form.Item
              name="reference"
              label={l('材料签名引用', 'Material signing reference')}
              rules={[{ required: true }]}
            >
              <Input autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="expectedRevision"
              label={l('原 head CAS 版本', 'Original head CAS revision')}
              rules={[{ required: true }]}
            >
              <InputNumber min={0} precision={0} />
            </Form.Item>
            {kind === 'prepare' ? (
              <>
                <Form.Item label={l('材料来源', 'Material source')}>
                  <Select
                    aria-label={l('材料来源', 'Material source')}
                    value={source}
                    onChange={(source) => {
                      setSource(source)
                      form.resetFields(['secret'])
                    }}
                    options={[
                      { value: 'generate', label: l('服务端生成', 'Generate on server') },
                      {
                        value: 'import',
                        label: l('导入接收端密钥', 'Import receiver signing key'),
                      },
                    ]}
                  />
                </Form.Item>
                <Form.Item
                  name="endpoint"
                  label={l('确认接收地址', 'Confirmation receiver endpoint')}
                  rules={[{ required: true }]}
                >
                  <Input autoComplete="off" placeholder="https://receiver.example/events" />
                </Form.Item>
                <Form.Item
                  name="networkReference"
                  label={l('确认网络引用', 'Confirmation network reference')}
                  rules={[{ required: true }]}
                >
                  <Input autoComplete="off" />
                </Form.Item>
                <Form.Item
                  name="configurationSha256"
                  label={l('原宿主配置 SHA-256', 'Original host configuration SHA-256')}
                  rules={[{ required: true }]}
                >
                  <Input autoComplete="off" />
                </Form.Item>
                {source === 'import' && (
                  <Form.Item
                    name="secret"
                    label={l('导入签名密钥', 'Imported signing secret')}
                    rules={[{ required: true }]}
                  >
                    <Input.Password autoComplete="off" />
                  </Form.Item>
                )}
              </>
            ) : (
              kind !== 'retire_previous' && (
                <Form.Item
                  name="materialRevision"
                  label={l('精确材料版本', 'Exact material revision')}
                  rules={[{ required: true }]}
                >
                  <InputNumber min={1} precision={0} />
                </Form.Item>
              )
            )}
            <details>
              <summary>{l('精确原操作', 'Exact original operation')}</summary>
              <Form.Item
                name="operationId"
                label={l('材料原操作 UUID', 'Original material operation UUID')}
                rules={[{ required: true }]}
              >
                <Input autoComplete="off" />
              </Form.Item>
            </details>
            <Button htmlType="submit" type="primary" disabled={disabled}>
              {l('提交材料操作', 'Submit material action')}
            </Button>
          </Form>
          {kind === 'revoke' && (
            <p className="subtitle">
              {l(
                '撤销当前材料会使签名失败关闭，不会自动回退到旧密钥。',
                'Revoking active material fails signing closed; no automatic fallback to an older key.',
              )}
            </p>
          )}
        </>
      )}
      {codeOf(command.action.error) === 'reauthentication_required' ? (
        <Alert
          type="warning"
          title={l(
            '请在此任务内重新认证，再显式读取或重提原操作。原 UUID 和冻结输入继续保留。',
            'Reauthenticate within this task, then explicitly read or resubmit the original operation. Its UUID and frozen input are retained.',
          )}
        />
      ) : (
        <Failure error={command.action.error} locale={locale} />
      )}
      {command.pending && (
        <>
          <Descriptions column={1} size="small">
            <Descriptions.Item label={l('冻结原操作', 'Frozen original operation')}>
              {command.pending.operationId}
            </Descriptions.Item>
            <Descriptions.Item label={l('冻结签名引用', 'Frozen signing reference')}>
              {command.pending.input.reference}
            </Descriptions.Item>
            <Descriptions.Item label={l('冻结 head CAS 版本', 'Frozen head CAS revision')}>
              {command.pending.input.expectedRevision}
            </Descriptions.Item>
            <Descriptions.Item label={l('冻结材料动作', 'Frozen material action')}>
              {command.pending.kind === 'prepare'
                ? command.pending.input.source
                : command.pending.input.action.kind}
              {command.pending.kind === 'transition' &&
              command.pending.input.action.kind !== 'retire_previous'
                ? ` · ${command.pending.input.action.materialRevision}`
                : ''}
            </Descriptions.Item>
          </Descriptions>
          {command.outcome === 'unknown' && (
            <Alert
              type="warning"
              title={l(
                '原写入结果未知。查询未找到不证明写入失败；先查询原操作或显式重提同一请求。',
                'The original write outcome is unknown. A missing query result does not prove failure; read the original operation or explicitly resubmit the same request.',
              )}
            />
          )}
          {command.outcome === 'confirmed' && (
            <Alert
              type="success"
              title={l(
                '原材料操作回执已确认；持钥确认、当前激活和外部投递分别读取。',
                'Original material receipt acknowledged; key confirmation, current activation and external delivery remain separate reads.',
              )}
            />
          )}
          <Space wrap>
            <Button
              disabled={!canRead || command.action.busy}
              onClick={() =>
                void command.lookup().then((result) => {
                  if (result?.ok) onChanged()
                })
              }
            >
              {l('读取冻结材料原操作', 'Read frozen material operation')}
            </Button>
            <Link to={auditHref({ operationId: command.pending.operationId })}>
              {l('定位原操作审计', 'Audit for the original operation')}
            </Link>
          </Space>
          <Form
            name={prefix + '-resume'}
            form={form}
            layout="vertical"
            preserve={false}
            disabled={!canWrite || command.action.busy || authentication.busy}
            onFinish={(value) => {
              form.resetFields(['secret'])
              void command.replay(value.secret ?? '').then((result) => {
                if (result?.ok) onChanged()
              })
            }}
          >
            {command.pending.kind === 'prepare' && command.pending.input.source === 'import' && (
              <Form.Item
                name="secret"
                label={l(
                  '重新输入相同原签名密钥',
                  'Re-enter the identical original signing secret',
                )}
                rules={[{ required: true }]}
              >
                <Input.Password autoComplete="off" />
              </Form.Item>
            )}
            <Button
              htmlType="submit"
              disabled={!canWrite || command.action.busy || authentication.busy}
            >
              {l('显式重提原材料请求', 'Resubmit original material request')}
            </Button>
          </Form>
          {command.outcome !== 'unknown' && (
            <Button disabled={command.action.busy} onClick={command.next}>
              {l('开始新的材料操作', 'Start a new material operation')}
            </Button>
          )}
        </>
      )}
      {canRead && command.observed && (
        <>
          <Alert
            type="info"
            title={l(
              '原操作记录已读取，记录未包含完整动作或材料来源，尚不能确认本次原请求。请显式重提原 UUID 和冻结输入。',
              'The original operation record was read. It does not include the complete action or material source and cannot confirm this request. Explicitly resubmit its original UUID and frozen input.',
            )}
          />
          <WebhookMaterialFacts value={command.observed} locale={locale} />
        </>
      )}
      {(canRead || canWrite) && command.receipt && (
        <WebhookMaterialFacts value={command.receipt} locale={locale} />
      )}
    </Card>
  )
}
