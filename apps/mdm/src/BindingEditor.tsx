import { DiagnosticReference } from './DiagnosticReference'
import { useEffect, useId, useState } from 'react'
import { Alert, Button, Card, Checkbox, Form, Input, Select, Space } from 'antd'
import { freeze } from '@rss/mdm-inventory'
import {
  validateBindingChange,
  type BindingChange,
  type Binding,
  type AccountIntent,
} from '@rss/mdm-device-access'
import type { OperationAuthorizationContext } from '@rss/auth-core'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, ReadState, useAction, useRead, validateInput } from './AdminUi'
import { useAdministration } from './useAdministration'
import { devicePermission } from './DeviceSecurity'
import { inputFingerprint } from './useProtectedDelivery'
import { useOperationAuthorization } from './useOperationAuthorization'
import { Status } from './DevicePresentation'
import { usePendingSelection } from './SelectionGuard'
interface Values {
  kind: 'put' | 'reset_factors' | 'unbind'
  instance: string
  principal: string
  policy: string
  account: 'create' | 'windows_local' | 'windows_ad' | 'windows_entra' | 'macos'
  platform: 'windows' | 'macos'
  name: string
  sid: string
  domainSid: string
  tenantId: string
  objectId: string
  generatedUid: string
  disposition: 'keep' | 'disable' | 'standard'
}
function account(value: Values): AccountIntent {
  if (value.account === 'create')
    return { kind: 'create', platform: value.platform, name: value.name }
  return {
    kind: 'existing',
    account:
      value.account === 'macos'
        ? { platform: 'macos', generatedUid: value.generatedUid }
        : {
            platform: 'windows',
            sid: value.sid,
            authority:
              value.account === 'windows_local'
                ? { kind: 'local' }
                : value.account === 'windows_ad'
                  ? { kind: 'active_directory', domainSid: value.domainSid }
                  : { kind: 'entra', tenantId: value.tenantId, objectId: value.objectId },
          },
  }
}
export function BindingEditor({
  runtime,
  locale,
  device,
  id,
  isNew,
  onChanged,
}: {
  runtime: Runtime
  locale: Locale
  device: string
  id: string
  isNew: boolean
  onChanged(): void
}) {
  const formName = useId()
  const l = labels(locale),
    { deviceAccess, authorization, binding } = useAdministration(runtime),
    permissions = useRead(`${binding}/binding-write/${device}`, authorization.effective),
    permitted = devicePermission(permissions.value?.grants ?? [], device, 'account_write'),
    [known, setKnown] = useState(!isNew),
    read = useRead(
      `${binding}/binding-detail/${device}/${id}/${known}/${permitted}`,
      (signal) =>
        known && permitted ? deviceAccess.binding(device, id, signal) : Promise.resolve(null),
      { retryReadConflict: true },
    ),
    [form] = Form.useForm<Values>(),
    kind = Form.useWatch('kind', form) ?? 'put',
    accountMode = Form.useWatch('account', form) ?? 'create',
    [pending, setPending] = useState<BindingChange | null>(null),
    [context, setContext] = useState<OperationAuthorizationContext | null>(null),
    [approved, setApproved] = useState(false),
    [receipt, setReceipt] = useState<Binding | null>(null),
    [outcome, setOutcome] = useState('none'),
    action = useAction(),
    proof = useOperationAuthorization(runtime, context, permitted, () => setApproved(false))
  usePendingSelection(!!pending || action.busy)
  useEffect(() => {
    const value = read.value
    if (value && !pending) {
      const a = value.account
      form.setFieldsValue({
        instance: value.instance,
        principal: value.principal,
        policy: value.policy,
        disposition: value.disposition,
        ...(a
          ? a.platform === 'macos'
            ? { account: 'macos', generatedUid: a.generatedUid }
            : {
                account:
                  a.authority.kind === 'local'
                    ? 'windows_local'
                    : a.authority.kind === 'active_directory'
                      ? 'windows_ad'
                      : 'windows_entra',
                sid: a.sid,
                ...(a.authority.kind === 'active_directory'
                  ? { domainSid: a.authority.domainSid }
                  : a.authority.kind === 'entra'
                    ? { tenantId: a.authority.tenantId, objectId: a.authority.objectId }
                    : {}),
              }
          : value.accountIntent.kind === 'create'
            ? {
                account: 'create',
                platform: value.accountIntent.platform,
                name: value.accountIntent.name,
              }
            : {}),
      })
    }
  }, [read.value, pending, form])
  async function prepare(values: Values) {
    const result = await action.run(async () => {
      if (!permitted || (known && !read.value)) throw { cause: 'client', code: 'forbidden' }
      const input: BindingChange = freeze({
        operationId: crypto.randomUUID(),
        expectedRevision: read.value?.revision ?? 0,
        action:
          values.kind === 'put'
            ? {
                kind: 'put',
                instance: values.instance,
                principal: values.principal,
                policy: values.policy,
                account: account(values),
              }
            : values.kind === 'unbind'
              ? { kind: 'unbind', disposition: values.disposition }
              : { kind: 'reset_factors' },
      })
      validateInput(() => validateBindingChange(input))
      return {
        input,
        context: {
          purpose: 'mdm.device_access.change' as const,
          device,
          binding: id,
          operationId: input.operationId,
          inputKey: await inputFingerprint(JSON.stringify(input)),
        },
      }
    })
    if (result.ok) {
      setPending(result.value.input)
      setContext(result.value.context)
      setApproved(false)
    }
  }
  async function save() {
    if (!pending || !approved) return
    const epoch = proof.delivery.capture()
    setApproved(false)
    const result = await action.run(() => {
      proof.consume()
      setOutcome('unknown')
      return deviceAccess.changeBinding(device, id, pending)
    })
    if (!proof.delivery.isCurrent(epoch)) return
    setOutcome(result.ok ? 'confirmed' : isUnknown(result.error) ? 'unknown' : 'rejected')
    if (result.ok) {
      setReceipt(result.value)
      setKnown(true)
      onChanged()
    }
  }
  async function recover() {
    if (!pending) return
    const result = await action.run(() => deviceAccess.operation(device, pending.operationId))
    if (result.ok) {
      setReceipt(result.value)
      setKnown(true)
      setOutcome('confirmed')
    }
  }
  async function finish() {
    const result = await action.run(proof.cancel)
    if (result.ok) {
      setPending(null)
      setContext(null)
      setReceipt(null)
      setOutcome('none')
      setApproved(false)
      read.reload()
    }
  }
  return (
    <Card
      title={
        isNew
          ? l('新建设备账户绑定', 'Create device account binding')
          : l('管理账户绑定与因子', 'Manage account binding and factors')
      }
    >
      <p>
        {device} · {id}
      </p>
      <ReadState
        locale={locale}
        busy={read.busy || permissions.busy}
        error={read.error ?? permissions.error}
        diagnosticContext={read.error ? 'da' : undefined}
        onRetry={read.error ? read.reload : permissions.reload}
      />
      {read.value && (
        <dl className="device-facts">
          <div>
            <dt>{l('当前主体 / 实例', 'Current principal / instance')}</dt>
            <dd>
              {read.value.principal} / {read.value.instance}
            </dd>
          </div>
          <div>
            <dt>{l('本地账户身份', 'Local account identity')}</dt>
            <dd>
              {read.value.account?.platform === 'windows'
                ? read.value.account.sid
                : (read.value.account?.generatedUid ?? l('尚未回执', 'No receipt'))}
            </dd>
          </div>
          <div>
            <dt>{l('版本 / 绑定 / 因子代次', 'Revision / binding / factor generation')}</dt>
            <dd>
              {read.value.revision} / {read.value.bindingGeneration} / {read.value.factorGeneration}
            </dd>
          </div>
        </dl>
      )}
      <Form
        name={formName}
        form={form}
        layout="vertical"
        disabled={!permitted || !!pending || action.busy || read.busy || permissions.busy}
        initialValues={{
          kind: 'put',
          instance: runtime.host.serviceId,
          account: 'create',
          platform: 'windows',
          disposition: 'keep',
        }}
        onFinish={(v) => void prepare(v)}
      >
        <Form.Item name="kind" label={l('绑定动作', 'Binding action')}>
          <Select
            options={[
              { value: 'put', label: l('绑定或更新账户', 'Bind or update account') },
              { value: 'reset_factors', label: l('重置因子', 'Reset factors'), disabled: !known },
              { value: 'unbind', label: l('解除绑定', 'Unbind'), disabled: !known },
            ]}
          />
        </Form.Item>
        {kind === 'put' && (
          <div className="admin-form-grid">
            <Form.Item
              name="instance"
              label={l('Identity 实例 UUID', 'Identity instance UUID')}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="principal"
              label={l('账户主体 UUID', 'Account principal UUID')}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="policy"
              label={l('Device Access 策略 UUID', 'Device Access policy UUID')}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item name="account" label={l('本地账户定位', 'Local account coordinates')}>
              <Select
                options={[
                  { value: 'create', label: l('新建本地账户', 'Create local account') },
                  { value: 'windows_local', label: l('Windows 本地 SID', 'Windows local SID') },
                  { value: 'windows_ad', label: l('AD 域 SID', 'AD domain SID') },
                  { value: 'windows_entra', label: l('Entra SID', 'Entra SID') },
                  { value: 'macos', label: l('macOS GeneratedUID', 'macOS GeneratedUID') },
                ]}
              />
            </Form.Item>
            {accountMode === 'create' ? (
              <>
                <Form.Item name="platform" label={l('账户平台', 'Account platform')}>
                  <Select
                    options={[
                      { value: 'windows', label: 'Windows' },
                      { value: 'macos', label: 'macOS' },
                    ]}
                  />
                </Form.Item>
                <Form.Item
                  name="name"
                  label={l('新账户名称', 'New account name')}
                  rules={[{ required: true }]}
                >
                  <Input maxLength={128} />
                </Form.Item>
              </>
            ) : accountMode === 'macos' ? (
              <Form.Item name="generatedUid" label="GeneratedUID" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            ) : (
              <>
                <Form.Item name="sid" label="SID" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                {accountMode === 'windows_ad' && (
                  <Form.Item
                    name="domainSid"
                    label={l('AD 域 SID', 'AD domain SID')}
                    rules={[{ required: true }]}
                  >
                    <Input />
                  </Form.Item>
                )}
                {accountMode === 'windows_entra' && (
                  <>
                    <Form.Item
                      name="tenantId"
                      label={l('Entra 租户 UUID', 'Entra tenant UUID')}
                      rules={[{ required: true }]}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name="objectId"
                      label={l('Entra 对象 UUID', 'Entra object UUID')}
                      rules={[{ required: true }]}
                    >
                      <Input />
                    </Form.Item>
                  </>
                )}
              </>
            )}
          </div>
        )}
        {kind === 'unbind' && (
          <Form.Item
            name="disposition"
            label={l('账户处置（保留数据）', 'Account disposition (retain data)')}
          >
            <Select
              options={[
                { value: 'keep', label: l('保持账户状态', 'Keep account state') },
                { value: 'disable', label: l('禁用账户', 'Disable account') },
                { value: 'standard', label: l('降为标准用户', 'Make standard user') },
              ]}
            />
          </Form.Item>
        )}
        <Button htmlType="submit">
          {l('冻结此绑定操作并核对', 'Freeze and review binding operation')}
        </Button>
      </Form>
      {pending && (
        <>
          <p>
            {l('原操作 / 预期版本', 'Original operation / expected revision')}:{' '}
            <DiagnosticReference
              locale={locale}
              context="da"
              selection={{
                mode: 'operation',
                address: { owner: 'device_access', operationId: pending.operationId, device },
              }}
            />
            {' / '}
            {pending.expectedRevision} · {pending.action.kind}
          </p>
          <Space>
            <Button
              disabled={!permitted || action.busy || outcome !== 'none'}
              onClick={() =>
                void action.run(() =>
                  proof.authorize((signal) =>
                    deviceAccess.beginBinding(device, id, pending, signal),
                  ),
                )
              }
            >
              {l('验证此绑定用途', 'Verify binding purpose')}
            </Button>
            <Button disabled={action.busy || outcome === 'unknown'} onClick={() => void finish()}>
              {l('结束或重新编辑此任务', 'Finish or edit this task')}
            </Button>
          </Space>
          <p>
            <Status locale={locale} value={proof.status} />
          </p>
          <Checkbox
            checked={approved}
            disabled={!proof.authorized || outcome !== 'none'}
            onChange={(e) => setApproved(e.target.checked)}
          >
            {l(
              '已核对当前设备、账户、策略和影响',
              'I verified the device, account, policy and impact',
            )}
          </Checkbox>
          <Button
            type="primary"
            disabled={
              !proof.authorized || !approved || !permitted || action.busy || outcome !== 'none'
            }
            onClick={() => void save()}
          >
            {l('确认保存绑定操作', 'Save confirmed binding operation')}
          </Button>
          <Button disabled={action.busy} onClick={() => void recover()}>
            {l('查询原绑定操作', 'Read original binding operation')}
          </Button>
        </>
      )}
      <Failure locale={locale} error={action.error} diagnosticContext="da" />
      {outcome === 'unknown' && (
        <Alert
          type="warning"
          showIcon
          title={l(
            '提交结果未知。只查询原操作，不自动重跑。',
            'Submission unknown. Query the original operation without automatic replay.',
          )}
        />
      )}
      {receipt && permitted && (
        <p>
          {l('当次回执', 'Original receipt')}: {receipt.operationId} · {receipt.serverState} ·{' '}
          {receipt.effect ?? l('效果未知', 'Effect unknown')} · {receipt.receivedRevision ?? '—'} /{' '}
          {receipt.appliedRevision ?? '—'}
        </p>
      )}
    </Card>
  )
}
