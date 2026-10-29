import { useId, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
} from 'antd'
import type { ViewEndpoint } from '@rss/mdm-devices'
import {
  actionKinds,
  credentialIntent,
  validateIntent,
  type CredentialOperation,
  type Material,
  type OperationIntent,
  type RecoveryCredentials,
} from '@rss/mdm-recovery-credentials'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, ReadState, useAction, useRead, validateInput } from './AdminUi'
import { DataTable } from './DataTable'
import { Status, timestamp } from './DevicePresentation'
import { usePendingSelection } from './SelectionGuard'
import { inputFingerprint, useProtectedDelivery } from './useProtectedDelivery'
import { nativeCredentialAction, type NativeCredentialFields } from './native-credential-input'
export function NativeCredentialOperation({
  credentials,
  endpoint,
  selected,
  locale,
  canOperate,
  canConfigure,
  canReadOperation,
}: {
  credentials: RecoveryCredentials
  endpoint: ViewEndpoint
  selected: Material | null
  locale: Locale
  canOperate: boolean
  canConfigure: boolean
  canReadOperation: boolean
}) {
  const formPrefix = useId()

  const l = labels(locale),
    registration = endpoint.channels.find(
      (channel) => channel.status === 'active' && channel.source === 'mdm.apple',
    ),
    configuration = useRead(
      `native-credential-configuration/${endpoint.id}/${registration?.registrationId ?? ''}/${registration?.generation ?? ''}/${canOperate}`,
      () =>
        canOperate && registration
          ? credentials.configuration(endpoint.id, {
              registration: registration.registrationId,
              generation: registration.generation,
            })
          : Promise.resolve(null),
    ),
    action = useAction(),
    [form] = Form.useForm<NativeCredentialFields>(),
    [lookupForm] = Form.useForm<{ operationId: string }>(),
    kind =
      Form.useWatch('kind', form) ?? (canConfigure ? 'configure_filevault' : 'collect_filevault'),
    noExisting = Form.useWatch('noExisting', form) ?? false,
    useCurrent = Form.useWatch('useCurrent', form) ?? false,
    [pending, setPending] = useState<{
      intent: OperationIntent
      fingerprint: string | null
    } | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    [facts, setFacts] = useState<CredentialOperation | null>(null),
    [acceptedRevision, setAcceptedRevision] = useState<number | null>(null),
    delivery = useProtectedDelivery(() => form.resetFields(['unlockPassword']), canOperate)
  usePendingSelection(!!pending || action.busy)
  useEffect(() => {
    if (!selected || pending) return
    form.setFieldsValue({
      material: { id: selected.id, version: selected.version },
      ...(selected.binding.subject.kind === 'recovery_lock' &&
      selected.binding.registration === registration?.registrationId &&
      selected.binding.generation === registration?.generation
        ? {
            expectedRevision: selected.version,
            current: { id: selected.id, version: selected.version },
            useCurrent: selected.current,
          }
        : {}),
    })
  }, [selected, pending, registration?.registrationId, registration?.generation, form])
  async function submit(value: NativeCredentialFields) {
    let password = value.unlockPassword ?? ''
    value.unlockPassword = ''
    form.resetFields(['unlockPassword'])
    const epoch = delivery.capture()
    try {
      const prepared = await action.run(async () => {
        if (!registration || !canOperate) throw { cause: 'client', code: 'invalid_input' }
        let intent: OperationIntent
        validateInput(() => {
          intent =
            pending?.intent ??
            credentialIntent({
              device: endpoint.id,
              operationId: crypto.randomUUID(),
              registration: registration.registrationId,
              generation: registration.generation,
              deadline: Math.floor(new Date(value.deadline).getTime() / 1000),
              action: nativeCredentialAction(value, configuration.value ?? null, selected),
            })
          validateIntent(intent)
          if (intent.action.kind === 'configure_filevault' && !canConfigure)
            throw new Error('Configuration permission required')
          if (
            intent.action.kind === 'rotate_filevault' &&
            (!password ||
              password.includes('\0') ||
              new TextEncoder().encode(password).length > 4096)
          )
            throw new Error('Unlock password required')
        })
        const fingerprint =
          intent!.action.kind === 'rotate_filevault' ? await inputFingerprint(password) : null
        if (pending?.fingerprint !== undefined && pending.fingerprint !== fingerprint)
          throw { cause: 'client', code: 'invalid_input' }
        return { intent: intent!, fingerprint }
      })
      if (!prepared.ok || !delivery.isCurrent(epoch)) return
      const original = prepared.value
      setPending(original)
      const result = await action.run(() =>
        credentials.create(
          original.intent,
          original.intent.action.kind === 'rotate_filevault' ? password : undefined,
        ),
      )
      setOutcome((previous) =>
        result.ok
          ? 'confirmed'
          : previous === 'unknown' || isUnknown(result.error)
            ? 'unknown'
            : 'rejected',
      )
      if (result.ok) setAcceptedRevision(result.value.revision)
    } finally {
      password = ''
    }
  }
  async function lookup(id: string, original?: OperationIntent) {
    const result = await action.run(() => credentials.operation(endpoint.id, id, original))
    if (result.ok) {
      setFacts(result.value)
      if (pending && result.value.operationId === pending.intent.operationId)
        setOutcome('confirmed')
    }
  }
  const baseDisabled = !canOperate || !registration || action.busy,
    disabled = baseDisabled || !!pending,
    usesMaterial = [
      'reconcile_filevault',
      'reconcile_recovery_lock',
      'verify_recovery_lock',
    ].includes(kind),
    usesRecipient = ['collect_filevault', 'reconcile_filevault'].includes(kind)
  return (
    <Card title={l('原生恢复凭据操作', 'Native recovery credential operations')}>
      <Alert
        type="info"
        title={l(
          '受理、命令执行、密钥托管和验证是不同事实。此处只恢复本类凭据原请求，不处理通用执行恢复或软件发布恢复。',
          'Acceptance, command execution, escrow and verification are separate facts. This panel recovers credential requests only, not general execution or software publication recovery.',
        )}
      />
      {registration ? (
        <p className="mono">
          {l('当前 Apple MDM 注册 / 代次', 'Current Apple MDM registration / generation')} ·{' '}
          {registration.registrationId} / {registration.generation}
        </p>
      ) : (
        <p>
          {l(
            '此端点没有当前 Apple MDM 主注册；本接口不提供 Windows 凭据通用轮换。',
            'This endpoint has no current Apple MDM primary registration. This API does not provide generic Windows credential rotation.',
          )}
        </p>
      )}
      <ReadState busy={configuration.busy} error={configuration.error} locale={locale} />
      {configuration.value && (
        <p>
          {l(
            '原生注册 FileVault 配置版本 / 材料 CAS / 托管代次',
            'Native registration FileVault configuration / material CAS / custody epoch',
          )}{' '}
          · {configuration.value.revision} / {configuration.value.materialRevision} /{' '}
          {configuration.value.custodyEpoch}
        </p>
      )}
      <Button disabled={!canOperate || !registration} onClick={configuration.reload}>
        {l('读取原生注册的材料 CAS', 'Read native registration material CAS')}
      </Button>
      <Form
        name={formPrefix + '-0'}
        form={form}
        layout="vertical"
        initialValues={{
          kind: canConfigure ? 'configure_filevault' : 'collect_filevault',
          deadline: new Date(Date.now() + 3600000 - new Date().getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16),
          clear: false,
          noExisting: false,
          useCurrent: false,
        }}
        disabled={disabled}
        onFinish={(value) => void submit(value)}
      >
        <fieldset className="permission-panel" disabled={!!pending}>
          <Form.Item
            name="kind"
            label={l('凭据操作', 'Credential operation')}
            rules={[{ required: true }]}
          >
            <Select
              options={actionKinds.map((value) => ({
                value,
                label: actionName(value, locale),
                disabled: value === 'configure_filevault' && !canConfigure,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="deadline"
            label={l('设备执行截止时间', 'Device execution deadline')}
            rules={[{ required: true }]}
          >
            <Input type="datetime-local" />
          </Form.Item>
          {['collect_filevault', 'rotate_filevault'].includes(kind) && (
            <p>
              {l(
                '预期材料 CAS 来自上述原生注册配置：',
                'Expected material CAS comes from the native registration configuration above:',
              )}{' '}
              {configuration.value?.materialRevision ??
                l('尚未读取，不能提交', 'Unread; submission unavailable')}
            </p>
          )}
          {usesMaterial && (
            <VersionFields
              prefix="material"
              label={l('精确材料', 'Exact material')}
              locale={locale}
            />
          )}
          {usesRecipient && (
            <Form.Item
              name="recipient"
              label={l(
                '指定接收证书标识（可留空沿用配置）',
                'Recipient certificate ID (optional; use configured recipient)',
              )}
            >
              <Input />
            </Form.Item>
          )}
          {kind === 'set_recovery_lock' && (
            <>
              <Form.Item name="noExisting" valuePropName="checked">
                <Checkbox>
                  {l(
                    '已核对无现有材料，以 absence revision 0 新建',
                    'I checked that no material exists; create with absence revision 0',
                  )}
                </Checkbox>
              </Form.Item>
              {!noExisting && (
                <Form.Item
                  name="expectedRevision"
                  label={l('已核对的材料 CAS 预期版本', 'Verified expected material CAS revision')}
                  rules={[{ required: true }]}
                >
                  <InputNumber min={1} precision={0} />
                </Form.Item>
              )}
              <p className="subtitle">
                {l(
                  '所选材料的版本不证明没有更新的待处理版本。冲突后须重新核对目录和原操作，不会自动更换 CAS。',
                  'A selected material version does not prove that no newer pending version exists. On conflict, verify the directory and original operation; CAS is never replaced automatically.',
                )}
              </p>
              <Form.Item
                name="useCurrent"
                valuePropName="checked"
                label={l('提供原恢复锁材料', 'Provide original recovery-lock material')}
              >
                <Switch />
              </Form.Item>
              {useCurrent && (
                <VersionFields
                  prefix="current"
                  label={l('原恢复锁材料', 'Original recovery-lock material')}
                  locale={locale}
                />
              )}
              <Form.Item
                name="clear"
                valuePropName="checked"
                label={l(
                  '清除设备恢复锁（必须提供原材料）',
                  'Clear device recovery lock (original material required)',
                )}
              >
                <Switch />
              </Form.Item>
            </>
          )}
          {kind === 'reconcile_recovery_lock' && (
            <Form.Item
              name="operation"
              label={l('原设置恢复锁操作 UUID', 'Original set-recovery-lock operation UUID')}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
          )}
        </fieldset>
        {kind === 'rotate_filevault' && (
          <Form.Item
            name="unlockPassword"
            label={l('本次 FileVault 解锁密码', 'FileVault unlock password for this request')}
            rules={[{ required: true }]}
          >
            <Input.Password autoComplete="off" visibilityToggle={false} disabled={baseDisabled} />
          </Form.Item>
        )}
        <Button
          type="primary"
          htmlType="submit"
          disabled={baseDisabled || (kind === 'configure_filevault' && !canConfigure)}
        >
          {pending
            ? l(
                '重新输入并显式重提原凭据操作',
                'Re-enter and explicitly resubmit original credential operation',
              )
            : l('提交原生凭据操作', 'Submit native credential operation')}
        </Button>
      </Form>
      <Failure error={action.error} locale={locale} />
      {pending && (
        <>
          <p className="mono">
            {pending.intent.operationId} · {pending.intent.registration} /{' '}
            {pending.intent.generation}
          </p>
          <p>
            {l('原截止时间', 'Original deadline')} · {timestamp(locale, pending.intent.deadline)} ·{' '}
            <Status value={outcome} locale={locale} />
            {acceptedRevision !== null &&
              ` · ${l('受理版本', 'Acceptance revision')} ${acceptedRevision}`}
          </p>
          <Space wrap>
            <Button
              disabled={
                !canOperate ||
                action.busy ||
                (pending.intent.action.kind === 'configure_filevault' && !canConfigure)
              }
              onClick={() =>
                void submit({ ...form.getFieldsValue(), kind: pending.intent.action.kind })
              }
            >
              {l('显式重提原凭据操作', 'Explicitly resubmit original credential operation')}
            </Button>
            <Button
              disabled={!canReadOperation || action.busy}
              onClick={() => void lookup(pending.intent.operationId, pending.intent)}
            >
              {l('读取原凭据操作事实', 'Read original credential operation facts')}
            </Button>
            {outcome !== 'unknown' && (
              <Button
                disabled={action.busy}
                onClick={() => {
                  setPending(null)
                  setOutcome('none')
                  setAcceptedRevision(null)
                  setFacts(null)
                  action.clear()
                  configuration.reload()
                }}
              >
                {l('结束本次凭据操作', 'Finish this credential operation')}
              </Button>
            )}
          </Space>
        </>
      )}
      {facts && <CredentialOperationFacts value={facts} locale={locale} />}
      <details>
        <summary>{l('读取已有凭据操作', 'Read an existing credential operation')}</summary>
        <Form
          name={formPrefix + '-1'}
          form={lookupForm}
          layout="vertical"
          onFinish={(value) => void lookup(value.operationId)}
        >
          <Form.Item
            name="operationId"
            label={l('已有凭据操作 UUID', 'Existing credential operation UUID')}
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Button htmlType="submit" disabled={!canReadOperation || action.busy}>
            {l('读取凭据原操作', 'Read original credential operation')}
          </Button>
        </Form>
      </details>
    </Card>
  )
}
export function CredentialOperationFacts({
  value,
  locale,
}: {
  value: CredentialOperation
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <Card size="small" title={l('原操作与设备事实', 'Original operation and device facts')}>
      <dl className="device-facts">
        <div>
          <dt>{l('操作 / 命令', 'Operation / command')}</dt>
          <dd>
            {value.operationId} / {value.commandId}
          </dd>
        </div>
        <div>
          <dt>{l('命令状态', 'Command state')}</dt>
          <dd>
            <Status value={value.commandStatus} locale={locale} />
          </dd>
        </div>
        <div>
          <dt>{l('当前授权 / 原因', 'Current authorization / reason')}</dt>
          <dd>
            {value.authorization} / {value.authorizationReason ?? '—'}
          </dd>
        </div>
        <div>
          <dt>{l('派发失败', 'Dispatch failure')}</dt>
          <dd>{value.dispatchFailure ?? '—'}</dd>
        </div>
        <div>
          <dt>{l('观察范围 / 进度 / 效果', 'Observation scope / progress / effect')}</dt>
          <dd>
            {value.observation.scope} / {value.observation.progress} / {value.observation.effect}
          </dd>
        </div>
        <div>
          <dt>{l('原生回报结果', 'Native reported result')}</dt>
          <dd>{value.observation.result ?? '—'}</dd>
        </div>
      </dl>
      <DataTable
        locale={locale}
        dataSource={value.observation.receipts.map((receipt, index) => ({
          ...receipt,
          key: index,
        }))}
        rowKey="key"
        columns={[
          { title: l('阶段', 'Phase'), dataIndex: 'phase' },
          { title: l('回执状态', 'Receipt state'), dataIndex: 'state' },
          {
            title: l('设备接受', 'Device accepted'),
            render: (_, row) => (row.accepted ? l('是', 'Yes') : l('尚未接受', 'Not accepted')),
          },
          {
            title: l('服务端接收', 'Server received'),
            render: (_, row) => timestamp(locale, row.receivedAt),
          },
        ]}
      />
    </Card>
  )
}
function VersionFields({
  prefix,
  label,
  locale,
}: {
  prefix: string
  label: string
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <div className="admin-form-grid">
      <Form.Item name={[prefix, 'id']} label={`${label} UUID`} rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item
        name={[prefix, 'version']}
        label={`${label} ${l('版本', 'version')}`}
        rules={[{ required: true }]}
      >
        <InputNumber min={1} precision={0} />
      </Form.Item>
    </div>
  )
}
function actionName(value: string, locale: Locale) {
  const l = labels(locale)
  return (
    (
      {
        configure_filevault: l('下发 FileVault 托管配置', 'Deploy FileVault escrow configuration'),
        collect_filevault: l('收集 FileVault 材料', 'Collect FileVault material'),
        rotate_filevault: l('轮换 FileVault 密钥', 'Rotate FileVault key'),
        reconcile_filevault: l('核对既有 FileVault 材料', 'Reconcile existing FileVault material'),
        set_recovery_lock: l('设置或清除恢复锁', 'Set or clear recovery lock'),
        reconcile_recovery_lock: l(
          '核对原恢复锁操作',
          'Reconcile original recovery-lock operation',
        ),
        verify_recovery_lock: l('验证恢复锁材料', 'Verify recovery-lock material'),
      } as Record<string, string>
    )[value] ?? value
  )
}
