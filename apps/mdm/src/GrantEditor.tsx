import { Button, Input, Select, Space, ConfigProvider } from 'antd'
import {
  devicePermissions,
  permissions,
  platformPermissions,
  keyPermissions,
  type Grant,
  type Permission,
  type Realm,
} from '@rss/mdm-authorization'
import { labels } from './AdminUi'
import type { Locale } from './i18n'
export function GrantEditor({
  value = [],
  onChange,
  realm,
  apiKey = false,
  locale,
  disabled: requestedDisabled,
}: {
  value?: readonly Grant[]
  onChange?: (value: Grant[]) => void
  realm: Realm
  apiKey?: boolean
  locale: Locale
  disabled?: boolean
}) {
  const disabled = requestedDisabled ?? ConfigProvider.useConfig().componentDisabled ?? false
  const l = labels(locale)
  const options = apiKey
    ? keyPermissions
    : realm === 'management'
      ? platformPermissions
      : permissions.filter((p) => !p.startsWith('tenant_'))
  const change = (index: number, grant: Grant) =>
    onChange?.(value.map((g, i) => (i === index ? grant : g)))
  return (
    <div className="grant-editor">
      {value.map((grant, index) => {
        const device = (devicePermissions as readonly string[]).includes(grant.operation)
        return (
          <Space key={index} wrap className="grant-row">
            <Select
              showSearch
              aria-label={l('权限', 'Permission')}
              className="grant-permission"
              disabled={disabled}
              value={grant.operation}
              options={options.map((p) => ({ value: p, label: p }))}
              onChange={(operation: Permission) =>
                change(index, {
                  operation,
                  scope: {
                    kind: (devicePermissions as readonly string[]).includes(operation)
                      ? 'all_devices'
                      : 'tenant',
                  },
                })
              }
            />
            <Select
              aria-label={l('权限范围', 'Permission scope')}
              className="admin-select"
              disabled={disabled || !device}
              value={grant.scope.kind}
              options={
                device
                  ? [
                      { value: 'all_devices', label: l('所有设备', 'All devices') },
                      { value: 'device', label: l('指定设备', 'Specific device') },
                    ]
                  : [{ value: 'tenant', label: l('租户', 'Tenant') }]
              }
              onChange={(kind: Grant['scope']['kind']) =>
                change(index, { ...grant, scope: kind === 'device' ? { kind, id: '' } : { kind } })
              }
            />
            {grant.scope.kind === 'device' && (
              <Input
                aria-label={l('设备标识', 'Device ID')}
                value={grant.scope.id}
                disabled={disabled}
                onChange={(e) =>
                  change(index, { ...grant, scope: { kind: 'device', id: e.target.value } })
                }
                maxLength={1024}
              />
            )}
            <Button
              danger
              disabled={disabled}
              onClick={() => onChange?.(value.filter((_, i) => i !== index))}
            >
              {l('移除', 'Remove')}
            </Button>
          </Space>
        )
      })}
      <Button
        disabled={disabled || value.length >= 256}
        onClick={() => {
          const operation = options[0]!
          onChange?.([
            ...value,
            {
              operation,
              scope: {
                kind: (devicePermissions as readonly string[]).includes(operation)
                  ? 'all_devices'
                  : 'tenant',
              },
            },
          ])
        }}
      >
        {l('添加权限', 'Add permission')}
      </Button>
    </div>
  )
}
