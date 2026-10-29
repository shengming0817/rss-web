import { Card } from 'antd'
import type { BrewExport, SoftwareDefinition, SoftwareExport } from '@rss/mdm-resources'
import {
  BooleanField,
  Choice,
  DigestField,
  ItemList,
  NamedRecord,
  NumberField,
  StringListField,
  TextField,
} from './AuthorFields'
import {
  SoftwareArtifactAuthor,
  SourceSnapshotAuthor,
  type MaterialHashFile,
  emptySoftwareArtifact,
} from './ArtifactAuthor'
import { SoftwareBehaviorAuthor, emptySoftwareBehavior } from './SoftwareBehaviorAuthor'
import { SoftwareSignatures } from './SoftwareSignatures'
import { labels } from './AdminUi'
import type { Locale } from './i18n'

function BrewExportAuthor({
  value,
  onChange,
  locale,
}: {
  value: BrewExport
  onChange: (value: BrewExport) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <>
      <Choice
        label={l('Brew 导出形式', 'Brew export kind')}
        value={value.kind}
        options={['cask', 'bottle']}
        onChange={(kind) =>
          onChange(
            kind === 'cask'
              ? { kind, path: '', receipts: [] }
              : {
                  kind,
                  artifact: '',
                  source: '',
                  tag: '',
                  cellar: '',
                  revision: 0,
                  rebuild: 0,
                  executable: '',
                },
          )
        }
      />
      {value.kind === 'cask' ? (
        <>
          <TextField
            label={l('Cask 应用路径', 'Cask application path')}
            value={value.path}
            onChange={(path) => onChange({ ...value, path })}
          />
          <StringListField
            locale={locale}
            label={l('Cask 收据', 'Cask receipts')}
            value={value.receipts}
            onChange={(receipts) => onChange({ ...value, receipts })}
          />
        </>
      ) : (
        <>
          <TextField
            label={l('Bottle 材料键', 'Bottle material key')}
            value={value.artifact}
            onChange={(artifact) => onChange({ ...value, artifact })}
          />
          <TextField
            label={l('Bottle 来源', 'Bottle source')}
            value={value.source}
            onChange={(source) => onChange({ ...value, source })}
          />
          <TextField
            label={l('Bottle 平台标签', 'Bottle platform tag')}
            value={value.tag}
            onChange={(tag) => onChange({ ...value, tag })}
          />
          <TextField
            label="Cellar"
            value={value.cellar}
            onChange={(cellar) => onChange({ ...value, cellar })}
          />
          <NumberField
            label={l('Bottle 修订号', 'Bottle revision')}
            value={value.revision}
            onChange={(revision) => onChange({ ...value, revision })}
          />
          <NumberField
            label={l('Bottle 重建号', 'Bottle rebuild')}
            value={value.rebuild}
            onChange={(rebuild) => onChange({ ...value, rebuild })}
          />
          <TextField
            label={l('Bottle 可执行文件', 'Bottle executable')}
            value={value.executable}
            onChange={(executable) => onChange({ ...value, executable })}
          />
        </>
      )}
    </>
  )
}
export function SoftwareExportAuthor({
  value,
  onChange,
  locale,
}: {
  value: SoftwareExport
  onChange: (value: SoftwareExport) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <Card size="small" title={l('原生软件源导出', 'Native software source export')}>
      <Choice
        label={l('导出类型', 'Export kind')}
        value={value.kind}
        options={['disabled', 'winget', 'brew']}
        onChange={(kind) =>
          onChange(
            kind === 'disabled'
              ? { kind }
              : kind === 'winget'
                ? { kind, locale: 'en-US', name: '', publisher: '', description: '', license: '' }
                : {
                    kind,
                    name: '',
                    description: '',
                    homepage: '',
                    payload: { kind: 'cask', path: '', receipts: [] },
                  },
          )
        }
      />
      {value.kind !== 'disabled' && (
        <>
          <TextField
            label={l('导出名称', 'Export name')}
            value={value.name}
            onChange={(name) => onChange({ ...value, name })}
          />
          <TextField
            label={l('导出说明', 'Export description')}
            value={value.description}
            multiline
            onChange={(description) => onChange({ ...value, description })}
          />
        </>
      )}
      {value.kind === 'winget' && (
        <>
          <TextField
            label={l('WinGet 区域', 'WinGet locale')}
            value={value.locale}
            onChange={(locale) => onChange({ ...value, locale })}
          />
          <TextField
            label={l('WinGet 发布者', 'WinGet publisher')}
            value={value.publisher}
            onChange={(publisher) => onChange({ ...value, publisher })}
          />
          <TextField
            label={l('WinGet 许可证', 'WinGet license')}
            value={value.license}
            onChange={(license) => onChange({ ...value, license })}
          />
        </>
      )}
      {value.kind === 'brew' && (
        <>
          <TextField
            label={l('Brew 主页', 'Brew homepage')}
            value={value.homepage}
            onChange={(homepage) => onChange({ ...value, homepage })}
          />
          <BrewExportAuthor
            value={value.payload}
            onChange={(payload) => onChange({ ...value, payload })}
            locale={locale}
          />
        </>
      )}
    </Card>
  )
}
export function SoftwareAuthor({
  value,
  onChange,
  locale,
  onHashFile,
}: {
  value: SoftwareDefinition
  onChange: (value: SoftwareDefinition) => void
  locale: Locale
  onHashFile?: MaterialHashFile
}) {
  const l = labels(locale)
  return (
    <>
      <Card size="small" title={l('软件身份与来源', 'Software identity and source')}>
        <SourceSnapshotAuthor
          value={value.source}
          onChange={(source) => onChange({ ...value, source })}
          locale={locale}
        />
        <div className="admin-form-grid">
          <TextField
            label={l('软件包标识', 'Package identifier')}
            value={value.package}
            onChange={(next) => onChange({ ...value, package: next })}
          />
          <TextField
            label={l('实际软件版本', 'Actual software version')}
            value={value.version}
            onChange={(version) => onChange({ ...value, version })}
          />
        </div>
      </Card>
      <Card size="small" title={l('软件来源证据', 'Software provenance')}>
        <Choice
          label={l('来源证据类型', 'Provenance kind')}
          value={value.provenance.kind}
          options={['private', 'imported']}
          onChange={(kind) =>
            onChange({
              ...value,
              provenance:
                kind === 'private' ? { kind } : { kind, snapshot: '', converter: '', files: [] },
            })
          }
        />
        {value.provenance.kind === 'imported' && (
          <>
            <TextField
              label={l('导入快照', 'Import snapshot')}
              value={value.provenance.snapshot}
              onChange={(snapshot) => {
                if (value.provenance.kind === 'imported')
                  onChange({ ...value, provenance: { ...value.provenance, snapshot } })
              }}
            />
            <TextField
              label={l('转换器版本', 'Converter revision')}
              value={value.provenance.converter}
              onChange={(converter) => {
                if (value.provenance.kind === 'imported')
                  onChange({ ...value, provenance: { ...value.provenance, converter } })
              }}
            />
            <ItemList
              label={l('来源文件', 'Provenance files')}
              value={value.provenance.files}
              onChange={(files) => {
                if (value.provenance.kind === 'imported')
                  onChange({ ...value, provenance: { ...value.provenance, files } })
              }}
              create={() => ({ path: '', content: emptySoftwareArtifact() })}
              locale={locale}
            >
              {(file, update) => (
                <>
                  <TextField
                    label={l('来源文件路径', 'Provenance file path')}
                    value={file.path}
                    onChange={(path) => update({ ...file, path })}
                  />
                  <SoftwareArtifactAuthor
                    {...(onHashFile ? { onHashFile } : {})}
                    value={file.content}
                    onChange={(content) => update({ ...file, content })}
                    locale={locale}
                    label={l('来源文件材料', 'Provenance file material')}
                  />
                </>
              )}
            </ItemList>
          </>
        )}
      </Card>
      <NamedRecord
        label={l('软件材料', 'Software materials')}
        value={value.artifacts}
        onChange={(artifacts) => onChange({ ...value, artifacts })}
        create={emptySoftwareArtifact}
        locale={locale}
      >
        {(artifact, update, key) => (
          <SoftwareArtifactAuthor
            {...(onHashFile ? { onHashFile } : {})}
            value={artifact}
            onChange={update}
            locale={locale}
            label={key}
          />
        )}
      </NamedRecord>
      <Card size="small" title={l('安装材料绑定', 'Installation material binding')}>
        <TextField
          label={l('主安装器材料键', 'Primary installer material key')}
          value={value.material.installer}
          onChange={(installer) =>
            onChange({ ...value, material: { ...value.material, installer } })
          }
        />
        <Choice
          label={l('软件材料格式', 'Software material format')}
          value={value.material.format}
          options={['exe', 'msi', 'msix', 'pkg', 'bundle', 'winget', 'brew', 'dmg']}
          onChange={(format) => onChange({ ...value, material: { ...value.material, format } })}
        />
        <TextField
          label={l('应用 Bundle 标识（可选）', 'Application bundle ID (optional)')}
          value={value.material.bundleId ?? ''}
          onChange={(bundleId) =>
            onChange({ ...value, material: { ...value.material, bundleId: bundleId || null } })
          }
        />
      </Card>
      <BooleanField
        label={l('提供完整安装行为', 'Provide installation behavior')}
        value={value.behavior !== null}
        onChange={(enabled) =>
          onChange({
            ...value,
            behavior: enabled ? emptySoftwareBehavior(value.material.format) : null,
          })
        }
      />
      {value.behavior && (
        <SoftwareBehaviorAuthor
          value={value.behavior}
          onChange={(behavior) => onChange({ ...value, behavior })}
          locale={locale}
        />
      )}
      <SoftwareSignatures
        value={value.signatures}
        onChange={(signatures) => onChange({ ...value, signatures })}
        locale={locale}
        {...(onHashFile ? { onHashFile } : {})}
      />
      <div className="admin-form-grid">
        <Choice
          label={l('重启处理', 'Reboot handling')}
          value={value.reboot}
          options={['forbid', 'report']}
          onChange={(reboot) => onChange({ ...value, reboot })}
        />
        <Choice
          label={l('降级处理', 'Downgrade handling')}
          value={value.downgrade}
          options={['deny', 'allow']}
          onChange={(downgrade) => onChange({ ...value, downgrade })}
        />
      </div>
      <ItemList
        label={l('精确资源依赖', 'Exact resource dependencies')}
        value={value.dependencies}
        onChange={(dependencies) => onChange({ ...value, dependencies })}
        create={() => ({ resource: '', version: '', sha256: [] as readonly number[] })}
        locale={locale}
      >
        {(dependency, update) => (
          <>
            <TextField
              label={l('依赖资源', 'Dependency resource')}
              value={dependency.resource}
              onChange={(resource) => update({ ...dependency, resource })}
            />
            <TextField
              label={l('依赖固定版本', 'Fixed dependency version')}
              value={dependency.version}
              onChange={(version) => update({ ...dependency, version })}
            />
            <DigestField
              label={l('依赖版本 SHA-256', 'Dependency version SHA-256')}
              value={dependency.sha256}
              onChange={(sha256) => update({ ...dependency, sha256 })}
            />
          </>
        )}
      </ItemList>
      <SoftwareExportAuthor
        value={value.export}
        onChange={(next) => onChange({ ...value, export: next })}
        locale={locale}
      />
    </>
  )
}
