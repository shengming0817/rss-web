import type {
  AgentDefinition,
  AgentPlan,
  Applicability,
  CollectionBudget,
  CimType,
  NativeDefinition,
  PhysicalPredicate,
  PhysicalQuery,
  PhysicalRead,
  SystemRead,
  TemplateScope,
} from '@rss/mdm-resources'
import { Card, InputNumber, Form, Select } from 'antd'
import {
  BooleanField,
  Choice,
  ItemList,
  NamedRecord,
  NumberField,
  StringListField,
  StringRecord,
  TextField,
} from './AuthorFields'
import { labels } from './AdminUi'
import type { Locale } from './i18n'

export const emptyApplicability = (): Applicability => ({
  minimumOsVersion: null,
  minimumBuild: null,
  editions: [],
  enrollments: [],
  tools: {},
  capabilities: [],
})
export const emptyBudget = (): CollectionBudget => ({
  timeoutSeconds: 30,
  outputBytes: 65536,
  maxRows: 1000,
})
export function ScopeEditor({
  value,
  onChange,
  locale,
}: {
  value: TemplateScope
  onChange: (value: TemplateScope) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <Card size="small" title={l('采集命名空间', 'Collection namespace')}>
      <Choice
        label={l('命名空间类型', 'Namespace kind')}
        value={value.kind}
        options={['device', 'user', 'source', 'volume', 'prefix']}
        onChange={(kind) =>
          onChange(
            kind === 'device'
              ? { kind }
              : kind === 'prefix'
                ? { kind, path: '' }
                : { kind, identity: '' },
          )
        }
      />
      {value.kind === 'prefix' ? (
        <TextField
          label={l('命名空间前缀', 'Namespace prefix')}
          value={value.path}
          onChange={(path) => onChange({ ...value, path })}
        />
      ) : (
        value.kind !== 'device' && (
          <TextField
            label={l('命名空间身份', 'Namespace identity')}
            value={value.identity}
            onChange={(identity) => onChange({ ...value, identity })}
          />
        )
      )}
    </Card>
  )
}
export function ApplicabilityEditor({
  value,
  onChange,
  locale,
}: {
  value: Applicability
  onChange: (value: Applicability) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <Card size="small" title={l('适用条件', 'Applicability')}>
      <div className="admin-form-grid">
        <TextField
          label={l('最低系统版本', 'Minimum OS version')}
          value={value.minimumOsVersion ?? ''}
          onChange={(next) => onChange({ ...value, minimumOsVersion: next || null })}
        />
        <Form.Item label={l('最低系统构建号（可选）', 'Minimum build (optional)')}>
          <InputNumber
            aria-label={l('最低系统构建号（可选）', 'Minimum build (optional)')}
            min={0}
            precision={0}
            value={value.minimumBuild}
            onChange={(minimumBuild) => onChange({ ...value, minimumBuild })}
          />
        </Form.Item>
        <StringListField
          locale={locale}
          label={l('系统版本系列', 'OS editions')}
          value={value.editions}
          onChange={(editions) => onChange({ ...value, editions })}
        />
        <StringListField
          locale={locale}
          label={l('注册方式', 'Enrollment kinds')}
          value={value.enrollments}
          onChange={(enrollments) => onChange({ ...value, enrollments })}
        />
        <StringListField
          locale={locale}
          label={l('所需能力', 'Required capabilities')}
          value={value.capabilities}
          onChange={(capabilities) => onChange({ ...value, capabilities })}
        />
      </div>
      <StringRecord
        label={l('工具版本约束', 'Tool version requirements')}
        value={value.tools}
        onChange={(tools) => onChange({ ...value, tools })}
        locale={locale}
      />
    </Card>
  )
}
export function BudgetEditor({
  value,
  onChange,
  locale,
}: {
  value: CollectionBudget
  onChange: (value: CollectionBudget) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <div className="admin-form-grid">
      <NumberField
        label={l('超时（秒）', 'Timeout (seconds)')}
        minimum={1}
        value={value.timeoutSeconds}
        onChange={(timeoutSeconds) => onChange({ ...value, timeoutSeconds })}
      />
      <NumberField
        label={l('最大输出字节', 'Maximum output bytes')}
        minimum={1}
        value={value.outputBytes}
        onChange={(outputBytes) => onChange({ ...value, outputBytes })}
      />
      <NumberField
        label={l('最大行数', 'Maximum rows')}
        minimum={1}
        value={value.maxRows}
        onChange={(maxRows) => onChange({ ...value, maxRows })}
      />
    </div>
  )
}
const systemKinds = [
  'windows_bitlocker',
  'windows_firewall',
  'windows_defender',
  'windows_secure_boot',
  'windows_join',
  'windows_accounts',
  'macos_accounts',
  'windows_certificates',
  'macos_certificates',
  'windows_updates',
  'macos_updates',
  'macos_security',
  'windows_application',
  'macos_application',
] as const satisfies readonly SystemRead['kind'][]
function systemDefault(kind: SystemRead['kind']): SystemRead {
  switch (kind) {
    case 'windows_accounts':
    case 'macos_accounts':
      return { kind, section: 'accounts', selection: { kind: 'local' } }
    case 'windows_certificates':
      return { kind, store: 'my', user: false }
    case 'macos_certificates':
      return { kind, store: 'system' }
    case 'windows_updates':
    case 'macos_updates':
      return { kind, section: 'scan', mode: 'local' }
    case 'macos_security':
      return { kind, section: 'gatekeeper' }
    case 'windows_application':
      return { kind, target: { kind: 'agent' } }
    case 'macos_application':
      return { kind, target: { kind: 'agent' }, permissions: [] }
    default:
      return { kind }
  }
}
function SystemReadEditor({
  value,
  onChange,
  locale,
}: {
  value: SystemRead
  onChange: (value: SystemRead) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <>
      <Choice
        label={l('系统读取类型', 'System read kind')}
        value={value.kind}
        options={systemKinds}
        onChange={(kind) => onChange(systemDefault(kind))}
      />
      {(value.kind === 'windows_accounts' || value.kind === 'macos_accounts') && (
        <>
          <Choice
            label={l('账户读取部分', 'Account section')}
            value={value.section}
            options={['accounts', 'administrators', 'sessions']}
            onChange={(section) => onChange({ ...value, section })}
          />
          <Choice
            label={l('账户选择', 'Account selection')}
            value={value.selection.kind}
            options={['local', 'selected']}
            onChange={(kind) =>
              onChange({
                ...value,
                selection: kind === 'local' ? { kind } : { kind, identities: [] },
              })
            }
          />
          {value.selection.kind === 'selected' && (
            <StringListField
              locale={locale}
              label={l('账户身份', 'Account identities')}
              value={value.selection.identities}
              onChange={(identities) =>
                onChange({ ...value, selection: { kind: 'selected', identities } })
              }
            />
          )}
        </>
      )}
      {value.kind === 'windows_certificates' && (
        <>
          <Choice
            label={l('Windows 证书存储', 'Windows certificate store')}
            value={value.store}
            options={['my', 'root', 'ca', 'trusted_publisher']}
            onChange={(store) => onChange({ ...value, store })}
          />
          <BooleanField
            label={l('用户证书存储', 'User certificate store')}
            value={value.user}
            onChange={(user) => onChange({ ...value, user })}
          />
        </>
      )}
      {value.kind === 'macos_certificates' && (
        <Choice
          label={l('macOS 证书存储', 'macOS certificate store')}
          value={value.store}
          options={['system', 'system_roots', 'login']}
          onChange={(store) => onChange({ ...value, store })}
        />
      )}
      {(value.kind === 'windows_updates' || value.kind === 'macos_updates') && (
        <>
          <Choice
            label={l('更新读取部分', 'Update section')}
            value={value.section}
            options={['scan', 'available', 'installed', 'history', 'reboot']}
            onChange={(section) => onChange({ ...value, section })}
          />
          <Choice
            label={l('更新读取模式', 'Update read mode')}
            value={value.mode}
            options={['local', 'online']}
            onChange={(mode) => onChange({ ...value, mode })}
          />
        </>
      )}
      {value.kind === 'macos_security' && (
        <Choice
          label={l('macOS 安全部分', 'macOS security section')}
          value={value.section}
          options={[
            'gatekeeper',
            'xprotect',
            'system_extensions',
            'filevault',
            'firewall',
            'sip',
            'hardware_encryption',
            'secure_token',
            'bootstrap_token',
          ]}
          onChange={(section) => onChange({ ...value, section })}
        />
      )}
      {value.kind === 'windows_application' && (
        <>
          <Choice
            label={l('Windows 应用目标', 'Windows application target')}
            value={value.target.kind}
            options={['agent', 'signed']}
            onChange={(kind) =>
              onChange({
                ...value,
                target: kind === 'agent' ? { kind } : { kind, service: '', publisher: '' },
              })
            }
          />
          {value.target.kind === 'signed' && (
            <>
              <TextField
                label={l('服务名称', 'Service name')}
                value={value.target.service}
                onChange={(service) => {
                  if (value.target.kind === 'signed')
                    onChange({ ...value, target: { ...value.target, service } })
                }}
              />
              <TextField
                label={l('签名发布者', 'Signing publisher')}
                value={value.target.publisher}
                onChange={(publisher) => {
                  if (value.target.kind === 'signed')
                    onChange({ ...value, target: { ...value.target, publisher } })
                }}
              />
            </>
          )}
        </>
      )}
      {value.kind === 'macos_application' && (
        <>
          <Choice
            label={l('macOS 应用目标', 'macOS application target')}
            value={value.target.kind}
            options={['agent', 'signed']}
            onChange={(kind) =>
              onChange({
                ...value,
                target: kind === 'agent' ? { kind } : { kind, bundle_id: '', team_id: '' },
              })
            }
          />
          {value.target.kind === 'signed' && (
            <>
              <TextField
                label={l('Bundle 标识', 'Bundle identifier')}
                value={value.target.bundle_id}
                onChange={(bundle_id) => {
                  if (value.target.kind === 'signed')
                    onChange({ ...value, target: { ...value.target, bundle_id } })
                }}
              />
              <TextField
                label={l('Team 标识', 'Team identifier')}
                value={value.target.team_id}
                onChange={(team_id) => {
                  if (value.target.kind === 'signed')
                    onChange({ ...value, target: { ...value.target, team_id } })
                }}
              />
            </>
          )}
          <Form.Item label={l('隐私权限', 'Privacy permissions')}>
            <Select
              mode="multiple"
              aria-label={l('隐私权限', 'Privacy permissions')}
              value={[...value.permissions]}
              options={(['full_disk_access', 'accessibility', 'screen_capture'] as const).map(
                (value) => ({ value, label: value }),
              )}
              onChange={(permissions: (typeof value.permissions)[number][]) =>
                onChange({ ...value, permissions })
              }
            />
          </Form.Item>
        </>
      )}
    </>
  )
}
function PredicateEditor({
  value,
  onChange,
  locale,
}: {
  value: PhysicalPredicate
  onChange: (value: PhysicalPredicate) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <Card size="small" title={l('WMI 条件', 'WMI predicate')}>
      <Choice
        label={l('条件类型', 'Predicate kind')}
        value={value.kind}
        options={['compare', 'and', 'or']}
        onChange={(kind) =>
          onChange(
            kind === 'compare'
              ? { kind, property: '', operator: 'eq', value: '' }
              : { kind, terms: [] },
          )
        }
      />
      {value.kind === 'compare' ? (
        <>
          <TextField
            label={l('比较属性', 'Compared property')}
            value={value.property}
            onChange={(property) => onChange({ ...value, property })}
          />
          <Choice
            label={l('比较运算', 'Comparison operator')}
            value={value.operator}
            options={['eq', 'ne', 'lt', 'le', 'gt', 'ge']}
            onChange={(operator) => onChange({ ...value, operator })}
          />
          <Choice
            label={l('比较值类型', 'Comparison value type')}
            value={typeof value.value}
            options={['string', 'number', 'boolean']}
            onChange={(kind) =>
              onChange({ ...value, value: kind === 'number' ? 0 : kind === 'boolean' ? false : '' })
            }
          />
          {typeof value.value === 'string' ? (
            <TextField
              label={l('比较值', 'Comparison value')}
              value={value.value}
              onChange={(next) => onChange({ ...value, value: next })}
            />
          ) : typeof value.value === 'boolean' ? (
            <BooleanField
              label={l('比较值', 'Comparison value')}
              value={value.value}
              onChange={(next) => onChange({ ...value, value: next })}
            />
          ) : (
            <Form.Item label={l('比较值', 'Comparison value')}>
              <InputNumber
                aria-label={l('比较值', 'Comparison value')}
                value={value.value}
                onChange={(next) => {
                  if (next !== null) onChange({ ...value, value: next })
                }}
              />
            </Form.Item>
          )}
        </>
      ) : (
        <ItemList
          label={l('子条件', 'Predicate terms')}
          value={value.terms}
          onChange={(terms) => onChange({ ...value, terms })}
          create={() => ({
            kind: 'compare' as const,
            property: '',
            operator: 'eq' as const,
            value: '',
          })}
          locale={locale}
        >
          {(item, update) => <PredicateEditor value={item} onChange={update} locale={locale} />}
        </ItemList>
      )}
    </Card>
  )
}
const physicalKinds = [
  'windows_performance',
  'macos_performance',
  'system',
  'windows_wmi',
  'windows_registry',
  'windows_cpu',
  'windows_software',
  'windows_network',
  'windows_battery',
  'macos_pkg_receipts',
  'macos_hardware',
  'macos_applications',
  'macos_brew',
] as const satisfies readonly PhysicalRead['kind'][]
function physicalDefault(kind: PhysicalRead['kind']): PhysicalRead {
  switch (kind) {
    case 'windows_performance':
    case 'macos_performance':
      return { kind, section: 'cpu' }
    case 'system':
      return { kind, query: { kind: 'windows_bitlocker' } }
    case 'windows_wmi':
      return { kind, namespace: 'root/cimv2', class: '', properties: {}, filter: null }
    case 'windows_registry':
      return {
        kind,
        hive: { kind: 'local_machine' },
        view: 'registry64',
        path: '',
        enumerateSubkeys: false,
        values: {},
      }
    case 'macos_hardware':
      return { kind, section: 'identity' }
    case 'macos_applications':
      return { kind, root: 'local_applications', maxDepth: 4 }
    case 'macos_brew':
      return { kind, prefix: '/opt/homebrew', package: 'formula', taps: [] }
    default:
      return { kind }
  }
}
export function PhysicalReadEditor({
  value,
  onChange,
  locale,
}: {
  value: PhysicalRead
  onChange: (value: PhysicalRead) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <>
      <Choice
        label={l('物理读取类型', 'Physical read kind')}
        value={value.kind}
        options={physicalKinds}
        onChange={(kind) => onChange(physicalDefault(kind))}
      />
      {(value.kind === 'windows_performance' || value.kind === 'macos_performance') && (
        <Choice
          label={l('性能部分', 'Performance section')}
          value={value.section}
          options={['cpu', 'memory', 'file_systems', 'network']}
          onChange={(section) => onChange({ ...value, section })}
        />
      )}
      {value.kind === 'system' && (
        <SystemReadEditor
          value={value.query}
          onChange={(query) => onChange({ ...value, query })}
          locale={locale}
        />
      )}
      {value.kind === 'macos_hardware' && (
        <Choice
          label={l('硬件部分', 'Hardware section')}
          value={value.section}
          options={[
            'identity',
            'os',
            'cpu',
            'memory',
            'firmware',
            'disks',
            'apfs_containers',
            'volumes',
            'network',
            'battery',
          ]}
          onChange={(section) => onChange({ ...value, section })}
        />
      )}
      {value.kind === 'macos_applications' && (
        <>
          <Choice
            label={l('应用根目录', 'Application root')}
            value={value.root}
            options={['local_applications', 'system_applications', 'user_applications']}
            onChange={(root) => onChange({ ...value, root })}
          />
          <NumberField
            label={l('最大目录深度', 'Maximum directory depth')}
            value={value.maxDepth}
            onChange={(maxDepth) => onChange({ ...value, maxDepth })}
          />
        </>
      )}
      {value.kind === 'macos_brew' && (
        <>
          <TextField
            label={l('Brew 前缀', 'Brew prefix')}
            value={value.prefix}
            onChange={(prefix) => onChange({ ...value, prefix })}
          />
          <Choice
            label={l('Brew 包类型', 'Brew package kind')}
            value={value.package}
            options={['formula', 'cask']}
            onChange={(next) => onChange({ ...value, package: next })}
          />
          <StringListField
            locale={locale}
            label={l('Brew taps', 'Brew taps')}
            value={value.taps}
            onChange={(taps) => onChange({ ...value, taps })}
          />
        </>
      )}
      {value.kind === 'windows_wmi' && (
        <>
          <TextField
            label={l('WMI 命名空间', 'WMI namespace')}
            value={value.namespace}
            onChange={(namespace) => onChange({ ...value, namespace })}
          />
          <TextField
            label={l('WMI 类', 'WMI class')}
            value={value.class}
            onChange={(next) => onChange({ ...value, class: next })}
          />
          <NamedRecord
            label={l('WMI 属性', 'WMI properties')}
            value={value.properties}
            onChange={(properties) => onChange({ ...value, properties })}
            create={() => ({ cimType: 'string' as CimType, array: false })}
            locale={locale}
          >
            {(item, update, key) => (
              <>
                <Choice
                  label={`${key} CIM`}
                  value={item.cimType}
                  options={[
                    'string',
                    'boolean',
                    'sint8',
                    'sint16',
                    'sint32',
                    'sint64',
                    'uint8',
                    'uint16',
                    'uint32',
                    'uint64',
                    'real32',
                    'real64',
                    'datetime',
                  ]}
                  onChange={(cimType) => update({ ...item, cimType })}
                />
                <BooleanField
                  label={`${key} ${l('数组', 'array')}`}
                  value={item.array}
                  onChange={(array) => update({ ...item, array })}
                />
              </>
            )}
          </NamedRecord>
          <BooleanField
            label={l('启用 WMI 条件', 'Use WMI predicate')}
            value={value.filter !== null}
            onChange={(enabled) =>
              onChange({
                ...value,
                filter: enabled
                  ? { kind: 'compare', property: '', operator: 'eq', value: '' }
                  : null,
              })
            }
          />
          {value.filter && (
            <PredicateEditor
              value={value.filter}
              onChange={(filter) => onChange({ ...value, filter })}
              locale={locale}
            />
          )}
        </>
      )}
      {value.kind === 'windows_registry' && (
        <>
          <Choice
            label={l('注册表根', 'Registry hive')}
            value={value.hive.kind}
            options={['local_machine', 'users']}
            onChange={(kind) =>
              onChange({ ...value, hive: kind === 'users' ? { kind, sid: '' } : { kind } })
            }
          />
          {value.hive.kind === 'users' && (
            <TextField
              label="SID"
              value={value.hive.sid}
              onChange={(sid) => onChange({ ...value, hive: { kind: 'users', sid } })}
            />
          )}
          <Choice
            label={l('注册表视图', 'Registry view')}
            value={value.view}
            options={['registry32', 'registry64']}
            onChange={(view) => onChange({ ...value, view })}
          />
          <TextField
            label={l('注册表路径', 'Registry path')}
            value={value.path}
            onChange={(path) => onChange({ ...value, path })}
          />
          <BooleanField
            label={l('枚举子键', 'Enumerate subkeys')}
            value={value.enumerateSubkeys}
            onChange={(enumerateSubkeys) => onChange({ ...value, enumerateSubkeys })}
          />
          <NamedRecord
            label={l('注册表值', 'Registry values')}
            value={value.values}
            onChange={(values) => onChange({ ...value, values })}
            create={() => ({ name: '', valueType: 'sz' as const })}
            locale={locale}
          >
            {(item, update, key) => (
              <>
                <TextField
                  label={`${key} ${l('值名称', 'value name')}`}
                  value={item.name}
                  onChange={(name) => update({ ...item, name })}
                />
                <Choice
                  label={`${key} ${l('值类型', 'value type')}`}
                  value={item.valueType}
                  options={['sz', 'expand_sz', 'dword', 'qword', 'multi_sz']}
                  onChange={(valueType) => update({ ...item, valueType })}
                />
              </>
            )}
          </NamedRecord>
        </>
      )}
    </>
  )
}
export function AgentPlanEditor({
  value,
  onChange,
  locale,
}: {
  value: AgentPlan
  onChange: (value: AgentPlan) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <Card size="small" title={l('Agent 物理计划', 'Agent physical plan')}>
      <NumberField
        label={l('计划格式版本', 'Plan format version')}
        minimum={1}
        value={value.version}
        onChange={(version) => onChange({ ...value, version })}
      />
      <ScopeEditor
        value={value.scope}
        onChange={(scope) => onChange({ ...value, scope })}
        locale={locale}
      />
      <BudgetEditor
        value={value.budget}
        onChange={(budget) => onChange({ ...value, budget })}
        locale={locale}
      />
      <NamedRecord<PhysicalQuery>
        label={l('物理查询', 'Physical queries')}
        value={value.queries}
        onChange={(queries) => onChange({ ...value, queries })}
        create={() => ({
          version: 1,
          definition: { kind: 'windows_cpu' },
          cardinality: 'exactly_one',
          instanceKeys: [],
          budget: emptyBudget(),
        })}
        locale={locale}
      >
        {(query, update) => (
          <>
            <NumberField
              label={l('查询格式版本', 'Query format version')}
              minimum={1}
              value={query.version}
              onChange={(version) => update({ ...query, version })}
            />
            <PhysicalReadEditor
              value={query.definition}
              onChange={(definition) => update({ ...query, definition })}
              locale={locale}
            />
            <Choice
              label={l('查询基数', 'Query cardinality')}
              value={query.cardinality}
              options={['exactly_one', 'list']}
              onChange={(cardinality) => update({ ...query, cardinality })}
            />
            <StringListField
              locale={locale}
              label={l('实例键', 'Instance keys')}
              value={query.instanceKeys}
              onChange={(instanceKeys) => update({ ...query, instanceKeys })}
            />
            <BudgetEditor
              value={query.budget}
              onChange={(budget) => update({ ...query, budget })}
              locale={locale}
            />
          </>
        )}
      </NamedRecord>
    </Card>
  )
}
export function AgentAuthor({
  value,
  onChange,
  locale,
}: {
  value: AgentDefinition
  onChange: (value: AgentDefinition) => void
  locale: Locale
}) {
  return (
    <>
      <ApplicabilityEditor
        value={value.applicability}
        onChange={(applicability) => onChange({ ...value, applicability })}
        locale={locale}
      />
      <AgentPlanEditor
        value={value.plan}
        onChange={(plan) => onChange({ ...value, plan })}
        locale={locale}
      />
    </>
  )
}
export function NativeAuthor({
  value,
  onChange,
  locale,
}: {
  value: NativeDefinition
  onChange: (value: NativeDefinition) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <>
      <ScopeEditor
        value={value.scope}
        onChange={(scope) => onChange({ ...value, scope })}
        locale={locale}
      />
      <ApplicabilityEditor
        value={value.applicability}
        onChange={(applicability) => onChange({ ...value, applicability })}
        locale={locale}
      />
      <Choice
        label={l('原生读取适配器', 'Native read adapter')}
        value={value.adapter}
        options={[
          'windows_read',
          'apple_device_information',
          'apple_installed_applications',
          'apple_security',
          'apple_profiles',
          'apple_certificates',
          'apple_users',
        ]}
        onChange={(adapter) => onChange({ ...value, adapter })}
      />
      <NumberField
        label={l('原生读取超时（秒）', 'Native read timeout (seconds)')}
        minimum={1}
        value={value.timeoutSeconds}
        onChange={(timeoutSeconds) => onChange({ ...value, timeoutSeconds })}
      />
      <NumberField
        label={l('原生读取输出字节', 'Native read output bytes')}
        minimum={1}
        value={value.outputBytes}
        onChange={(outputBytes) => onChange({ ...value, outputBytes })}
      />
    </>
  )
}
