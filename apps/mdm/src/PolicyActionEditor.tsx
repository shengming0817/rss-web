import { Alert, Form, InputNumber, Select } from 'antd'
import {
  defaultSchedule,
  type CredentialIntent,
  type ExactResource,
  type PolicyAction,
} from '@rss/mdm-policies'
import type { ResourceKind } from '@rss/mdm-resources'
import type { Locale } from './i18n'
import type { ResourcesUseCases } from './ResourceCommand'
import type { ScopesUseCases } from './ScopeResults'
import { labels } from './AdminUi'
import {
  BooleanField,
  Choice,
  NamedRecord,
  NumberField,
  StringListField,
  StringRecord,
  TextField,
} from './AuthorFields'
import { PolicySchedule } from './PolicySchedule'
import { PolicyResourcePicker } from './PolicyResourcePicker'
import { PolicyRolloutEditor } from './PolicyRolloutEditor'

export const policyKinds = [
  'execution',
  'configuration',
  'software',
  'native_collection',
  'agent_collection',
  'telemetry_profile',
  'device_access',
  'credential',
  'ensure_agent_installed',
  'request_mdm_enrollment',
  'unmanage_device',
] as const
export function policyActionLabel(kind: PolicyAction['kind'], locale: Locale): string {
  const l = labels(locale)
  return {
    execution: l('运行脚本', 'Run script'),
    configuration: l('持续配置', 'Persistent configuration'),
    software: l('软件部署', 'Software deployment'),
    native_collection: l('MDM 采集', 'MDM collection'),
    agent_collection: l('Agent 采集', 'Agent collection'),
    telemetry_profile: l('遥测采样', 'Telemetry sampling'),
    device_access: l('设备接入', 'Device Access'),
    credential: l('原生凭据维护', 'Native credential maintenance'),
    ensure_agent_installed: l('安装 Agent', 'Install Agent'),
    request_mdm_enrollment: l('请求 MDM 注册', 'Request MDM enrollment'),
    unmanage_device: l('设备退管', 'Retire device'),
  }[kind]
}
const emptyResource: ExactResource = {
  id: '',
  version: '',
  platform: 'windows',
  architecture: 'x86_64',
  variant: '',
}
export function newPolicyAction(kind: PolicyAction['kind'], scope: string): PolicyAction {
  const scheduled = { schedule: defaultSchedule(), runLifetimeSeconds: 86400 }
  if (kind === 'configuration') return { kind, resource: emptyResource, exit: 'retain' }
  if (kind === 'telemetry_profile') return { kind, resource: emptyResource }
  if (kind === 'execution')
    return {
      kind,
      resource: emptyResource,
      parameters: {},
      frequency: 'once_per_version',
      ...scheduled,
    }
  if (kind === 'native_collection' || kind === 'agent_collection')
    return {
      kind,
      resource: emptyResource,
      frequency: 'every_trigger',
      ...scheduled,
      schedule: { ...scheduled.schedule, trigger: { kind: 'interval', anchor: 0, seconds: 3600 } },
    }
  if (kind === 'software')
    return {
      kind,
      channel: 'agent',
      delivery: { kind: 'direct' },
      resource: { kind: 'software', id: '', version: '', variants: {} },
      intent: 'required_install',
      rollout: { stages: [{ scope, opensAt: 0, minimumVerifiedPercent: null }] },
      ...scheduled,
      schedule: { ...scheduled.schedule, trigger: { kind: 'check_in', minimumSeconds: 60 } },
    }
  if (kind === 'device_access')
    return { kind, mac: null, windows: { kind: 'disabled' }, selfEnrollment: false, role: null }
  if (kind === 'credential')
    return {
      kind,
      operation: { kind: 'collect_bitlocker' },
      architecture: 'x86_64',
      frequency: 'once_per_version',
      ...scheduled,
    }
  if (kind === 'ensure_agent_installed') return { kind, packages: {}, ...scheduled }
  if (kind === 'request_mdm_enrollment') return { kind, organization: '', ...scheduled }
  return { kind, ...scheduled }
}
export function PolicyActionEditor({
  value,
  scope,
  resources,
  scopes,
  onChange,
  locale,
}: {
  value: PolicyAction
  scope: string
  resources: ResourcesUseCases
  scopes: ScopesUseCases
  onChange: (value: PolicyAction) => void
  locale: Locale
}) {
  const l = labels(locale),
    resourceKind: ResourceKind | null =
      'resource' in value ? (value.kind === 'execution' ? 'script' : value.kind) : null
  return (
    <>
      <Form.Item label={l('策略动作', 'Policy action')}>
        <Select
          aria-label={l('策略动作', 'Policy action')}
          showSearch
          optionFilterProp="label"
          value={value.kind}
          options={policyKinds.map((kind) => ({
            value: kind,
            label: policyActionLabel(kind, locale),
          }))}
          onChange={(kind: PolicyAction['kind']) => onChange(newPolicyAction(kind, scope))}
        />
      </Form.Item>
      {resourceKind && 'resource' in value && (
        <>
          <p>
            {l('当前固定资源', 'Current fixed resource')} ·{' '}
            <code>
              {value.resource.id || '—'} @ {value.resource.version || '—'}
            </code>{' '}
            ·{' '}
            {'variant' in value.resource
              ? value.resource.variant
              : Object.entries(value.resource.variants)
                  .map(([target, variant]) => `${target}: ${variant}`)
                  .join(' · ')}
          </p>
          <PolicyResourcePicker
            key={resourceKind}
            resources={resources}
            kind={resourceKind}
            locale={locale}
            onSelect={(resource, version, variant) => {
              const exact: ExactResource = {
                id: resource.id,
                version: version.id,
                platform: variant.platform,
                architecture: variant.architecture,
                variant: variant.key,
              }
              if (value.kind === 'software') {
                const variants =
                  value.resource.id === resource.id && value.resource.version === version.id
                    ? { ...value.resource.variants }
                    : {}
                onChange({
                  ...value,
                  resource: {
                    kind: 'software',
                    id: resource.id,
                    version: version.id,
                    variants: {
                      ...variants,
                      [`${variant.platform}_${variant.architecture}`]: variant.key,
                    },
                  },
                })
              } else onChange({ ...value, resource: exact })
            }}
          />
        </>
      )}
      {'schedule' in value && (
        <>
          <PolicySchedule
            value={value.schedule}
            intervalOnly={value.kind === 'agent_collection' || value.kind === 'native_collection'}
            locale={locale}
            onChange={(schedule) => onChange({ ...value, schedule })}
          />
          <NumberField
            label={l('任务有效期（秒）', 'Run lifetime (seconds)')}
            value={value.runLifetimeSeconds}
            minimum={60}
            onChange={(runLifetimeSeconds) => onChange({ ...value, runLifetimeSeconds })}
          />
        </>
      )}
      {'frequency' in value && (
        <Form.Item label={l('重复执行规则', 'Execution history rule')}>
          <Select
            aria-label={l('重复执行规则', 'Execution history rule')}
            value={value.frequency}
            options={[
              {
                value: 'once_per_version',
                label: l('每个执行版本一次', 'Once per execution version'),
              },
              { value: 'once_per_entry', label: l('每次进入范围一次', 'Once per scope entry') },
              { value: 'every_trigger', label: l('每次有效触发', 'Every due trigger') },
            ]}
            onChange={(frequency: 'once_per_version' | 'once_per_entry' | 'every_trigger') =>
              onChange({ ...value, frequency })
            }
          />
        </Form.Item>
      )}
      {value.kind === 'execution' && (
        <NamedRecord
          label={l('脚本参数来源', 'Script parameter sources')}
          value={value.parameters}
          onChange={(parameters) => onChange({ ...value, parameters })}
          create={() => ({ kind: 'fixed' as const, value: '' })}
          locale={locale}
        >
          {(source, update, key) => (
            <>
              <Choice
                label={`${key} ${l('来源', 'source')}`}
                value={source.kind}
                options={['fixed', 'input']}
                onChange={(kind) => update(kind === 'input' ? { kind } : { kind, value: '' })}
              />
              {source.kind === 'fixed' && (
                <>
                  <Choice
                    label={`${key} ${l('值类型', 'value type')}`}
                    value={typeof source.value}
                    options={['string', 'boolean', 'number']}
                    onChange={(kind) =>
                      update({
                        kind: 'fixed',
                        value: kind === 'boolean' ? false : kind === 'number' ? 0 : '',
                      })
                    }
                  />
                  {typeof source.value === 'string' ? (
                    <TextField
                      label={key}
                      value={source.value}
                      onChange={(value) => update({ kind: 'fixed', value })}
                    />
                  ) : typeof source.value === 'boolean' ? (
                    <BooleanField
                      label={key}
                      value={source.value}
                      onChange={(value) => update({ kind: 'fixed', value })}
                    />
                  ) : (
                    <InputNumber
                      aria-label={key}
                      precision={0}
                      value={source.value}
                      onChange={(value) => {
                        if (value !== null) update({ kind: 'fixed', value })
                      }}
                    />
                  )}
                </>
              )}
            </>
          )}
        </NamedRecord>
      )}
      {value.kind === 'configuration' && (
        <Choice
          label={l('退出范围后的配置', 'Configuration after leaving scope')}
          value={value.exit}
          options={['retain', 'remove']}
          onChange={(exit) => onChange({ ...value, exit })}
        />
      )}
      {value.kind === 'software' && (
        <>
          <Choice
            label={l('唯一分配通道', 'Assignment channel')}
            value={value.channel}
            options={['agent', 'mdm']}
            onChange={(channel) => onChange({ ...value, channel })}
          />
          <Form.Item label={l('安装意图', 'Installation intent')}>
            <Select
              aria-label={l('安装意图', 'Installation intent')}
              value={value.intent}
              options={[
                { value: 'required_install', label: l('必装', 'Required installation') },
                { value: 'available_install', label: l('可用 / 自助', 'Available / self-service') },
                { value: 'explicit_uninstall', label: l('明确卸载', 'Explicit uninstall') },
              ]}
              onChange={(intent: 'required_install' | 'available_install' | 'explicit_uninstall') =>
                onChange({ ...value, intent })
              }
            />
          </Form.Item>
          <Choice
            label={l('安装材料来源', 'Delivery authority')}
            value={value.delivery.kind}
            options={['direct', 'native']}
            onChange={(kind) =>
              onChange({ ...value, delivery: kind === 'direct' ? { kind } : { kind, target: '' } })
            }
          />
          {value.delivery.kind === 'native' && (
            <TextField
              label={l('已发布的输出源', 'Published output source')}
              value={value.delivery.target}
              onChange={(target) => onChange({ ...value, delivery: { kind: 'native', target } })}
            />
          )}
          <PolicyRolloutEditor
            value={value.rollout.stages}
            scope={scope}
            scopes={scopes}
            locale={locale}
            onChange={(stages) => onChange({ ...value, rollout: { stages } })}
          />
        </>
      )}
      {value.kind === 'ensure_agent_installed' && (
        <StringRecord
          label={l('平台目标与已发布 Agent 安装包', 'Platform target and published Agent package')}
          value={value.packages}
          onChange={(packages) => onChange({ ...value, packages })}
          locale={locale}
        />
      )}
      {value.kind === 'request_mdm_enrollment' && (
        <TextField
          label={l('目标组织', 'Target organization')}
          value={value.organization}
          onChange={(organization) => onChange({ ...value, organization })}
        />
      )}
      {value.kind === 'unmanage_device' && (
        <Alert
          type="warning"
          title={l(
            '退管会影响设备管理与凭据；命令受理不证明退管完成。',
            'Retirement affects management and credentials. Acceptance does not establish completed retirement.',
          )}
        />
      )}
      {value.kind === 'credential' && (
        <CredentialFields
          value={value.operation}
          onChange={(operation) => onChange({ ...value, operation })}
          locale={locale}
        />
      )}
      {value.kind === 'device_access' && (
        <>
          <BooleanField
            label={l(
              '允许当前交互账户首次绑定',
              'Allow first binding of the current interactive account',
            )}
            value={value.selfEnrollment}
            onChange={(selfEnrollment) => onChange({ ...value, selfEnrollment })}
          />
          <Form.Item label={l('本地账户角色', 'Local account role')}>
            <Select
              aria-label={l('本地账户角色', 'Local account role')}
              value={value.role ?? 'preserve'}
              options={[
                { value: 'preserve', label: l('保留现有角色', 'Preserve current role') },
                { value: 'standard', label: l('标准用户', 'Standard user') },
                { value: 'administrator', label: l('管理员', 'Administrator') },
              ]}
              onChange={(role: 'preserve' | 'standard' | 'administrator') =>
                onChange({ ...value, role: role === 'preserve' ? null : role })
              }
            />
          </Form.Item>
          <Choice
            label={l('Windows 接入方式', 'Windows access method')}
            value={value.windows.kind}
            options={['disabled', 'rss_factor', 'whfb']}
            onChange={(kind) =>
              onChange({
                ...value,
                windows: kind === 'rss_factor' ? { kind, accounts: [] } : { kind },
              })
            }
          />
          {value.windows.kind === 'rss_factor' && (
            <Select
              mode="multiple"
              aria-label={l('Windows 账户来源', 'Windows account authorities')}
              value={[...value.windows.accounts]}
              options={['local', 'active_directory', 'entra'].map((value) => ({
                value,
                label: value,
              }))}
              onChange={(accounts: ('local' | 'active_directory' | 'entra')[]) =>
                onChange({ ...value, windows: { kind: 'rss_factor', accounts } })
              }
            />
          )}
          <BooleanField
            label={l('配置 Mac 登录', 'Configure Mac login')}
            value={value.mac !== null}
            onChange={(enabled) =>
              onChange({
                ...value,
                mac: enabled
                  ? {
                      authentication: 'secure_enclave',
                      passwordProvider: null,
                      login: 'local',
                      unlock: 'local',
                      filevault: 'local',
                      offlineGraceSeconds: null,
                      registrationGraceSeconds: null,
                      maintenanceAccounts: [],
                    }
                  : null,
              })
            }
          />
          {value.mac && (
            <>
              <Choice
                label={l('Mac 认证方式', 'Mac authentication method')}
                value={value.mac.authentication}
                options={['secure_enclave', 'password']}
                onChange={(authentication) => {
                  if (value.mac)
                    onChange({
                      ...value,
                      mac: {
                        ...value.mac,
                        authentication,
                        passwordProvider:
                          authentication === 'password' ? value.mac.passwordProvider : null,
                      },
                    })
                }}
              />
              {value.mac.authentication === 'password' && (
                <TextField
                  label={l('密码 Provider', 'Password provider')}
                  value={value.mac.passwordProvider ?? ''}
                  onChange={(passwordProvider) => {
                    if (value.mac) onChange({ ...value, mac: { ...value.mac, passwordProvider } })
                  }}
                />
              )}
              {(['login', 'unlock', 'filevault'] as const).map((key) => (
                <Choice
                  key={key}
                  label={
                    {
                      login: l('登录窗口', 'Login window'),
                      unlock: l('屏幕解锁', 'Screen unlock'),
                      filevault: 'FileVault',
                    }[key]
                  }
                  value={value.mac![key]}
                  options={['local', 'attempt', 'require']}
                  onChange={(policy) => {
                    if (value.mac) onChange({ ...value, mac: { ...value.mac, [key]: policy } })
                  }}
                />
              ))}
              {(['offlineGraceSeconds', 'registrationGraceSeconds'] as const).map((key) => (
                <Form.Item
                  key={key}
                  label={
                    key === 'offlineGraceSeconds'
                      ? l('离线宽限（秒，留空不设置）', 'Offline grace (seconds, empty for none)')
                      : l('未注册账户宽限（秒）', 'Unregistered account grace (seconds)')
                  }
                >
                  <InputNumber
                    min={0}
                    precision={0}
                    value={value.mac![key]}
                    onChange={(n) => {
                      if (value.mac) onChange({ ...value, mac: { ...value.mac, [key]: n } })
                    }}
                  />
                </Form.Item>
              ))}
              <StringListField
                label={l('排除的维护账户', 'Excluded maintenance accounts')}
                value={value.mac.maintenanceAccounts}
                onChange={(maintenanceAccounts) => {
                  if (value.mac) onChange({ ...value, mac: { ...value.mac, maintenanceAccounts } })
                }}
                locale={locale}
              />
            </>
          )}
        </>
      )}
    </>
  )
}
function CredentialFields({
  value,
  onChange,
  locale,
}: {
  value: CredentialIntent
  onChange: (value: CredentialIntent) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <fieldset className="asset-editor-section">
      <legend>{l('原生凭据操作', 'Native credential operation')}</legend>
      <Choice
        label={l('操作', 'Operation')}
        value={value.kind}
        options={[
          'collect_bitlocker',
          'verify_bitlocker',
          'rotate_bitlocker',
          'rotate_rss_login',
          'verify_rss_login',
          'rotate_local_administrator',
          'verify_local_administrator',
        ]}
        onChange={(kind) =>
          onChange(
            kind === 'collect_bitlocker'
              ? { kind }
              : kind === 'verify_bitlocker' || kind === 'rotate_bitlocker'
                ? { kind, volume: '', protector: '' }
                : kind === 'rotate_rss_login' || kind === 'verify_rss_login'
                  ? { kind, binding: '', bindingGeneration: 1, sid: '' }
                  : { kind, sid: '' },
          )
        }
      />
      {'sid' in value && (
        <TextField
          label={l('当前账户 SID', 'Current account SID')}
          value={value.sid}
          onChange={(sid) => onChange({ ...value, sid })}
        />
      )}
      {'binding' in value && (
        <>
          <TextField
            label={l('Device Access 绑定', 'Device Access binding')}
            value={value.binding}
            onChange={(binding) => onChange({ ...value, binding })}
          />
          <NumberField
            label={l('绑定代次', 'Binding generation')}
            value={value.bindingGeneration}
            minimum={1}
            onChange={(bindingGeneration) => onChange({ ...value, bindingGeneration })}
          />
        </>
      )}
      {'volume' in value && (
        <>
          <TextField
            label={l('目标卷 DeviceID', 'Target volume DeviceID')}
            value={value.volume}
            onChange={(volume) => onChange({ ...value, volume })}
          />
          <TextField
            label={l('现有保护器', 'Existing protector')}
            value={value.protector}
            onChange={(protector) => onChange({ ...value, protector })}
          />
        </>
      )}
      <p className="subtitle">
        {l(
          '仅保存用途与精确目标，不收集或展示凭据秘密。',
          'Save only the purpose and exact target; no credential secrets are collected or displayed.',
        )}
      </p>
    </fieldset>
  )
}
