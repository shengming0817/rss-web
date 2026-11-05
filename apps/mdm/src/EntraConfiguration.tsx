import { useState } from 'react'
import { Alert, Button, Checkbox, Form, Input, Space } from 'antd'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, ReadState, useAction, useRead } from './AdminUi'
import { useAdministration } from './useAdministration'
export function EntraConfiguration({
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
    read = useRead(`${binding}/entra-policy`, enrollment.entra),
    [pending, setPending] = useState<ReturnType<typeof enrollment.prepareEntra> | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none')
  async function submit(change: NonNullable<typeof pending>) {
    const result = await action.run(() =>
      enrollment.saveEntra(change.operationId, change.expectedRevision, change.policy),
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
          '此页管理 Entra 原生注册资格与条款。组织加入、外部身份资格与 Windows 设备效果由真实流程验证；保存配置不代表已完成。',
          'Configure Entra native eligibility and terms. Organization join, external identity eligibility and Windows device effects require the real native flow; saving configuration does not establish them.',
        )}
      />
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      <Failure error={action.error} locale={locale} />
      {read.value && (
        <Form
          key={read.value.revision}
          layout="vertical"
          initialValues={{ ...read.value.policy, usersText: read.value.policy.users.join('\n') }}
          disabled={!canWrite || action.busy || pending !== null}
          onFinish={(value: {
            enabled: boolean
            allUsers: boolean
            usersText: string
            termsVersion: string
            termsText: string
            allowBackground: boolean
          }) =>
            void action
              .run(async () =>
                enrollment.prepareEntra(crypto.randomUUID(), read.value!, {
                  enabled: value.enabled,
                  allUsers: value.allUsers,
                  users: value.usersText.split(/\s+/).filter(Boolean),
                  termsVersion: value.termsVersion,
                  termsText: value.termsText,
                  allowBackground: value.allowBackground,
                }),
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
          <Form.Item name="enabled" valuePropName="checked">
            <Checkbox>
              {l('启用 Entra 原生注册策略', 'Enable Entra native enrollment policy')}
            </Checkbox>
          </Form.Item>
          <Form.Item name="allUsers" valuePropName="checked">
            <Checkbox>
              {l('允许所有符合后台资格的用户', 'Allow all backend-eligible users')}
            </Checkbox>
          </Form.Item>
          <Form.Item
            name="usersText"
            label={l(
              '指定 Entra 用户标识（每行一个 UUID）',
              'Selected Entra user IDs (one UUID per line)',
            )}
          >
            <Input.TextArea rows={5} />
          </Form.Item>
          <Form.Item
            name="termsVersion"
            label={l('条款版本', 'Terms version')}
            rules={[{ required: true }]}
          >
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item
            name="termsText"
            label={l(
              '条款正文（最多 32768 字节，变更正文需新版本）',
              'Terms text (32768 bytes; changes require a new version)',
            )}
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={12} maxLength={32768} />
          </Form.Item>
          <Form.Item name="allowBackground" valuePropName="checked">
            <Checkbox>
              {l('允许正式协议中的后台注册方式', 'Allow the formal background enrollment mode')}
            </Checkbox>
          </Form.Item>
          {canWrite && (
            <Button type="primary" htmlType="submit">
              {l('保存 Entra 策略', 'Save Entra policy')}
            </Button>
          )}
        </Form>
      )}
      <Space wrap>
        <Button onClick={read.reload}>{l('读取 Entra 策略', 'Read Entra policy')}</Button>
        <a href="/security" target="_blank" rel="noopener noreferrer">
          {l('在新窗口完成重认证', 'Reauthenticate in a new window')}
        </a>
      </Space>
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
                ? l(
                    '原策略变更已确认，读取最新版本',
                    'Original policy change confirmed; read latest',
                  )
                : l('放弃已拒绝策略并重读', 'Discard rejected policy and read again')}
            </Button>
          ) : (
            <>
              <Alert
                type="warning"
                title={l(
                  '原策略提交结果未知。当前策略读取仅供比较，原请求保持固定。',
                  'The original policy outcome is unknown. Current reads allow comparison; the original request remains fixed.',
                )}
              />
              <Button disabled={action.busy} onClick={() => void submit(pending)}>
                {l('显式重提原 Entra 策略', 'Resubmit original Entra policy')}
              </Button>
            </>
          )}
        </div>
      )}
    </>
  )
}
