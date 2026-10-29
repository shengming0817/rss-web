import { useState } from 'react'
import { Alert, Button, Form, Input, InputNumber, Space } from 'antd'
import { profileExtensions, validateLocalProfile, type LocalProfileChange } from '@rss/auth-core'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { useAdministration } from './useAdministration'
import { Failure, isUnknown, labels, ReadState, useAction, useRead } from './AdminUi'
export function LocalProfile({
  runtime,
  locale,
  principal,
}: {
  runtime: Runtime
  locale: Locale
  principal: string
}) {
  const l = labels(locale),
    { identity, binding } = useAdministration(runtime),
    action = useAction()
  const read = useRead(`${binding}/local-profile/${principal}`, () =>
    identity.localProfile(principal),
  )
  const [pending, setPending] = useState<LocalProfileChange | null>(null),
    [writeOutcome, setWriteOutcome] = useState<
      'none' | 'pending' | 'unknown' | 'rejected' | 'confirmed'
    >('none'),
    [invalid, setInvalid] = useState(false)
  const confirmed = writeOutcome === 'confirmed'
  async function submit(change: LocalProfileChange) {
    setWriteOutcome('pending')
    const r = await action.run(() => identity.saveLocalProfile(principal, change))
    setWriteOutcome(r.ok ? 'confirmed' : isUnknown(r.error) ? 'unknown' : 'rejected')
  }
  return (
    <>
      <Alert
        type="info"
        title={l(
          '本地资料修改在下一次登录时采集，不覆盖 IdP 观察，也不确认邮箱验证状态。扩展保存为完整替换，未知允许键会保留。',
          'Local edits are collected at the next login. They do not replace IdP observations or verify email. Extensions are replaced in full, preserving allowed unknown keys.',
        )}
      />
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      <Failure error={action.error} locale={locale} />
      {invalid && (
        <Alert
          type="error"
          title={l(
            '请检查资料文本和 JSON 预算：64 KiB、总对象成员256、深度8、每个数组128项；秘密键不可保存。',
            'Check profile text and JSON budgets: 64 KiB, 256 total object members, depth 8, 128 items per array. Secret keys cannot be saved.',
          )}
          role="alert"
        />
      )}
      {confirmed && (
        <Alert
          type="success"
          title={l(
            '原资料操作已确认。需重新读取详情或重新登录后查看新的观察。',
            'The original profile operation is confirmed. Read the detail again, or sign in again for a new observation.',
          )}
        />
      )}
      <Button
        disabled={action.busy || (pending !== null && !confirmed)}
        onClick={() => {
          setPending(null)
          setWriteOutcome('none')
          action.clear()
          read.reload()
        }}
      >
        {l('读取本地资料', 'Read local profile')}
      </Button>
      {read.value && (
        <Form
          key={read.value.revision}
          layout="vertical"
          disabled={action.busy || pending !== null}
          initialValues={
            read.value.value
              ? {
                  ...read.value.value,
                  extensionsText: JSON.stringify(read.value.value.extensions, null, 2),
                }
              : {
                  displayName: '',
                  username: '',
                  email: '',
                  extensionsText: '{}',
                  maxAgeSeconds: 14400,
                }
          }
          onFinish={(v: {
            displayName: string | null
            username: string | null
            email: string | null
            extensionsText: string
            maxAgeSeconds: number
          }) => {
            try {
              const value = {
                displayName: v.displayName,
                username: v.username,
                email: v.email,
                extensions: profileExtensions(JSON.parse(v.extensionsText)),
                maxAgeSeconds: v.maxAgeSeconds,
              }
              validateLocalProfile(value)
              const change = {
                operationId: crypto.randomUUID(),
                expectedRevision: read.value!.revision,
                value,
              }
              setPending(change)
              setInvalid(false)
              void submit(change)
            } catch {
              setInvalid(true)
            }
          }}
        >
          <p className="subtitle">revision {read.value.revision}</p>
          <Form.Item name="displayName" label={l('显示名称', 'Display name')}>
            <Input maxLength={512} />
          </Form.Item>
          <Form.Item name="username" label={l('用户名', 'Username')}>
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item name="email" label={l('邮箱', 'Email')}>
            <Input maxLength={320} />
          </Form.Item>
          <Form.Item
            name="maxAgeSeconds"
            label={l('观察最长有效期（秒）', 'Maximum observation age (seconds)')}
            rules={[{ required: true }]}
          >
            <InputNumber min={60} max={86400} />
          </Form.Item>
          <Form.Item
            name="extensionsText"
            label={l('完整扩展 JSON', 'Complete extensions JSON')}
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={10} spellCheck={false} maxLength={65536} />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              {l('保存本地资料', 'Save local profile')}
            </Button>
            <Button
              danger
              onClick={() => {
                const change = {
                  operationId: crypto.randomUUID(),
                  expectedRevision: read.value!.revision,
                  value: null,
                }
                setPending(change)
                void submit(change)
              }}
            >
              {l('清除本地资料', 'Clear local profile')}
            </Button>
          </Space>
        </Form>
      )}
      {pending && writeOutcome === 'rejected' && (
        <Button
          disabled={action.busy}
          onClick={() => {
            setPending(null)
            setWriteOutcome('none')
            action.clear()
            read.reload()
          }}
        >
          {l('放弃已拒绝请求并读取最新版本', 'Discard rejected request and read latest version')}
        </Button>
      )}
      {pending && !confirmed && writeOutcome !== 'rejected' && (
        <div className="admin-recovery">
          <code>{pending.operationId}</code>
          <Space>
            <Button
              disabled={action.busy}
              onClick={() =>
                void action
                  .run(() => identity.localProfileOperation(principal, pending.operationId))
                  .then((r) => {
                    if (r.ok && r.value?.revision === pending.expectedRevision + 1)
                      setWriteOutcome('confirmed')
                  })
              }
            >
              {l('查询原资料操作', 'Read original profile operation')}
            </Button>
            <Button disabled={action.busy} onClick={() => void submit(pending)}>
              {l('显式重提原请求', 'Resubmit original request')}
            </Button>
          </Space>
        </div>
      )}
    </>
  )
}
