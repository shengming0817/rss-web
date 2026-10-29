import { validateInput, Failure, isUnknown, labels, ReadState, useAction, useRead } from './AdminUi'
import { validateAgentSettings } from '@rss/mdm-enrollment'
import { SelectionGuard, useSelectionGuard, usePendingSelection } from './SelectionGuard'
import { useState } from 'react'
import { Alert, Button, Card, Form, InputNumber, Select, Tabs } from 'antd'
import type { Channel, ChannelSetting, Limits, User } from '@rss/mdm-enrollment'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { useAdministration } from './useAdministration'
import { UserPicker } from './UserPicker'
import { Status } from './DevicePresentation'
const channelNames: Record<Channel, string> = {
  agent: 'Agent',
  windows_mdm: 'Windows MDM',
  macos_mdm: 'macOS MDM',
}
function AdmissionEditor({
  runtime,
  locale,
  canWrite,
}: {
  runtime: Runtime
  locale: Locale
  canWrite: boolean
}) {
  const l = labels(locale),
    { enrollment, binding } = useAdministration(runtime),
    action = useAction(),
    read = useRead(`${binding}/channel-administration`, enrollment.channels),
    [pending, setPending] = useState<{
      operationId: string
      expectedRevision: number
      channel: Channel
      admission: ChannelSetting['admission']
    } | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none')
  async function submit(change: NonNullable<typeof pending>) {
    const result = await action.run(() =>
      enrollment.admission(
        change.channel,
        change.operationId,
        change.expectedRevision,
        change.admission,
      ),
    )
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) read.reload()
  }
  return (
    <>
      <Alert
        type="info"
        title={l(
          '暂停只影响新注册准入。已有设备维护、查询、撤销与公开安装包下载继续可用。',
          'Pausing changes only new enrollment admission. Existing maintenance, queries, revocations and public installer downloads remain available.',
        )}
      />
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      <Failure error={action.error} locale={locale} />
      <Button disabled={action.busy} onClick={read.reload}>
        {l('读取通道状态', 'Read channel state')}
      </Button>
      <div className="device-detail-grid">
        {read.value?.channels.map((channel) => (
          <Card key={channel.channel} title={channelNames[channel.channel]}>
            <p>
              <Status locale={locale} value={channel.admission} />
              <Status locale={locale} value={channel.availability} />
            </p>
            <p className="subtitle">
              {l('版本', 'Revision')} · {channel.revision} · {channel.reason ?? '—'}
            </p>
            {canWrite && (
              <Button
                disabled={action.busy || pending !== null}
                onClick={() => {
                  const change = Object.freeze({
                    operationId: crypto.randomUUID(),
                    expectedRevision: channel.revision,
                    channel: channel.channel,
                    admission:
                      channel.admission === 'allowed' ? ('paused' as const) : ('allowed' as const),
                  })
                  setPending(change)
                  void submit(change)
                }}
              >
                {channel.admission === 'allowed'
                  ? l('暂停新注册', 'Pause new enrollment')
                  : l('允许新注册', 'Allow new enrollment')}
              </Button>
            )}
          </Card>
        ))}
      </div>
      {pending && (
        <div className="admin-recovery">
          <code>{pending.operationId}</code>
          {outcome === 'confirmed' ? (
            <Button
              onClick={() => {
                setPending(null)
                setOutcome('none')
                action.clear()
                read.reload()
              }}
            >
              {l('原准入变更已确认，重新读取', 'Admission change confirmed; read again')}
            </Button>
          ) : outcome === 'rejected' ? (
            <Button
              onClick={() => {
                setPending(null)
                setOutcome('none')
                action.clear()
                read.reload()
              }}
            >
              {l('放弃已拒绝变更并重读', 'Discard rejected change and read again')}
            </Button>
          ) : (
            <>
              <Alert
                type="warning"
                title={l(
                  '当前通道读取仅供比较，不确认原变更。',
                  'Current channel reads allow comparison and do not confirm the original change.',
                )}
              />
              <Button disabled={action.busy} onClick={() => void submit(pending)}>
                {l('显式重提原准入变更', 'Resubmit original admission change')}
              </Button>
            </>
          )}
        </div>
      )}
    </>
  )
}
function QuotaEditor({
  runtime,
  locale,
  target,
  canWrite,
}: {
  runtime: Runtime
  locale: Locale
  target: User | null
  canWrite: boolean
}) {
  const l = labels(locale),
    { enrollment, binding } = useAdministration(runtime),
    action = useAction(),
    read = useRead(
      `${binding}/quota/${target?.instanceId ?? 'defaults'}/${target?.principalId ?? ''}`,
      () => enrollment.quota(target),
    ),
    usage = useRead(
      `${binding}/quota-usage/${target?.instanceId ?? 'self'}/${target?.principalId ?? ''}`,
      () => enrollment.usage(target),
    ),
    [pending, setPending] = useState<ReturnType<typeof enrollment.prepareQuota> | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none')
  usePendingSelection(
    action.busy || (pending !== null && !['confirmed', 'rejected'].includes(outcome)),
  )
  async function submit(change: NonNullable<typeof pending>) {
    const result = await action.run(() =>
      enrollment.saveQuota(
        change.target,
        change.operationId,
        change.expectedRevision,
        change.limits,
      ),
    )
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) {
      read.reload()
      usage.reload()
    }
  }
  return (
    <>
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      <Failure error={action.error} locale={locale} />
      {read.value && (
        <Form
          key={read.value.revision}
          layout="vertical"
          disabled={!canWrite || action.busy || pending !== null}
          initialValues={read.value.limits}
          onFinish={(values: Limits) =>
            void action
              .run(async () =>
                enrollment.prepareQuota(crypto.randomUUID(), read.value!, values, target),
              )
              .then((result) => {
                if (result.ok) {
                  setPending(result.value)
                  void submit(result.value)
                }
              })
          }
        >
          <p className="subtitle">
            {l('已读取版本', 'Loaded revision')} · {read.value.revision}
          </p>
          {(['agent', 'windows_mdm', 'macos_mdm'] as const).map((channel) => (
            <Form.Item
              key={channel}
              name={channel}
              label={`${channelNames[channel]}${target ? l('（留空继承默认）', ' (empty inherits default)') : ''}`}
              rules={target ? [] : [{ required: true }]}
            >
              <InputNumber min={0} max={4294967295} precision={0} />
            </Form.Item>
          ))}
          {canWrite && (
            <Button type="primary" htmlType="submit">
              {l('保存注册配额', 'Save enrollment quotas')}
            </Button>
          )}
        </Form>
      )}
      <Button
        onClick={() => {
          read.reload()
          usage.reload()
        }}
      >
        {l('重新读取配额与用量', 'Read quota and usage again')}
      </Button>
      <ReadState busy={usage.busy} error={usage.error} locale={locale} />
      {usage.value && (
        <div className="device-detail-grid">
          {usage.value.channels.map((channel) => (
            <Card key={channel.channel} title={channelNames[channel.channel]}>
              <dl className="device-facts">
                <div>
                  <dt>{l('有效额度', 'Effective limit')}</dt>
                  <dd>{channel.limit}</dd>
                </div>
                <div>
                  <dt>{l('有效 / 预留 / 已用', 'Active / reserved / used')}</dt>
                  <dd>
                    {channel.active} / {channel.reserved} / {channel.used}
                  </dd>
                </div>
                <div>
                  <dt>{l('超额', 'Over limit')}</dt>
                  <dd>{channel.overLimit}</dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      )}
      {!target && (
        <p className="subtitle">
          {l(
            '此处显示当前账户用量；用户配额页可查看指定人员。',
            'Usage shown here belongs to the current account. Select a person on User quotas to view their usage.',
          )}
        </p>
      )}
      {pending && (
        <div className="admin-recovery">
          <code>{pending.operationId}</code>
          {outcome === 'confirmed' || outcome === 'rejected' ? (
            <Button
              disabled={action.busy}
              onClick={() => {
                setPending(null)
                setOutcome('none')
                action.clear()
                read.reload()
                usage.reload()
              }}
            >
              {outcome === 'confirmed'
                ? l('变更已确认，读取最新版本', 'Change confirmed; read latest')
                : l('放弃已拒绝变更并重读', 'Discard rejected change and read again')}
            </Button>
          ) : (
            <>
              <Alert
                type="warning"
                title={l(
                  '原请求结果未知。当前读取只供比较，不能据此确认原操作。',
                  'The original outcome is unknown. Current reads allow comparison only.',
                )}
              />
              <Button disabled={action.busy} onClick={() => void submit(pending)}>
                {l('显式重提原配额请求', 'Resubmit original quota request')}
              </Button>
            </>
          )}
        </div>
      )}
    </>
  )
}
function AgentSettings({
  runtime,
  locale,
  canWrite,
}: {
  runtime: Runtime
  locale: Locale
  canWrite: boolean
}) {
  const l = labels(locale),
    { enrollment, binding } = useAdministration(runtime),
    action = useAction(),
    read = useRead(`${binding}/agent-enrollment-settings`, enrollment.agentSettings),
    [pending, setPending] = useState<{
      operationId: string
      expectedRevision: number
      values: NonNullable<typeof read.value>['values']
    } | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none')
  async function submit(change: NonNullable<typeof pending>) {
    const result = await action.run(() =>
      enrollment.saveAgentSettings(change.operationId, change.expectedRevision, change.values),
    )
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) read.reload()
  }
  return (
    <>
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      <Failure error={action.error} locale={locale} />
      {read.value && (
        <Form
          key={read.value.revision}
          layout="vertical"
          initialValues={read.value.values}
          disabled={!canWrite || action.busy || pending !== null}
          onFinish={(values: NonNullable<typeof read.value>['values']) => {
            const change = Object.freeze({
              operationId: crypto.randomUUID(),
              expectedRevision: read.value!.revision,
              values: Object.freeze({ ...values, platforms: Object.freeze([...values.platforms]) }),
            })
            void action
              .run(async () => {
                validateInput(() => validateAgentSettings(change.values))
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
            name="grantSeconds"
            label={l('注册授权有效期（秒）', 'Enrollment grant lifetime (seconds)')}
            rules={[{ required: true }]}
          >
            <InputNumber min={1} max={read.value.grantMaxSeconds} precision={0} />
          </Form.Item>
          <Form.Item
            name="configurationDefaultSeconds"
            label={l('安装配置默认有效期（秒）', 'Default configuration lifetime (seconds)')}
            rules={[{ required: true }]}
          >
            <InputNumber min={1} max={read.value.configurationMaxSeconds} precision={0} />
          </Form.Item>
          <Form.Item
            name="platforms"
            label={l('允许的平台', 'Allowed platforms')}
            rules={[{ required: true }]}
          >
            <Select
              mode="multiple"
              options={[
                { value: 'windows', label: 'Windows' },
                { value: 'macos', label: 'macOS' },
              ]}
            />
          </Form.Item>
          {canWrite && (
            <Button type="primary" htmlType="submit">
              {l('保存 Agent 注册设置', 'Save Agent enrollment settings')}
            </Button>
          )}
        </Form>
      )}
      <Button onClick={read.reload}>
        {l('读取 Agent 注册设置', 'Read Agent enrollment settings')}
      </Button>
      {pending && (
        <div className="admin-recovery">
          <code>{pending.operationId}</code>
          {outcome === 'confirmed' || outcome === 'rejected' ? (
            <Button
              onClick={() => {
                setPending(null)
                setOutcome('none')
                action.clear()
                read.reload()
              }}
            >
              {outcome === 'confirmed'
                ? l('读取已更新设置', 'Read updated settings')
                : l('放弃已拒绝设置并重读', 'Discard rejected settings and read again')}
            </Button>
          ) : (
            <Button disabled={action.busy} onClick={() => void submit(pending)}>
              {l('显式重提原设置', 'Resubmit original settings')}
            </Button>
          )}
        </div>
      )}
    </>
  )
}
export function RegistrationAdministration({
  runtime,
  locale,
  canWrite,
}: {
  runtime: Runtime
  locale: Locale
  canWrite: boolean
}) {
  const guard = useSelectionGuard()
  const l = labels(locale),
    [target, setTarget] = useState<User | null>(null),
    [selectionPending, setSelectionPending] = useState(false)
  return (
    <Tabs
      items={[
        {
          key: 'channels',
          label: l('通道准入', 'Channel admission'),
          children: <AdmissionEditor runtime={runtime} locale={locale} canWrite={canWrite} />,
        },
        {
          key: 'defaults',
          label: l('默认配额', 'Default quotas'),
          children: (
            <QuotaEditor runtime={runtime} locale={locale} target={null} canWrite={canWrite} />
          ),
        },
        {
          key: 'user',
          label: l('用户配额', 'User quotas'),
          children: (
            <>
              <UserPicker
                runtime={runtime}
                locale={locale}
                value={target}
                onChange={setTarget}
                onPendingChange={setSelectionPending}
                disabled={guard.locked}
              />
              {target && (
                <SelectionGuard.Provider value={guard.register}>
                  <QuotaEditor
                    key={`${target.instanceId}/${target.principalId}`}
                    runtime={runtime}
                    locale={locale}
                    target={target}
                    canWrite={canWrite && !selectionPending}
                  />
                </SelectionGuard.Provider>
              )}
            </>
          ),
        },
        {
          key: 'agent',
          label: l('Agent 注册设置', 'Agent enrollment settings'),
          children: <AgentSettings runtime={runtime} locale={locale} canWrite={canWrite} />,
        },
      ]}
    />
  )
}
