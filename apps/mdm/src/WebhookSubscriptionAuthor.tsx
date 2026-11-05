import { useEffect, useId, useState } from 'react'
import { Alert, Button, Checkbox, Form, Input, InputNumber, Select, Space } from 'antd'
import { uuid } from '@rss/mdm-inventory'
import {
  eventTypes,
  validateSubscriptionChange,
  type EventType,
  type Settings,
  type Subscription,
  type Webhooks,
} from '@rss/mdm-webhooks'
import type { Locale } from './i18n'
import { Failure, labels, validateInput } from './AdminUi'
import { WebhookCommandState, useWebhookCommand } from './WebhookCommand'
import { GroupPicker, type GroupsUseCases } from './GroupPicker'

interface Draft {
  id: string
  operationId: string
  restore: boolean
  expectedRevision?: number
  name: string
  endpoint: string
  events: EventType[]
  kind: 'allDevices' | 'devices' | 'groups'
  ids: string
  keyReference: string
  networkReference: string
  extensions: string
}
export function eventLabel(locale: Locale, event: EventType): string {
  const l = labels(locale)
  return {
    'device.registered': l('设备注册', 'Device registered'),
    'device.retired': l('设备退管', 'Device retired'),
    'policy.execution.terminal': l('策略执行终态', 'Policy execution terminal'),
    'compliance.status.changed': l('合规状态变化', 'Compliance status changed'),
    'device.access.changed': l('设备访问变化', 'Device access changed'),
  }[event]
}
export function WebhookSubscriptionAuthor({
  webhooks,
  groups,
  initial,
  id: fixedId,
  readable = true,
  locale,
  permitted,
  blocked = false,
  onAccepted,
  onClose,
}: {
  webhooks: Webhooks
  groups: GroupsUseCases
  initial: Subscription | null
  locale: Locale
  permitted: boolean
  id?: string
  readable?: boolean
  blocked?: boolean
  onAccepted: (id: string) => void
  onClose: () => void
}) {
  const l = labels(locale),
    prefix = useId(),
    command = useWebhookCommand(webhooks, permitted),
    [form] = Form.useForm<Draft>(),
    [error, setError] = useState<unknown>(null),
    [picker, setPicker] = useState(false),
    kind = Form.useWatch('kind', form),
    restore = Form.useWatch('restore', form),
    disabled = !permitted || command.action.busy || !!command.pending || blocked,
    existing = !!fixedId || !!initial
  useEffect(() => {
    if (command.pending) {
      if (!readable || !permitted) form.resetFields()
      return
    }
    form.resetFields()
    setError(null)
    if (!permitted) return
    const presentation = initial?.settings.presentation ?? {},
      { name, ...extensions } = presentation,
      selection = initial?.settings.selection
    form.setFieldsValue({
      id: fixedId ?? initial?.id ?? crypto.randomUUID(),
      operationId: crypto.randomUUID(),
      ...(initial
        ? { expectedRevision: initial.revision }
        : fixedId
          ? {}
          : { expectedRevision: 0 }),
      restore: !!fixedId && !initial,
      name: typeof name === 'string' ? name : '',
      endpoint: initial?.settings.endpoint ?? '',
      events: [...(initial?.settings.eventTypes ?? [])],
      kind: selection?.kind ?? 'allDevices',
      ids: selection && selection.kind !== 'allDevices' ? selection.ids.join('\n') : '',
      keyReference: initial?.settings.keyReference ?? '',
      networkReference: initial?.settings.networkReference ?? '',
      extensions: JSON.stringify(extensions, null, 2),
    })
  }, [fixedId, initial, readable, command.pending, permitted, form])
  useEffect(() => {
    if (!permitted) {
      form.resetFields()
      setError(null)
      setPicker(false)
    }
  }, [permitted, form])
  async function submit(value: Draft) {
    setError(null)
    try {
      let settings!: Settings
      let expectedRevision = 0
      validateInput(() => {
        uuid(value.id)
        if (value.restore) {
          if (value.expectedRevision === undefined)
            throw new Error('Original CAS revision required')
          expectedRevision = value.expectedRevision
        } else if (existing) {
          if (!initial) throw new Error('Read current configuration before a new edit')
          expectedRevision = initial.revision
        }
        const extensions: unknown = JSON.parse(value.extensions || '{}')
        if (!extensions || typeof extensions !== 'object' || Array.isArray(extensions))
          throw new Error('Descriptive object required')
        settings = {
          presentation: { ...(extensions as Record<string, unknown>), name: value.name },
          endpoint: value.endpoint,
          eventTypes: value.events ?? [],
          selection:
            value.kind === 'allDevices'
              ? { kind: 'allDevices' }
              : {
                  kind: value.kind,
                  ids: (value.ids ?? '')
                    .split(/\r?\n/)
                    .map((id) => id.trim())
                    .filter(Boolean),
                },
          keyReference: value.keyReference,
          networkReference: value.networkReference,
        }
        validateSubscriptionChange({
          operationId: value.operationId,
          expectedRevision,
          input: { kind: 'put', value: settings },
        })
      })
      const result = await command.submit({
        kind: 'subscription',
        id: value.id,
        change: {
          operationId: value.operationId,
          expectedRevision,
          input: { kind: 'put', value: settings },
        },
      })
      if (result?.ok) onAccepted(value.id)
    } catch (error) {
      setError(error)
    }
  }
  return (
    <>
      <h3>
        {existing
          ? l('编辑或恢复精确订阅', 'Edit or recover an exact subscription')
          : l('新建订阅', 'Create subscription')}
      </h3>
      {!existing && (
        <p className="subtitle">
          {l(
            '新建订阅默认停用，保存后显式启用。',
            'New subscriptions start disabled. Enable explicitly after saving.',
          )}
        </p>
      )}
      {existing && !readable && (
        <Alert
          type="info"
          title={l(
            '当前详情未读取。可继续显式重提已冻结原请求，或提供完整原 UUID、CAS 和设置恢复；不能推断当前配置。',
            'Current detail is unavailable. Resubmit the retained original request, or supply its complete UUID, CAS and settings. Current configuration is not inferred.',
          )}
        />
      )}
      <Form
        name={prefix + '-settings'}
        form={form}
        preserve={false}
        layout="vertical"
        disabled={disabled}
        onFinish={(value) => void submit(value)}
      >
        <div className="admin-form-grid">
          <Form.Item
            name="name"
            label={l('订阅名称', 'Subscription name')}
            rules={[{ required: true }]}
          >
            <Input maxLength={128} autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="endpoint"
            label={l('接收地址（HTTPS）', 'Receiver URL (HTTPS)')}
            rules={[{ required: true }]}
          >
            <Input
              maxLength={2048}
              autoComplete="off"
              placeholder="https://receiver.example/events"
            />
          </Form.Item>
        </div>
        <Form.Item
          name="events"
          label={l('订阅事件', 'Subscribed events')}
          rules={[{ required: true }]}
        >
          <Checkbox.Group
            options={eventTypes.map((value) => ({ value, label: eventLabel(locale, value) }))}
          />
        </Form.Item>
        <Form.Item name="kind" label={l('设备范围', 'Device selection')}>
          <Select
            onChange={() => setPicker(false)}
            options={[
              { value: 'allDevices', label: l('全部授权设备', 'All authorized devices') },
              { value: 'devices', label: l('精确设备', 'Exact devices') },
              { value: 'groups', label: l('设备组', 'Device groups') },
            ]}
          />
        </Form.Item>
        {kind !== 'allDevices' && (
          <Form.Item
            name="ids"
            label={
              kind === 'groups'
                ? l('设备组 ID（每行一个）', 'Device group IDs (one per line)')
                : l('设备 ID（每行一个）', 'Device IDs (one per line)')
            }
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={3} autoComplete="off" />
          </Form.Item>
        )}
        {kind === 'groups' && (
          <>
            <Button disabled={disabled} onClick={() => setPicker((value) => !value)}>
              {l('从设备组目录添加', 'Add from the device group directory')}
            </Button>
            {picker && (
              <GroupPicker
                groups={groups}
                locale={locale}
                assetContext="endpoint"
                disabled={disabled}
                value={null}
                onChange={(id) => {
                  const current = (form.getFieldValue('ids') as string | undefined) ?? ''
                  const ids = current.split(/\r?\n/).filter(Boolean)
                  if (!ids.includes(id)) form.setFieldValue('ids', [...ids, id].join('\n'))
                  setPicker(false)
                }}
              />
            )}
          </>
        )}
        <p className="subtitle">
          {l(
            '事件与所选范围的实际权限由服务端核验；全部设备和设备组需要对应全设备权限。',
            'The server checks event and selection permissions. All-device and group selections require the corresponding all-device authority.',
          )}
        </p>
        {kind === 'groups' && (
          <p className="subtitle">
            {l(
              '仅当前已发布的独立终端组成员参与匹配；未就绪或过期组不会默认放行。',
              'Matching uses current published endpoint-group membership. Unready or stale groups do not grant eligibility.',
            )}
          </p>
        )}
        <div className="admin-form-grid">
          <Form.Item
            name="keyReference"
            label={l('签名材料引用', 'Signing material reference')}
            rules={[{ required: true }]}
          >
            <Input maxLength={128} autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="networkReference"
            label={l('接收网络策略引用', 'Receiver network policy reference')}
            rules={[{ required: true }]}
          >
            <Input maxLength={128} autoComplete="off" />
          </Form.Item>
        </div>
        <details>
          <summary>
            {l('扩展描述与精确原操作', 'Descriptive extensions and exact original operation')}
          </summary>
          <Form.Item
            name="extensions"
            label={l(
              '其它描述字段（完整 JSON 对象）',
              'Other descriptive fields (complete JSON object)',
            )}
          >
            <Input.TextArea rows={5} maxLength={65536} autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="id"
            label={l('精确订阅 UUID', 'Exact subscription UUID')}
            rules={[{ required: true }]}
          >
            <Input readOnly={existing} autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="operationId"
            label={l('本次原操作 UUID', 'Original operation UUID')}
            rules={[{ required: true }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="restore" valuePropName="checked">
            <Checkbox disabled={disabled || (existing && !readable)}>
              {l(
                '恢复已知原请求，显式提供其原 CAS 版本',
                'Recover a known original request using its original CAS revision',
              )}
            </Checkbox>
          </Form.Item>
          {restore && (
            <>
              <Form.Item
                name="expectedRevision"
                label={l('原请求 CAS 版本', 'Original request CAS revision')}
                rules={[{ required: true }]}
              >
                <InputNumber min={0} precision={0} />
              </Form.Item>
              <Alert
                type="info"
                title={l(
                  'UUID、CAS 和全部设置必须与原请求一致；当前读取的配置不等于原回执。',
                  'UUID, CAS and all settings must match the original request. Current configuration is not its receipt.',
                )}
              />
            </>
          )}
        </details>
        <Space wrap>
          <Button type="primary" htmlType="submit" disabled={disabled}>
            {l('保存订阅配置', 'Save subscription configuration')}
          </Button>
          <Button disabled={command.action.busy || command.outcome === 'unknown'} onClick={onClose}>
            {l('关闭编辑', 'Close editor')}
          </Button>
        </Space>
      </Form>
      <Failure error={error} locale={locale} />
      <WebhookCommandState command={command} permitted={permitted} locale={locale} />
    </>
  )
}
