import { Card } from 'antd'
import type {
  DmgPayload,
  MsixContainer,
  MsixIdentity,
  NativeInvocation,
  NativeRemoval,
  NativeSoftware,
  SoftwareBehavior,
  SoftwareDetection,
  SoftwareScript,
} from '@rss/mdm-resources'
import {
  BooleanField,
  Choice,
  DigestField,
  ItemList,
  NamedRecord,
  NumberField,
  NumberListField,
  StringListField,
  StringRecord,
  TextField,
} from './AuthorFields'
import { labels } from './AdminUi'
import type { Locale } from './i18n'

export const emptyInvocation = (): NativeInvocation => ({
  runAs: 'system',
  arguments: [],
  environment: {},
  timeoutSeconds: 300,
  outputBytes: 65536,
  exitCodes: { success: [0], reboot: [] },
})
export const emptySoftwareScript = (): SoftwareScript => ({
  interpreter: 'posix_sh',
  entry: '',
  invocation: emptyInvocation(),
})
const emptyDetection = (): SoftwareDetection => ({
  kind: 'msi_product',
  productCode: '',
  version: '',
})
const emptyIdentity = (): MsixIdentity => ({
  name: '',
  publisher: '',
  version: [1, 0, 0, 0],
  architecture: 'neutral',
  resourceId: '',
})
export function emptySoftwareBehavior(kind: SoftwareBehavior['kind']): SoftwareBehavior {
  const native: NativeSoftware = {
    installer: '',
    scope: 'system',
    install: emptyInvocation(),
    upgradeInvocation: emptyInvocation(),
    upgrade: 'in_place',
    uninstall: null,
    detect: emptyDetection(),
  }
  if (kind === 'bundle')
    return {
      kind,
      archive: '',
      manifest: { schema: 1, platform: 'windows', architecture: 'x86_64', entries: {} },
      install: emptySoftwareScript(),
      uninstall: null,
      detect: emptyDetection(),
    }
  if (kind === 'dmg')
    return {
      kind,
      image: '',
      volume: '',
      scope: 'system',
      invocation: emptyInvocation(),
      upgrade: 'in_place',
      payload: {
        kind: 'app_copy',
        application: { path: '', bundleId: '', version: '', targetName: '' },
        uninstall: true,
      },
    }
  if (kind === 'msix')
    return {
      kind,
      container: { kind: 'package', installer: '' },
      identity: emptyIdentity(),
      dependencies: [],
      deployment: { kind: 'device_provisioning' },
      minimumOs: [10, 0, 0, 0],
      requireSideload: true,
      allowUnsigned: false,
      uninstall: true,
      invocation: emptyInvocation(),
      upgrade: 'in_place',
    }
  return kind === 'exe' ? { ...native, kind, layout: {} } : { ...native, kind }
}
export function InvocationEditor({
  value,
  onChange,
  locale,
  label,
}: {
  value: NativeInvocation
  onChange: (value: NativeInvocation) => void
  locale: Locale
  label: string
}) {
  const l = labels(locale)
  return (
    <Card size="small" title={label}>
      <Choice
        label={`${label} ${l('执行身份', 'execution identity')}`}
        value={value.runAs}
        options={['system', 'logged_in_user']}
        onChange={(runAs) => onChange({ ...value, runAs })}
      />
      <StringListField
        locale={locale}
        label={`${label} ${l('参数', 'arguments')}`}
        value={value.arguments}
        onChange={(next) => onChange({ ...value, arguments: next })}
      />
      <StringRecord
        label={`${label} ${l('环境变量', 'environment')}`}
        value={value.environment}
        onChange={(environment) => onChange({ ...value, environment })}
        locale={locale}
      />
      <div className="admin-form-grid">
        <NumberField
          label={`${label} ${l('超时（秒）', 'timeout (seconds)')}`}
          minimum={1}
          value={value.timeoutSeconds}
          onChange={(timeoutSeconds) => onChange({ ...value, timeoutSeconds })}
        />
        <NumberField
          label={`${label} ${l('输出字节', 'output bytes')}`}
          minimum={1}
          value={value.outputBytes}
          onChange={(outputBytes) => onChange({ ...value, outputBytes })}
        />
      </div>
      <NumberListField
        label={`${label} ${l('成功退出码', 'success exit codes')}`}
        value={value.exitCodes.success}
        onChange={(success) => onChange({ ...value, exitCodes: { ...value.exitCodes, success } })}
        locale={locale}
      />
      <NumberListField
        label={`${label} ${l('重启退出码', 'reboot exit codes')}`}
        value={value.exitCodes.reboot}
        onChange={(reboot) => onChange({ ...value, exitCodes: { ...value.exitCodes, reboot } })}
        locale={locale}
      />
    </Card>
  )
}
function SoftwareScriptEditor({
  value,
  onChange,
  locale,
  label,
}: {
  value: SoftwareScript
  onChange: (value: SoftwareScript) => void
  locale: Locale
  label: string
}) {
  const l = labels(locale)
  return (
    <Card size="small" title={label}>
      <Choice
        label={`${label} ${l('解释器', 'interpreter')}`}
        value={value.interpreter}
        options={['power_shell7', 'posix_sh', 'bash']}
        onChange={(interpreter) => onChange({ ...value, interpreter })}
      />
      <TextField
        label={`${label} ${l('入口材料', 'entry material')}`}
        value={value.entry}
        onChange={(entry) => onChange({ ...value, entry })}
      />
      <InvocationEditor
        value={value.invocation}
        onChange={(invocation) => onChange({ ...value, invocation })}
        locale={locale}
        label={label}
      />
    </Card>
  )
}
function RemovalEditor({
  value,
  onChange,
  locale,
}: {
  value: NativeRemoval
  onChange: (value: NativeRemoval) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <>
      <TextField
        label={l('卸载器材料键', 'Uninstaller material key')}
        value={value.installer}
        onChange={(installer) => onChange({ ...value, installer })}
      />
      <InvocationEditor
        value={value.invocation}
        onChange={(invocation) => onChange({ ...value, invocation })}
        locale={locale}
        label={l('卸载调用', 'Uninstall invocation')}
      />
    </>
  )
}
function DetectionEditor({
  value,
  onChange,
  locale,
}: {
  value: SoftwareDetection
  onChange: (value: SoftwareDetection) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <Card size="small" title={l('软件检测', 'Software detection')}>
      <Choice
        label={l('检测方式', 'Detection kind')}
        value={value.kind}
        options={['msi_product', 'pkg_receipt', 'registry', 'file', 'script']}
        onChange={(kind) =>
          onChange(
            kind === 'msi_product'
              ? { kind, productCode: '', version: '' }
              : kind === 'pkg_receipt'
                ? { kind, receipt: '', version: '' }
                : kind === 'registry'
                  ? { kind, scope: 'system', key: '', value: '', version: '' }
                  : kind === 'file'
                    ? { kind, scope: 'system', path: '', version: '', sha256: [] }
                    : { kind, command: emptySoftwareScript() },
          )
        }
      />
      {value.kind !== 'script' && (
        <TextField
          label={l('检测软件版本', 'Detected software version')}
          value={value.version}
          onChange={(version) => onChange({ ...value, version })}
        />
      )}
      {value.kind === 'msi_product' && (
        <TextField
          label={l('MSI 产品代码', 'MSI product code')}
          value={value.productCode}
          onChange={(productCode) => onChange({ ...value, productCode })}
        />
      )}
      {value.kind === 'pkg_receipt' && (
        <TextField
          label={l('PKG 收据', 'PKG receipt')}
          value={value.receipt}
          onChange={(receipt) => onChange({ ...value, receipt })}
        />
      )}
      {(value.kind === 'registry' || value.kind === 'file') && (
        <Choice
          label={l('检测作用域', 'Detection scope')}
          value={value.scope}
          options={['system', 'user']}
          onChange={(scope) => onChange({ ...value, scope })}
        />
      )}
      {value.kind === 'registry' && (
        <>
          <TextField
            label={l('检测注册表键', 'Detection registry key')}
            value={value.key}
            onChange={(key) => onChange({ ...value, key })}
          />
          <TextField
            label={l('检测注册表值', 'Detection registry value')}
            value={value.value}
            onChange={(next) => onChange({ ...value, value: next })}
          />
        </>
      )}
      {value.kind === 'file' && (
        <>
          <TextField
            label={l('检测文件路径', 'Detection file path')}
            value={value.path}
            onChange={(path) => onChange({ ...value, path })}
          />
          <DigestField
            label={l('检测文件 SHA-256', 'Detection file SHA-256')}
            value={value.sha256}
            onChange={(sha256) => onChange({ ...value, sha256 })}
          />
        </>
      )}
      {value.kind === 'script' && (
        <SoftwareScriptEditor
          value={value.command}
          onChange={(command) => onChange({ ...value, command })}
          locale={locale}
          label={l('检测脚本', 'Detection script')}
        />
      )}
    </Card>
  )
}
function FourPartVersion({
  label,
  value,
  onChange,
}: {
  label: string
  value: readonly [number, number, number, number]
  onChange: (value: readonly [number, number, number, number]) => void
}) {
  return (
    <div className="admin-form-grid">
      {value.map((part, index) => (
        <NumberField
          key={index}
          label={`${label} ${index + 1}`}
          value={part}
          onChange={(next) => {
            const parts: [number, number, number, number] = [...value]
            parts[index] = next
            onChange(parts)
          }}
        />
      ))}
    </div>
  )
}
function IdentityEditor({
  value,
  onChange,
  locale,
}: {
  value: MsixIdentity
  onChange: (value: MsixIdentity) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <>
      <div className="admin-form-grid">
        <TextField
          label={l('MSIX 名称', 'MSIX name')}
          value={value.name}
          onChange={(name) => onChange({ ...value, name })}
        />
        <TextField
          label={l('MSIX 发布者', 'MSIX publisher')}
          value={value.publisher}
          onChange={(publisher) => onChange({ ...value, publisher })}
        />
        <Choice
          label={l('MSIX 架构', 'MSIX architecture')}
          value={value.architecture}
          options={['x86_64', 'aarch64', 'neutral']}
          onChange={(architecture) => onChange({ ...value, architecture })}
        />
        <TextField
          label={l('MSIX 资源标识', 'MSIX resource ID')}
          value={value.resourceId}
          onChange={(resourceId) => onChange({ ...value, resourceId })}
        />
      </div>
      <FourPartVersion
        label={l('MSIX 版本', 'MSIX version')}
        value={value.version}
        onChange={(version) => onChange({ ...value, version })}
      />
    </>
  )
}
function ContainerEditor({
  value,
  onChange,
  locale,
}: {
  value: MsixContainer
  onChange: (value: MsixContainer) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <>
      <Choice
        label={l('MSIX 容器', 'MSIX container')}
        value={value.kind}
        options={['package', 'bundle']}
        onChange={(kind) =>
          onChange(
            kind === 'package'
              ? { kind, installer: value.installer }
              : { kind, installer: value.installer, members: [] },
          )
        }
      />
      <TextField
        label={l('MSIX 安装器材料键', 'MSIX installer material key')}
        value={value.installer}
        onChange={(installer) => onChange({ ...value, installer })}
      />
      {value.kind === 'bundle' && (
        <ItemList
          label={l('MSIX Bundle 成员', 'MSIX bundle members')}
          value={value.members}
          onChange={(members) => onChange({ ...value, members })}
          create={() => ({ path: '', identity: emptyIdentity(), length: 1, sha256: [] })}
          locale={locale}
        >
          {(item, update) => (
            <>
              <TextField
                label={l('MSIX 成员路径', 'MSIX member path')}
                value={item.path}
                onChange={(path) => update({ ...item, path })}
              />
              <NumberField
                label={l('MSIX 成员字节', 'MSIX member bytes')}
                minimum={1}
                value={item.length}
                onChange={(length) => update({ ...item, length })}
              />
              <DigestField
                label={l('MSIX 成员 SHA-256', 'MSIX member SHA-256')}
                value={item.sha256}
                onChange={(sha256) => update({ ...item, sha256 })}
              />
              <IdentityEditor
                value={item.identity}
                onChange={(identity) => update({ ...item, identity })}
                locale={locale}
              />
            </>
          )}
        </ItemList>
      )}
    </>
  )
}
function DmgPayloadEditor({
  value,
  onChange,
  locale,
}: {
  value: DmgPayload
  onChange: (value: DmgPayload) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <>
      <Choice
        label={l('DMG 内容形式', 'DMG payload kind')}
        value={value.kind}
        options={['app_copy', 'contained_pkg']}
        onChange={(kind) =>
          onChange(
            kind === 'app_copy'
              ? {
                  kind,
                  application: { path: '', bundleId: '', version: '', targetName: '' },
                  uninstall: true,
                }
              : { kind, path: '', length: 1, sha256: [], receipt: '', uninstall: null },
          )
        }
      />
      {value.kind === 'app_copy' ? (
        <>
          <TextField
            label={l('DMG 应用路径', 'DMG application path')}
            value={value.application.path}
            onChange={(path) => onChange({ ...value, application: { ...value.application, path } })}
          />
          <TextField
            label={l('DMG Bundle 标识', 'DMG bundle identifier')}
            value={value.application.bundleId}
            onChange={(bundleId) =>
              onChange({ ...value, application: { ...value.application, bundleId } })
            }
          />
          <TextField
            label={l('DMG 应用版本', 'DMG application version')}
            value={value.application.version}
            onChange={(version) =>
              onChange({ ...value, application: { ...value.application, version } })
            }
          />
          <TextField
            label={l('DMG 目标名称', 'DMG target name')}
            value={value.application.targetName}
            onChange={(targetName) =>
              onChange({ ...value, application: { ...value.application, targetName } })
            }
          />
          <BooleanField
            label={l('支持移除 DMG 应用', 'Support DMG application removal')}
            value={value.uninstall}
            onChange={(uninstall) => onChange({ ...value, uninstall })}
          />
        </>
      ) : (
        <>
          <TextField
            label={l('DMG 内 PKG 路径', 'PKG path within DMG')}
            value={value.path}
            onChange={(path) => onChange({ ...value, path })}
          />
          <NumberField
            label={l('内置 PKG 字节', 'Contained PKG bytes')}
            minimum={1}
            value={value.length}
            onChange={(length) => onChange({ ...value, length })}
          />
          <DigestField
            label={l('内置 PKG SHA-256', 'Contained PKG SHA-256')}
            value={value.sha256}
            onChange={(sha256) => onChange({ ...value, sha256 })}
          />
          <TextField
            label={l('内置 PKG 收据', 'Contained PKG receipt')}
            value={value.receipt}
            onChange={(receipt) => onChange({ ...value, receipt })}
          />
          <BooleanField
            label={l('内置 PKG 卸载调用', 'Contained PKG uninstall invocation')}
            value={value.uninstall !== null}
            onChange={(enabled) =>
              onChange({
                ...value,
                uninstall: enabled ? { installer: '', invocation: emptyInvocation() } : null,
              })
            }
          />
          {value.uninstall && (
            <RemovalEditor
              value={value.uninstall}
              onChange={(uninstall) => onChange({ ...value, uninstall })}
              locale={locale}
            />
          )}
        </>
      )}
    </>
  )
}
export function SoftwareBehaviorAuthor({
  value,
  onChange,
  locale,
}: {
  value: SoftwareBehavior
  onChange: (value: SoftwareBehavior) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <Card size="small" title={l('安装行为', 'Installation behavior')}>
      <Choice
        label={l('安装行为类型', 'Installation behavior kind')}
        value={value.kind}
        options={['msi', 'pkg', 'winget', 'brew', 'exe', 'bundle', 'dmg', 'msix']}
        onChange={(kind) => onChange(emptySoftwareBehavior(kind))}
      />
      {(value.kind === 'msi' ||
        value.kind === 'pkg' ||
        value.kind === 'winget' ||
        value.kind === 'brew' ||
        value.kind === 'exe') && (
        <>
          <TextField
            label={l('安装器材料键', 'Installer material key')}
            value={value.installer}
            onChange={(installer) => onChange({ ...value, installer })}
          />
          <Choice
            label={l('软件作用域', 'Software scope')}
            value={value.scope}
            options={['system', 'user']}
            onChange={(scope) => onChange({ ...value, scope })}
          />
          <InvocationEditor
            value={value.install}
            onChange={(install) => onChange({ ...value, install })}
            locale={locale}
            label={l('安装调用', 'Install invocation')}
          />
          <InvocationEditor
            value={value.upgradeInvocation}
            onChange={(upgradeInvocation) => onChange({ ...value, upgradeInvocation })}
            locale={locale}
            label={l('升级调用', 'Upgrade invocation')}
          />
          <Choice
            label={l('升级方式', 'Upgrade behavior')}
            value={value.upgrade}
            options={['in_place', 'uninstall_then_install', 'deny']}
            onChange={(upgrade) => onChange({ ...value, upgrade })}
          />
          <BooleanField
            label={l('提供卸载调用', 'Provide uninstall invocation')}
            value={value.uninstall !== null}
            onChange={(enabled) =>
              onChange({
                ...value,
                uninstall: enabled ? { installer: '', invocation: emptyInvocation() } : null,
              })
            }
          />
          {value.uninstall && (
            <RemovalEditor
              value={value.uninstall}
              onChange={(uninstall) => onChange({ ...value, uninstall })}
              locale={locale}
            />
          )}
          <DetectionEditor
            value={value.detect}
            onChange={(detect) => onChange({ ...value, detect })}
            locale={locale}
          />
          {value.kind === 'exe' && (
            <StringRecord
              label={l('EXE 文件布局', 'EXE file layout')}
              value={value.layout}
              onChange={(layout) => onChange({ ...value, layout })}
              locale={locale}
            />
          )}
        </>
      )}
      {value.kind === 'bundle' && (
        <>
          <TextField
            label={l('Bundle 归档材料键', 'Bundle archive material key')}
            value={value.archive}
            onChange={(archive) => onChange({ ...value, archive })}
          />
          <Choice
            label={l('Bundle 平台', 'Bundle platform')}
            value={value.manifest.platform}
            options={['windows', 'macos']}
            onChange={(platform) =>
              onChange({ ...value, manifest: { ...value.manifest, platform } })
            }
          />
          <Choice
            label={l('Bundle 架构', 'Bundle architecture')}
            value={value.manifest.architecture}
            options={['x86_64', 'aarch64']}
            onChange={(architecture) =>
              onChange({ ...value, manifest: { ...value.manifest, architecture } })
            }
          />
          <NamedRecord
            label={l('Bundle 文件清单', 'Bundle file manifest')}
            value={value.manifest.entries}
            onChange={(entries) => onChange({ ...value, manifest: { ...value.manifest, entries } })}
            create={() => ({ length: 1, sha256: [] as readonly number[] })}
            locale={locale}
          >
            {(entry, update, key) => (
              <>
                <NumberField
                  label={`${key} ${l('字节', 'bytes')}`}
                  value={entry.length}
                  minimum={1}
                  onChange={(length) => update({ ...entry, length })}
                />
                <DigestField
                  label={`${key} SHA-256`}
                  value={entry.sha256}
                  onChange={(sha256) => update({ ...entry, sha256 })}
                />
              </>
            )}
          </NamedRecord>
          <SoftwareScriptEditor
            value={value.install}
            onChange={(install) => onChange({ ...value, install })}
            locale={locale}
            label={l('Bundle 安装脚本', 'Bundle install script')}
          />
          <BooleanField
            label={l('提供 Bundle 卸载脚本', 'Provide bundle uninstall script')}
            value={value.uninstall !== null}
            onChange={(enabled) =>
              onChange({ ...value, uninstall: enabled ? emptySoftwareScript() : null })
            }
          />
          {value.uninstall && (
            <SoftwareScriptEditor
              value={value.uninstall}
              onChange={(uninstall) => onChange({ ...value, uninstall })}
              locale={locale}
              label={l('Bundle 卸载脚本', 'Bundle uninstall script')}
            />
          )}
          <DetectionEditor
            value={value.detect}
            onChange={(detect) => onChange({ ...value, detect })}
            locale={locale}
          />
        </>
      )}
      {value.kind === 'dmg' && (
        <>
          <TextField
            label={l('DMG 镜像材料键', 'DMG image material key')}
            value={value.image}
            onChange={(image) => onChange({ ...value, image })}
          />
          <TextField
            label={l('DMG 卷名称', 'DMG volume name')}
            value={value.volume}
            onChange={(volume) => onChange({ ...value, volume })}
          />
          <Choice
            label={l('DMG 作用域', 'DMG scope')}
            value={value.scope}
            options={['system', 'user']}
            onChange={(scope) => onChange({ ...value, scope })}
          />
          <InvocationEditor
            value={value.invocation}
            onChange={(invocation) => onChange({ ...value, invocation })}
            locale={locale}
            label={l('DMG 调用', 'DMG invocation')}
          />
          <Choice
            label={l('DMG 升级方式', 'DMG upgrade behavior')}
            value={value.upgrade}
            options={['in_place', 'uninstall_then_install', 'deny']}
            onChange={(upgrade) => onChange({ ...value, upgrade })}
          />
          <DmgPayloadEditor
            value={value.payload}
            onChange={(payload) => onChange({ ...value, payload })}
            locale={locale}
          />
        </>
      )}
      {value.kind === 'msix' && (
        <>
          <ContainerEditor
            value={value.container}
            onChange={(container) => onChange({ ...value, container })}
            locale={locale}
          />
          <IdentityEditor
            value={value.identity}
            onChange={(identity) => onChange({ ...value, identity })}
            locale={locale}
          />
          <ItemList
            label={l('MSIX 依赖身份', 'MSIX dependency identities')}
            value={value.dependencies}
            onChange={(dependencies) => onChange({ ...value, dependencies })}
            create={emptyIdentity}
            locale={locale}
          >
            {(item, update) => <IdentityEditor value={item} onChange={update} locale={locale} />}
          </ItemList>
          <Choice
            label={l('MSIX 部署方式', 'MSIX deployment kind')}
            value={value.deployment.kind}
            options={['target_user_registration', 'device_provisioning']}
            onChange={(kind) =>
              onChange({
                ...value,
                deployment:
                  kind === 'device_provisioning'
                    ? { kind }
                    : { kind, target: { kind: 'active_interactive' } },
              })
            }
          />
          {value.deployment.kind === 'target_user_registration' && (
            <>
              <Choice
                label={l('MSIX 目标用户', 'MSIX target user')}
                value={value.deployment.target.kind}
                options={['active_interactive', 'exact']}
                onChange={(kind) =>
                  onChange({
                    ...value,
                    deployment: {
                      kind: 'target_user_registration',
                      target: kind === 'exact' ? { kind, identity: '' } : { kind },
                    },
                  })
                }
              />
              {value.deployment.target.kind === 'exact' && (
                <TextField
                  label={l('MSIX 用户身份', 'MSIX user identity')}
                  value={value.deployment.target.identity}
                  onChange={(identity) =>
                    onChange({
                      ...value,
                      deployment: {
                        kind: 'target_user_registration',
                        target: { kind: 'exact', identity },
                      },
                    })
                  }
                />
              )}
            </>
          )}
          <FourPartVersion
            label={l('最低 Windows 版本', 'Minimum Windows version')}
            value={value.minimumOs}
            onChange={(minimumOs) => onChange({ ...value, minimumOs })}
          />
          <BooleanField
            label={l('要求侧载能力', 'Require sideload capability')}
            value={value.requireSideload}
            onChange={(requireSideload) => onChange({ ...value, requireSideload })}
          />
          <BooleanField
            label={l('允许未签名 MSIX', 'Allow unsigned MSIX')}
            value={value.allowUnsigned}
            onChange={(allowUnsigned) => onChange({ ...value, allowUnsigned })}
          />
          <BooleanField
            label={l('支持移除 MSIX', 'Support MSIX removal')}
            value={value.uninstall}
            onChange={(uninstall) => onChange({ ...value, uninstall })}
          />
          <InvocationEditor
            value={value.invocation}
            onChange={(invocation) => onChange({ ...value, invocation })}
            locale={locale}
            label={l('MSIX 调用', 'MSIX invocation')}
          />
          <Choice
            label={l('MSIX 升级方式', 'MSIX upgrade behavior')}
            value={value.upgrade}
            options={['in_place', 'uninstall_then_install', 'deny']}
            onChange={(upgrade) => onChange({ ...value, upgrade })}
          />
        </>
      )}
    </Card>
  )
}
