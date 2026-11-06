import { useEffect, useState } from 'react'
import { Alert, Button, Card, Checkbox, Form, Input, Select, Space, Switch } from 'antd'
import { freeze } from '@rss/mdm-inventory'
import {
  enterpriseId,
  validateEnterpriseChange,
  type EnterpriseChange,
  type EnterpriseDetail,
} from '@rss/mdm-device-access'
import type { OperationAuthorizationContext } from '@rss/auth-core'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, ReadState, useAction, useRead, validateInput } from './AdminUi'
import { useAdministration } from './useAdministration'
import { useOperationAuthorization } from './useOperationAuthorization'
import { Status } from './DevicePresentation'
import { inputFingerprint } from './useProtectedDelivery'
import { usePendingSelection } from './SelectionGuard'
interface Values {
  kind: 'relying_party' | 'subject'
  id: string
  callback: string
  capabilities: ('native_key' | 'password')[]
  enabled: boolean
  provider: string
  instance: string
  principal: string
  subject: string
  username: string
}
export function EnterpriseEditor({
  runtime,
  locale,
  id,
  onChanged,
}: {
  runtime: Runtime
  locale: Locale
  id: string | null
  onChanged(): void
}) {
  const l = labels(locale),
    { deviceAccess, authorization, binding } = useAdministration(runtime),
    permissions = useRead(`${binding}/enterprise-write`, authorization.effective),
    canWrite =
      permissions.value?.grants.some(
        (g) => g.operation === 'enterprise_applications_write' && g.scope.kind === 'tenant',
      ) ?? false,
    read = useRead(
      `${binding}/enterprise-detail/${id}`,
      (signal) => (id ? deviceAccess.enterpriseDetail(id, signal) : Promise.resolve(null)),
      { retryReadConflict: true },
    ),
    [form] = Form.useForm<Values>(),
    kind = Form.useWatch('kind', form) ?? 'relying_party',
    [pending, setPending] = useState<EnterpriseChange | null>(null),
    [context, setContext] = useState<OperationAuthorizationContext | null>(null),
    [approved, setApproved] = useState(false),
    [outcome, setOutcome] = useState('none'),
    [observed, setObserved] = useState<EnterpriseDetail | null>(null),
    action = useAction(),
    proof = useOperationAuthorization(runtime, context, canWrite, () => setApproved(false))
  usePendingSelection(!!pending || action.busy)
  useEffect(() => {
    const value = read.value?.configuration
    if (value && !pending)
      form.setFieldsValue(
        value.kind === 'relying_party'
          ? { ...value, capabilities: [...value.capabilities] }
          : { ...value, instance: value.person.instance, principal: value.person.principal },
      )
  }, [read.value, pending, form])
  async function prepare(values: Values) {
    const result = await action.run(async () => {
      if (!canWrite || (id && !read.value?.configuration))
        throw { cause: 'client', code: 'forbidden' }
      const input: EnterpriseChange = freeze({
        operationId: crypto.randomUUID(),
        expectedRevision: read.value?.revision ?? 0,
        configuration:
          values.kind === 'relying_party'
            ? {
                kind: 'relying_party',
                id: values.id,
                enabled: values.enabled,
                callback: values.callback,
                capabilities: values.capabilities,
              }
            : {
                kind: 'subject',
                provider: values.provider,
                person: { instance: values.instance, principal: values.principal },
                enabled: values.enabled,
                subject: values.subject,
                username: values.username,
              },
      })
      validateInput(() => validateEnterpriseChange(input))
      if (id && enterpriseId(input.configuration) !== id)
        throw { cause: 'client', code: 'input_changed' }
      return {
        input,
        context: {
          purpose: 'mdm.enterprise.configuration' as const,
          operationId: input.operationId,
          inputKey: await inputFingerprint(JSON.stringify(input)),
        },
      }
    })
    if (result.ok) {
      setPending(result.value.input)
      setContext(result.value.context)
      setObserved(null)
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
      return deviceAccess.changeEnterprise(pending)
    })
    if (!proof.delivery.isCurrent(epoch)) return
    setOutcome(result.ok ? 'confirmed' : isUnknown(result.error) ? 'unknown' : 'rejected')
    if (result.ok) {
      setObserved(result.value)
      onChanged()
      read.reload()
    }
  }
  async function refresh() {
    const target = pending ? enterpriseId(pending.configuration) : id
    if (!target) return
    const result = await action.run(() => deviceAccess.enterpriseDetail(target))
    if (result.ok) {
      setObserved(result.value)
      onChanged()
      read.reload()
    }
  }
  async function finish() {
    const result = await action.run(proof.cancel)
    if (result.ok) {
      setPending(null)
      setContext(null)
      setOutcome('none')
      setObserved(null)
      setApproved(false)
      read.reload()
    }
  }
  return (
    <Card title={l('企业应用与账户映射', 'Enterprise applications and account mapping')}>
      <ReadState
        locale={locale}
        busy={read.busy || permissions.busy}
        error={read.error ?? permissions.error}
        onRetry={read.reload}
      />
      {id && (
        <p>
          {id} · {l('版本', 'Revision')}: {read.value?.revision ?? '—'} ·{' '}
          {read.value?.targetFingerprint ?? ''}
        </p>
      )}
      {read.value && !read.value.configuration && (
        <Alert
          type="info"
          title={l(
            '此为设备签名注册的 Windows key，只读展示；浏览器不代造设备签名。',
            'This Windows key is registered with a device signature. The browser does not manufacture that signature.',
          )}
        />
      )}
      <Form
        form={form}
        layout="vertical"
        disabled={!canWrite || !!pending || action.busy || (!!id && !read.value?.configuration)}
        initialValues={{
          kind: 'relying_party',
          enabled: true,
          capabilities: ['native_key'],
          instance: runtime.host.serviceId,
        }}
        onFinish={(v) => void prepare(v)}
      >
        <Form.Item name="kind" label={l('配置类型', 'Configuration type')}>
          <Select
            disabled={!!id || !!pending}
            options={[
              { value: 'relying_party', label: l('企业 RP', 'Enterprise relying party') },
              { value: 'subject', label: l('账户主体映射', 'Account subject mapping') },
            ]}
          />
        </Form.Item>
        <div className="admin-form-grid">
          {kind === 'relying_party' ? (
            <>
              <Form.Item
                name="id"
                label={l('已部署的 Client ID', 'Deployed client ID')}
                rules={[{ required: true }]}
              >
                <Input disabled={!!id || !!pending} maxLength={64} />
              </Form.Item>
              <Form.Item
                name="callback"
                label={l('规范 HTTPS 回调', 'Canonical HTTPS callback')}
                rules={[{ required: true }]}
              >
                <Input maxLength={2048} />
              </Form.Item>
              <Form.Item
                name="capabilities"
                label={l('允许证明类型', 'Allowed proof types')}
                rules={[{ required: true }]}
              >
                <Select
                  mode="multiple"
                  options={[
                    { value: 'native_key', label: l('原生密钥', 'Native key') },
                    { value: 'password', label: l('密码', 'Password') },
                  ]}
                />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item
                name="provider"
                label={l('Provider UUID', 'Provider UUID')}
                rules={[{ required: true }]}
              >
                <Input disabled={!!id || !!pending} />
              </Form.Item>
              <Form.Item
                name="instance"
                label={l('Identity 实例 UUID', 'Identity instance UUID')}
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="principal"
                label={l('主体 UUID', 'Principal UUID')}
                rules={[{ required: true }]}
              >
                <Input disabled={!!id || !!pending} />
              </Form.Item>
              <Form.Item
                name="subject"
                label={l('Provider subject', 'Provider subject')}
                rules={[{ required: true }]}
              >
                <Input maxLength={512} />
              </Form.Item>
              <Form.Item
                name="username"
                label={l('Provider 用户名', 'Provider username')}
                rules={[{ required: true }]}
              >
                <Input maxLength={512} />
              </Form.Item>
            </>
          )}
          <Form.Item name="enabled" label={l('启用', 'Enabled')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </div>
        <Button htmlType="submit">
          {l('冻结并核对企业配置', 'Freeze and review enterprise configuration')}
        </Button>
      </Form>
      {pending && (
        <>
          <p>
            {l('原操作 / 预期版本', 'Original operation / expected revision')}:{' '}
            {pending.operationId} / {pending.expectedRevision} ·{' '}
            {enterpriseId(pending.configuration)}
          </p>
          <Space>
            <Button
              disabled={!canWrite || action.busy || outcome !== 'none'}
              onClick={() =>
                void action.run(() =>
                  proof.authorize((signal) => deviceAccess.beginEnterprise(pending, signal)),
                )
              }
            >
              {l('验证此企业配置用途', 'Verify enterprise configuration purpose')}
            </Button>
            <Button
              disabled={action.busy || (outcome === 'unknown' && !observed)}
              onClick={() => void finish()}
            >
              {outcome === 'unknown'
                ? l(
                    '结束当前核对（不确认原操作）',
                    'Finish comparison (original operation remains unconfirmed)',
                  )
                : l('结束或重新编辑此任务', 'Finish or edit this task')}
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
              '我已核对目标、版本及企业登录影响',
              'I verified the target, revision and enterprise login impact',
            )}
          </Checkbox>
          <Button
            type="primary"
            disabled={
              !proof.authorized || !approved || !canWrite || action.busy || outcome !== 'none'
            }
            onClick={() => void save()}
          >
            {l('确认保存企业配置', 'Save confirmed enterprise configuration')}
          </Button>
        </>
      )}
      <Button disabled={action.busy || (!pending && !id)} onClick={() => void refresh()}>
        {l('刷新当前配置以核对', 'Read current configuration for comparison')}
      </Button>
      <Failure locale={locale} error={action.error} />
      {outcome === 'unknown' && (
        <Alert
          type="warning"
          showIcon
          title={l(
            '原提交未知。刷新只核对当前值，不证明原操作完成；不会自动重放写入。',
            'The original submission is unknown. Refresh compares current values and does not prove the original operation completed. Writes are never replayed automatically.',
          )}
        />
      )}
      {observed && (
        <section aria-label={l('服务端当前配置', 'Current server configuration')}>
          <h3>{l('服务端当前配置', 'Current server configuration')}</h3>
          <p>
            {l('已读取当前配置版本', 'Current configuration revision read')}: {observed.revision} ·{' '}
            {observed.id} · {observed.configuration?.kind}
          </p>
          {observed.configuration ? (
            <dl className="device-facts">
              {[
                [
                  l('启用', 'Enabled'),
                  observed.configuration.enabled ? l('是', 'Yes') : l('否', 'No'),
                ],
                ...(observed.configuration.kind === 'relying_party'
                  ? [
                      [l('已部署的 Client ID', 'Deployed client ID'), observed.configuration.id],
                      [
                        l('规范 HTTPS 回调', 'Canonical HTTPS callback'),
                        observed.configuration.callback,
                      ],
                      [
                        l('允许证明类型', 'Allowed proof types'),
                        observed.configuration.capabilities
                          .map((value) =>
                            value === 'native_key'
                              ? l('原生密钥', 'Native key')
                              : l('密码', 'Password'),
                          )
                          .join(' · ') || '—',
                      ],
                    ]
                  : [
                      [l('Provider UUID', 'Provider UUID'), observed.configuration.provider],
                      [
                        l('Identity 实例 UUID', 'Identity instance UUID'),
                        observed.configuration.person.instance,
                      ],
                      [l('主体 UUID', 'Principal UUID'), observed.configuration.person.principal],
                      [l('Provider subject', 'Provider subject'), observed.configuration.subject],
                      [l('Provider 用户名', 'Provider username'), observed.configuration.username],
                    ]),
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>{l('未提供可比较的配置值', 'Comparable configuration values were not provided')}</p>
          )}
        </section>
      )}
    </Card>
  )
}
