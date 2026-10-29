import { useId, useEffect, useState } from 'react'
import { Alert, Button, Card, Form, Input, Select, Space, Switch } from 'antd'
import type { ViewEndpoint } from '@rss/mdm-devices'
import { freeze, identifier, revision, uuid } from '@rss/mdm-inventory'
import {
  validateRegistration,
  type ConfigureFileVault,
  type FileVaultConfiguration,
  type RecoveryCredentials,
  type Registration,
} from '@rss/mdm-recovery-credentials'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, ReadState, useAction, useRead, validateInput } from './AdminUi'
import { Status } from './DevicePresentation'
import { usePendingSelection } from './SelectionGuard'
export function FileVaultCredentials({
  credentials,
  endpoint,
  locale,
  permitted,
}: {
  credentials: RecoveryCredentials
  endpoint: ViewEndpoint
  locale: Locale
  permitted: boolean
}) {
  const formPrefix = useId()

  const l = labels(locale),
    channels = endpoint.channels.filter((channel) => channel.status === 'active'),
    [selection, setSelection] = useState<Registration | null>(() =>
      channels.length === 1
        ? { registration: channels[0]!.registrationId, generation: channels[0]!.generation }
        : null,
    ),
    read = useRead(
      `filevault-configuration/${endpoint.id}/${selection?.registration ?? ''}/${selection?.generation ?? ''}/${permitted}`,
      () =>
        permitted && selection
          ? credentials.configuration(endpoint.id, selection)
          : Promise.resolve(null),
    ),
    action = useAction(),
    [form] = Form.useForm<{ enabled: boolean; recipientId: string }>(),
    [linkForm] = Form.useForm<{ otherDevice: string }>(),
    [pending, setPending] = useState<
      | { kind: 'configure'; input: ConfigureFileVault }
      | { kind: 'link'; operationId: string; otherDevice: string }
      | null
    >(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    [receipt, setReceipt] = useState<FileVaultConfiguration | null>(null)
  usePendingSelection(!!pending || action.busy)
  useEffect(() => {
    if (read.value && !pending)
      form.setFieldsValue({
        enabled: read.value.enabled,
        recipientId: read.value.recipientId ?? '',
      })
  }, [read.value, pending, form])
  async function submit(change: NonNullable<typeof pending>) {
    if (!permitted) return
    const original = freeze(change)
    const result = await action.run(async () => {
      validateInput(() => {
        if (original.kind === 'configure') {
          uuid(original.input.operationId)
          validateRegistration(original.input)
          revision(original.input.expectedRevision)
          if (original.input.enabled) identifier(original.input.recipientId)
        } else {
          uuid(original.operationId)
          identifier(original.otherDevice, 256)
          if (original.otherDevice === endpoint.id) throw new Error('Same member')
        }
      })
      setPending(original)
      return original.kind === 'configure'
        ? credentials.configure(endpoint.id, original.input)
        : credentials.link(endpoint.id, original.operationId, original.otherDevice)
    })
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) {
      setReceipt(result.value)
      read.reload()
    }
  }
  const current =
      selection &&
      channels.some(
        (channel) =>
          channel.registrationId === selection.registration &&
          channel.generation === selection.generation,
      ),
    disabled = !permitted || action.busy || !!pending
  return (
    <Card
      title={l('FileVault 收集授权与托管归属', 'FileVault collection authorization and custody')}
    >
      <Alert
        type="info"
        title={l(
          '配置授权、设备上安装的托管配置、密钥材料版本和 custody 代次分别记录。此处不安装配置，也不轮换密钥。',
          'Collection authorization, installed escrow configuration, material revision and custody epoch are separate facts. This panel does not install a profile or rotate keys.',
        )}
      />
      <Form.Item label={l('读取配置的主注册', 'Primary registration for configuration')}>
        <Select
          aria-label={l('FileVault 主注册', 'FileVault primary registration')}
          disabled={disabled}
          value={selection ? `${selection.registration}/${selection.generation}` : undefined}
          placeholder={l('选择当前注册与代次', 'Choose current registration and generation')}
          options={channels.map((channel) => ({
            value: `${channel.registrationId}/${channel.generation}`,
            label: `${channel.source} · ${channel.registrationId} · ${channel.generation}`,
          }))}
          onChange={(key) => {
            const channel = channels.find(
              (channel) => `${channel.registrationId}/${channel.generation}` === key,
            )
            if (channel)
              setSelection({ registration: channel.registrationId, generation: channel.generation })
          }}
        />
      </Form.Item>
      {selection && !current && (
        <Alert
          type="warning"
          title={l(
            '原注册代次已变化，保留原操作；请核对当前注册。',
            'The original registration generation changed. Original requests are retained; verify current registration.',
          )}
        />
      )}
      <Button onClick={read.reload} disabled={!permitted || !selection}>
        {l('读取当前 FileVault 配置', 'Read current FileVault configuration')}
      </Button>
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      {read.value && (
        <>
          <dl className="device-facts">
            <div>
              <dt>
                {l('收集授权 / 配置 revision', 'Collection authorization / configuration revision')}
              </dt>
              <dd>
                {read.value.enabled ? l('已允许', 'Enabled') : l('未允许', 'Disabled')} ·{' '}
                {read.value.revision}
              </dd>
            </div>
            <div>
              <dt>{l('材料 CAS revision', 'Material CAS revision')}</dt>
              <dd>{read.value.materialRevision}</dd>
            </div>
            <div>
              <dt>{l('托管归属 / 代次', 'Custody / epoch')}</dt>
              <dd>
                {read.value.custodyId ?? '—'} / {read.value.custodyEpoch}
              </dd>
            </div>
            <div>
              <dt>{l('接收证书标识', 'Recipient certificate ID')}</dt>
              <dd>{read.value.recipientId ?? '—'}</dd>
            </div>
          </dl>
          {read.value.recipientCertificate && (
            <details>
              <summary>{l('接收者公共证书', 'Public recipient certificate')}</summary>
              <Input.TextArea readOnly value={read.value.recipientCertificate} rows={4} />
            </details>
          )}
          <Form
            name={formPrefix + '-0'}
            form={form}
            layout="vertical"
            disabled={disabled || !current}
            onFinish={(value) => {
              if (selection)
                void submit({
                  kind: 'configure',
                  input: {
                    operationId: crypto.randomUUID(),
                    ...selection,
                    expectedRevision: read.value!.revision,
                    enabled: value.enabled,
                    recipientId: value.recipientId ?? '',
                  },
                })
            }}
          >
            <Form.Item
              name="enabled"
              valuePropName="checked"
              label={l(
                '允许收集 FileVault 恢复密钥',
                'Authorize FileVault recovery-key collection',
              )}
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="recipientId"
              label={l('已配置的接收证书标识', 'Configured recipient certificate ID')}
            >
              <Input />
            </Form.Item>
            <Button type="primary" htmlType="submit" disabled={disabled || !current}>
              {l('保存 FileVault 收集授权', 'Save FileVault collection authorization')}
            </Button>
          </Form>
        </>
      )}
      <Form
        name={formPrefix + '-1'}
        form={linkForm}
        layout="vertical"
        disabled={disabled}
        onFinish={(value) =>
          void submit({
            kind: 'link',
            operationId: crypto.randomUUID(),
            otherDevice: value.otherDevice,
          })
        }
      >
        <Form.Item
          name="otherDevice"
          label={l('正式关联的另一端点 ID', 'Other formally associated endpoint ID')}
          rules={[{ required: true }]}
        >
          <Input />
        </Form.Item>
        <p className="subtitle">
          {l(
            '服务端同时核对双方 SecurityOperate 权限、当前注册与正式关联，再合并托管归属；显示在同一视图不授予关联权限。',
            'The server checks SecurityOperate on both endpoints, current registrations and their formal association before merging custody. Sharing a view grants no linking authority.',
          )}
        </p>
        <Button htmlType="submit" disabled={disabled}>
          {l('关联 FileVault 托管归属', 'Link FileVault custody')}
        </Button>
      </Form>
      <Failure error={action.error} locale={locale} />
      {pending && (
        <>
          <p className="mono">
            {pending.kind === 'configure' ? pending.input.operationId : pending.operationId}
          </p>
          <Status value={outcome} locale={locale} />
          {receipt && (
            <p>
              {l(
                '原操作返回配置版本 / 材料版本 / 托管代次',
                'Original receipt configuration / material revision / custody epoch',
              )}{' '}
              · {receipt.revision} / {receipt.materialRevision} / {receipt.custodyEpoch}
            </p>
          )}
          <p>
            {l(
              '没有原操作 GET 接口。读取当前配置不能证明原操作；结果未知时仅显式重提相同 UUID 与完整原输入。',
              'There is no original-operation GET endpoint. Current configuration cannot acknowledge the original request; if unknown, explicitly resubmit the same UUID and complete original input.',
            )}
          </p>
          <Space wrap>
            <Button disabled={!permitted || action.busy} onClick={() => void submit(pending)}>
              {l(
                '显式重提原 FileVault 配置操作',
                'Explicitly resubmit original FileVault configuration operation',
              )}
            </Button>
            {outcome !== 'unknown' && (
              <Button
                disabled={action.busy}
                onClick={() => {
                  setPending(null)
                  setReceipt(null)
                  setOutcome('none')
                  action.clear()
                  read.reload()
                }}
              >
                {l(
                  '结束本次配置操作并重新读取',
                  'Finish this configuration operation and read again',
                )}
              </Button>
            )}
          </Space>
        </>
      )}
    </Card>
  )
}
