import { useId, useState } from 'react'
import { Alert, Button, Card, Form, Input, Select, Space } from 'antd'
import type { CertificateArchive, Vault } from '@rss/mdm-certificates/archive'
import type { Locale } from './i18n'
import { Failure, labels, useAction } from './AdminUi'
import { timestamp } from './DevicePresentation'
import { ArchiveCommandState, useArchiveCommand } from './ArchiveCommand'
import { inputFingerprint, useProtectedDelivery } from './useProtectedDelivery'
export function ArchiveVault({
  archive,
  vault,
  locale,
  canRead,
  canWrite,
  canUnlock,
  onVault,
  onRefresh,
}: {
  archive: CertificateArchive
  vault: Vault | null
  locale: Locale
  canRead: boolean
  canWrite: boolean
  canUnlock: boolean
  onVault: (value: Vault | null) => void
  onRefresh: () => void
}) {
  const formPrefix = useId()

  const [mode, setMode] = useState<'initialize' | 'password_change'>('password_change'),
    l = labels(locale),
    action = useAction(),
    command = useArchiveCommand(archive),
    [unlockForm] = Form.useForm<{ password: string }>(),
    [masterForm] = Form.useForm<{ password: string; oldPassword: string }>(),
    delivery = useProtectedDelivery(() => {
      unlockForm.resetFields()
      if (canWrite || command.pending) masterForm.resetFields()
    }, canUnlock)
  function clear() {
    delivery.clear()
    unlockForm.resetFields()
    if (canWrite || command.pending) masterForm.resetFields()
  }
  async function unlock(value: { password: string }) {
    let password = value.password
    value.password = ''
    unlockForm.resetFields()
    const epoch = delivery.capture()
    try {
      await action.run(async () => {
        if (!delivery.isCurrent(epoch)) return
        const result = await archive.unlock(password)
        if (delivery.isCurrent(epoch)) onVault(result)
      })
    } finally {
      password = ''
    }
  }
  async function master(
    value: { password: string; oldPassword: string },
    kind: 'initialize' | 'password_change',
  ) {
    let password = value.password,
      oldPassword = value.oldPassword ?? ''
    value.password = ''
    value.oldPassword = ''
    if (canWrite || command.pending) masterForm.resetFields()
    const epoch = delivery.capture()
    try {
      const prepared = await action.run(async () => {
        const fingerprint = await inputFingerprint(JSON.stringify([kind, oldPassword, password]))
        if (!delivery.isCurrent(epoch)) return null
        if (command.pending && command.pending.kind !== kind)
          throw { cause: 'client', code: 'invalid_input' }
        return {
          change: command.pending ?? { kind, operationId: crypto.randomUUID(), fingerprint },
          fingerprint,
        }
      })
      if (prepared.ok && prepared.value && delivery.isCurrent(epoch)) {
        const { change, fingerprint } = prepared.value
        const result = await command.submit(
          change,
          kind === 'initialize'
            ? { kind, password, fingerprint }
            : { kind, oldPassword, newPassword: password, fingerprint },
        )
        if (result.ok) {
          onVault(null)
          onRefresh()
        }
      }
    } finally {
      password = ''
      oldPassword = ''
    }
  }
  const masterKind =
      command.pending?.kind === 'initialize'
        ? 'initialize'
        : command.pending?.kind === 'password_change'
          ? 'password_change'
          : vault?.initialized === false
            ? 'initialize'
            : mode,
    busy = action.busy || command.busy
  return (
    <Card title={l('档案解锁', 'Archive unlock')}>
      <p>
        {l('主密码代次', 'Master-password generation')} ·{' '}
        {vault?.generation ?? l('尚未读取', 'Unread')} ·{' '}
        {vault?.initialized === false
          ? l('尚未初始化', 'Not initialized')
          : vault?.unlockedUntil
            ? `${l('解锁至', 'Unlocked until')} ${timestamp(locale, vault.unlockedUntil)}`
            : l('当前锁定或尚未确认', 'Locked or unconfirmed')}
      </p>
      <Alert
        type="info"
        title={l(
          '解锁只允许本主体在当前档案代次内访问材料。读取、写入和导出权限分别检查；解锁不会部署证书。',
          'Unlock applies only to this principal and archive generation. Read, write and export permissions are checked separately; unlocking does not deploy certificates.',
        )}
      />
      <Failure error={action.error} locale={locale} />
      <details
        onToggle={(event) => {
          if (!event.currentTarget.open) clear()
        }}
      >
        <summary>{l('解锁与锁定档案', 'Unlock and lock archive')}</summary>
        <Form
          name={formPrefix + '-0'}
          form={unlockForm}
          layout="vertical"
          onFinish={(value) => void unlock(value)}
          disabled={!canUnlock || busy || vault?.initialized === false}
        >
          <Form.Item
            name="password"
            label={l('档案主密码', 'Archive master password')}
            rules={[{ required: true }]}
          >
            <Input.Password autoComplete="off" visibilityToggle={false} />
          </Form.Item>
          <Space wrap>
            <Button htmlType="submit" disabled={!canUnlock || busy || vault?.initialized === false}>
              {l('解锁档案', 'Unlock archive')}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                clear()
                onVault(null)
                void action.run(async () => {
                  await archive.lock()
                  onRefresh()
                })
              }}
            >
              {l('清除本地秘密并锁定档案', 'Clear local secrets and lock archive')}
            </Button>
            <Button onClick={clear}>{l('清除输入', 'Clear input')}</Button>
          </Space>
        </Form>
      </details>
      {(canWrite || command.pending) && (
        <details
          onToggle={(event) => {
            if (!event.currentTarget.open) clear()
          }}
        >
          <summary>{l('主密码管理', 'Master-password management')}</summary>
          <Form
            name={formPrefix + '-1'}
            form={masterForm}
            preserve={false}
            layout="vertical"
            disabled={!canWrite || !canUnlock || busy}
            onFinish={(value) => void master(value, masterKind)}
          >
            {vault === null && !command.pending && (
              <Form.Item label={l('主密码操作', 'Master-password operation')}>
                <Select
                  aria-label={l('主密码操作', 'Master-password operation')}
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'initialize', label: l('首次初始化', 'First initialization') },
                    {
                      value: 'password_change',
                      label: l('变更已有主密码', 'Change existing master password'),
                    },
                  ]}
                />
              </Form.Item>
            )}
            <p>
              {masterKind === 'initialize'
                ? l('首次初始化不会自动解锁。', 'Initialization does not unlock automatically.')
                : l(
                    '变更主密码会使原代次的解锁失效。',
                    'Changing the master password invalidates unlocks for the previous generation.',
                  )}
            </p>
            {masterKind === 'password_change' && (
              <Form.Item
                name="oldPassword"
                label={l('原主密码', 'Previous master password')}
                rules={[{ required: true }]}
              >
                <Input.Password autoComplete="off" visibilityToggle={false} />
              </Form.Item>
            )}
            <Form.Item
              name="password"
              label={
                masterKind === 'initialize'
                  ? l('设置主密码（至少 12 字符）', 'Set master password (at least 12 characters)')
                  : l('新主密码（至少 12 字符）', 'New master password (at least 12 characters)')
              }
              rules={[{ required: true }]}
            >
              <Input.Password autoComplete="off" visibilityToggle={false} />
            </Form.Item>
            <Button htmlType="submit" disabled={!canWrite || !canUnlock || busy}>
              {command.pending
                ? l(
                    '重新输入并显式重提原操作',
                    'Re-enter and explicitly resubmit original operation',
                  )
                : masterKind === 'initialize'
                  ? l('初始化档案', 'Initialize archive')
                  : l('变更主密码', 'Change master password')}
            </Button>
          </Form>
          <ArchiveCommandState
            command={command}
            locale={locale}
            canRead={canRead}
            canWrite={canWrite && canUnlock}
            onResolved={onRefresh}
          />
        </details>
      )}
    </Card>
  )
}
