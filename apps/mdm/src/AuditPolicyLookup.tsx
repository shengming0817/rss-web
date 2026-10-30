import { useEffect, useId, useRef, useState } from 'react'
import { Alert, Button, Descriptions, Form, Input, Select, Space } from 'antd'
import type { Page } from '@rss/mdm-devices'
import type { AuditPolicyIdentity, AuditPolicyLookup, PolicyAddress } from '@rss/mdm-audit'
import type { Locale } from './i18n'
import { codeOf, Failure, labels, useAction } from './AdminUi'
import { DataTable } from './DataTable'
import { Status } from './DevicePresentation'

/** Current Policy identity lookup only. Configuration and invocation remain with Policy. */
export function AuditPolicyLocator({
  lookup,
  locale,
  permitted,
  device,
  onPolicy,
}: {
  lookup: AuditPolicyLookup
  locale: Locale
  permitted: boolean
  device?: string | undefined
  onPolicy: (policy: AuditPolicyIdentity, activities: boolean) => void
}) {
  const l = labels(locale),
    prefix = useId(),
    epoch = useRef(0),
    action = useAction(),
    [form] = Form.useForm<{ kind: PolicyAddress['kind']; value: string }>(),
    [events] = Form.useForm<{ event: string }>(),
    [identity, setIdentity] = useState<AuditPolicyIdentity | null>(null),
    [page, setPage] = useState<Page<AuditPolicyIdentity> | null>(null),
    [event, setEvent] = useState('')
  function clear() {
    epoch.current++
    setIdentity(null)
    setPage(null)
    setEvent('')
    form.resetFields()
    events.resetFields()
    action.clear()
  }
  useEffect(() => {
    if (!permitted) clear()
  }, [permitted])
  useEffect(
    () => () => {
      epoch.current++
    },
    [],
  )
  async function resolve(value: { kind: PolicyAddress['kind']; value: string }) {
    const generation = ++epoch.current
    setIdentity(null)
    setPage(null)
    const input = value.value.trim(),
      address: PolicyAddress =
        value.kind === 'id'
          ? { kind: 'id', id: input }
          : value.kind === 'alias'
            ? { kind: 'alias', alias: input }
            : { kind: 'tool_name', name: input }
    const result = await action.run(() => lookup.resolve(address))
    if (result.ok && generation === epoch.current && permitted) setIdentity(result.value)
  }
  async function byEvent(name: string, cursor?: string) {
    const generation = ++epoch.current
    setPage(null)
    setEvent(name)
    const result = await action.run(() =>
      lookup.byEvent(name, { limit: 20, ...(cursor ? { cursor } : {}) }),
    )
    if (result.ok && generation === epoch.current && permitted) setPage(result.value)
    else if (!result.ok && generation === epoch.current) {
      setIdentity(null)
      setPage(null)
    }
  }
  return (
    <details
      onToggle={(event) => {
        if (!event.currentTarget.open) clear()
      }}
    >
      <summary>{l('按工具地址与事件定位', 'Locate by tool address or event')}</summary>
      <p className="subtitle">
        {l(
          '读取当前非归档 Policy 的正式身份，不改写历史事实，也不授予执行权限。共享事件可能关联多个 Policy。',
          'Read current, non-archived Policy identity without changing historical facts or granting execution. One event may be shared by several Policies.',
        )}
      </p>
      {!permitted && (
        <Alert
          type="info"
          title={l(
            '此辅助定位需要 Policy 读取权限；仍可直接检索已授权的审计或设备活动。',
            'This lookup requires PolicyRead. You can still directly query authorized audit or device activities.',
          )}
        />
      )}
      <Form
        name={prefix + '-address'}
        form={form}
        initialValues={{ kind: 'id' }}
        layout="vertical"
        disabled={!permitted || action.busy}
        onFinish={(value) => void resolve(value)}
      >
        <div className="admin-form-grid">
          <Form.Item name="kind" label={l('地址类型', 'Address type')}>
            <Select
              options={[
                { value: 'id', label: l('Policy ID', 'Policy ID') },
                { value: 'tool_name', label: l('正式工具名', 'Formal tool name') },
                { value: 'alias', label: l('工具别名', 'Tool alias') },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="value"
            label={l('精确地址', 'Exact address')}
            rules={[{ required: true }]}
          >
            <Input autoComplete="off" maxLength={256} />
          </Form.Item>
        </div>
        <Button htmlType="submit" disabled={!permitted || action.busy}>
          {l('读取当前身份', 'Read current identity')}
        </Button>
      </Form>
      {action.error && ['not_found', 'policy_not_found'].includes(codeOf(action.error)) ? (
        <Alert
          type="info"
          title={l(
            '当前非归档配置不可解析。历史事实仍可按已有目标 ID 检索。',
            'No current non-archived configuration can be resolved. Historical facts remain searchable by known target ID.',
          )}
        />
      ) : (
        <Failure error={action.error} locale={locale} kind="read" />
      )}
      {identity && permitted && (
        <>
          <h3>{l('当前配置身份（本次读取）', 'Current configuration identity (this read)')}</h3>
          <Descriptions column={1} size="small">
            <Descriptions.Item label={l('Policy ID', 'Policy ID')}>{identity.id}</Descriptions.Item>
            <Descriptions.Item label={l('正式工具名', 'Formal tool name')}>
              {identity.toolName}
            </Descriptions.Item>
            <Descriptions.Item label={l('别名', 'Alias')}>
              {identity.alias ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label={l('事件配置', 'Configured event')}>
              {identity.customEvent ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label={l('当前状态与版本', 'Current state and version')}>
              <Status value={identity.state} locale={locale} /> {identity.revision} ·{' '}
              {identity.versionId}
            </Descriptions.Item>
          </Descriptions>
          <Space wrap>
            <Button onClick={() => onPolicy(identity, false)}>
              {l('查看此 Policy 审计', 'Audit for this Policy')}
            </Button>
            {device && (
              <Button onClick={() => onPolicy(identity, true)}>
                {l('查看此设备的 Policy 活动', 'Policy activities on this device')}
              </Button>
            )}
            {identity.customEvent && (
              <Button onClick={() => void byEvent(identity.customEvent!)} disabled={action.busy}>
                {l('查看同事件的 Policy', 'Policies sharing this event')}
              </Button>
            )}
          </Space>
        </>
      )}
      <Form
        name={prefix + '-event'}
        form={events}
        layout="vertical"
        disabled={!permitted || action.busy}
        onFinish={(value) => void byEvent(value.event.trim())}
      >
        <Form.Item
          name="event"
          label={l('精确事件名', 'Exact event name')}
          rules={[{ required: true }]}
        >
          <Input maxLength={256} autoComplete="off" />
        </Form.Item>
        <Button htmlType="submit" disabled={!permitted || action.busy}>
          {l('查找关联 Policy', 'Find associated Policies')}
        </Button>
      </Form>
      {page && permitted && (
        <>
          <p className="subtitle">
            {l('事件', 'Event')} · {event}
          </p>
          <DataTable
            locale={locale}
            dataSource={page.items}
            rowKey="id"
            columns={[
              { title: l('正式工具名', 'Formal tool name'), dataIndex: 'toolName' },
              { title: l('别名', 'Alias'), dataIndex: 'alias' },
              {
                title: l('定位', 'Locate'),
                render: (_, row) => (
                  <Button
                    onClick={() => {
                      setIdentity(row)
                    }}
                  >
                    {l('选择此 Policy', 'Select this Policy')}
                  </Button>
                ),
              },
            ]}
          />
          <Button
            disabled={!page.nextCursor || action.busy}
            onClick={() => {
              if (page.nextCursor) void byEvent(event, page.nextCursor)
            }}
          >
            {l('下一页关联 Policy', 'Next associated Policies')}
          </Button>
        </>
      )}
    </details>
  )
}
