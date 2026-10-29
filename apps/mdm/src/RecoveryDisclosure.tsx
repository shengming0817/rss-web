import { useId, useState } from 'react'
import { Alert, Button, Card, Form, Input, InputNumber, Select } from 'antd'
import { freeze } from '@rss/mdm-inventory'
import {
  validateReference,
  type MaterialRef,
  type RecoveryCredentials,
} from '@rss/mdm-recovery-credentials'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, Heading, labels, ReadState, useAction, useRead, validateInput } from './AdminUi'
import { useAdministration } from './useAdministration'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import { SecretPanel } from './SecretTabs'
import { MaterialDisclosure } from './MaterialDisclosure'

/** Exact coordinates require Credentials only; no Inventory/DeviceView read is performed. */
export function RecoveryDisclosure({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { recoveryCredentials, authorization, binding } = useAdministration(runtime),
    permissions = useRead(`${binding}/exact-credential-permissions`, authorization.effective),
    grants = !permissions.error && !permissions.busy ? (permissions.value?.grants ?? []) : [],
    candidates = grants.filter(
      (grant) =>
        grant.operation === 'credentials' &&
        (grant.scope.kind === 'all_devices' || grant.scope.kind === 'device'),
    ),
    permitted = candidates.length > 0
  return (
    <>
      <Heading
        title={l('恢复凭据披露', 'Recovery credential disclosure')}
        hint={l(
          '使用已有的精确设备和材料坐标。目录读取与秘密披露分别授权。',
          'Use known exact device and material coordinates. Directory reads and secret disclosure are separately authorized.',
        )}
        actions={
          <Button onClick={permissions.reload}>
            {l('读取当前披露权限', 'Read current disclosure permissions')}
          </Button>
        }
      />
      <ReadState busy={permissions.busy} error={permissions.error} locale={locale} />
      {!permissions.busy && !permitted && (
        <Alert
          type="info"
          title={l(
            '当前没有恢复凭据披露权限。',
            'Recovery credential disclosure permission is unavailable.',
          )}
        />
      )}
      <ExactMaterialDisclosure
        runtime={runtime}
        credentials={recoveryCredentials}
        locale={locale}
        permitted={permitted}
        allowsDevice={(device) =>
          candidates.some(
            (grant) =>
              grant.scope.kind === 'all_devices' ||
              (grant.scope.kind === 'device' && grant.scope.id === device),
          )
        }
      />
    </>
  )
}

export function ExactMaterialDisclosure({
  runtime,
  credentials,
  locale,
  device,
  permitted,
  allowsDevice,
}: {
  runtime: Runtime
  credentials: RecoveryCredentials
  locale: Locale
  device?: string
  permitted: boolean
  allowsDevice?: (device: string) => boolean
}) {
  const formPrefix = useId()

  const l = labels(locale),
    guard = useSelectionGuard(),
    lookup = useAction(),
    [form] = Form.useForm<{
      device?: string
      id: string
      version: number
      kind: 'ordinary' | 'rss_login'
    }>(),
    [manual, setManual] = useState<{ target: MaterialRef; rssLogin: boolean } | null>(null)
  usePendingSelection(guard.locked)
  return (
    <SelectionGuard.Provider value={guard.register}>
      <SecretPanel active={permitted}>
        <Card title={l('按精确坐标披露材料', 'Disclose material by exact coordinates')}>
          <p className="subtitle">
            {l(
              '不要求目录读取权限。类型、当前权限和用途由正式披露接口校验；错误类型会被拒绝。',
              'Directory read permission is not required. Formal disclosure endpoints verify type, current permission and purpose; a wrong type is rejected.',
            )}
          </p>
          <Form
            name={formPrefix + '-0'}
            form={form}
            layout="vertical"
            initialValues={{ kind: 'ordinary', version: 1 }}
            disabled={guard.locked || !permitted}
            onFinish={(value) =>
              void lookup.run(async () => {
                const target = {
                  device: device ?? value.device ?? '',
                  id: value.id,
                  version: value.version,
                }
                validateInput(() => validateReference(target))
                setManual(freeze({ target, rssLogin: value.kind === 'rss_login' }))
              })
            }
          >
            <div className="admin-form-grid">
              {!device && (
                <Form.Item
                  name="device"
                  label={l('精确设备 ID', 'Exact device ID')}
                  rules={[{ required: true }]}
                >
                  <Input autoComplete="off" />
                </Form.Item>
              )}
              <Form.Item
                name="id"
                label={l('材料 UUID', 'Material UUID')}
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="version"
                label={l('精确材料版本', 'Exact material version')}
                rules={[{ required: true }]}
              >
                <InputNumber min={1} precision={0} />
              </Form.Item>
              <Form.Item name="kind" label={l('正式披露类型', 'Formal disclosure type')}>
                <Select
                  options={[
                    { value: 'ordinary', label: l('普通恢复凭据', 'Ordinary recovery credential') },
                    {
                      value: 'rss_login',
                      label: l('RSS Login（用途验证）', 'RSS Login (purpose authorization)'),
                    },
                  ]}
                />
              </Form.Item>
            </div>
            <Button htmlType="submit" disabled={guard.locked || !permitted}>
              {l('选择精确披露坐标', 'Select exact disclosure coordinates')}
            </Button>
          </Form>
          <Failure error={lookup.error} locale={locale} kind="read" />
        </Card>
      </SecretPanel>
      {manual && (
        <MaterialDisclosure
          key={`${manual.target.device}/${manual.target.id}/${manual.target.version}/${manual.rssLogin}`}
          runtime={runtime}
          credentials={credentials}
          target={manual.target}
          rssLogin={manual.rssLogin}
          permitted={permitted && (!allowsDevice || allowsDevice(manual.target.device))}
          locale={locale}
        />
      )}
    </SelectionGuard.Provider>
  )
}
