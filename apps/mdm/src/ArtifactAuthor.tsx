import type { Artifact, SoftwareArtifact, SoftwareSource } from '@rss/mdm-resources'
import { DigestField, NumberField, TextField } from './AuthorFields'
import { labels } from './AdminUi'
import type { Locale } from './i18n'

export function ArtifactAuthor({
  value,
  onChange,
  locale,
  label,
}: {
  value: Artifact
  onChange: (value: Artifact) => void
  locale: Locale
  label: string
}) {
  const l = labels(locale)
  return (
    <>
      <TextField
        label={`${label} ${l('内容引用', 'content reference')}`}
        value={value.reference}
        onChange={(reference) => onChange({ ...value, reference })}
      />
      <NumberField
        label={`${label} ${l('字节', 'bytes')}`}
        value={value.length}
        minimum={1}
        onChange={(length) => onChange({ ...value, length })}
      />
      <DigestField
        label={`${label} SHA-256`}
        value={value.sha256}
        onChange={(sha256) => onChange({ ...value, sha256 })}
      />
    </>
  )
}
export function SoftwareArtifactAuthor({
  value,
  onChange,
  locale,
  label,
  onHashFile,
}: {
  value: SoftwareArtifact
  onChange: (value: SoftwareArtifact) => void
  locale: Locale
  label: string
  onHashFile?: MaterialHashFile
}) {
  const l = labels(locale)
  return (
    <>
      {onHashFile && (
        <label className="content-file">
          {l('从文件计算材料长度与摘要', 'Calculate material length and digest from a file')}
          <input
            type="file"
            aria-label={`${label} ${l('计算材料摘要', 'calculate material digest')}`}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) onHashFile(file, (metadata) => onChange({ ...value, ...metadata }))
            }}
          />
        </label>
      )}
      <ArtifactAuthor
        value={value}
        onChange={(next) => onChange({ ...value, ...next })}
        locale={locale}
        label={label}
      />
      <TextField
        label={`${label} ${l('来源位置（可选）', 'origin location (optional)')}`}
        value={value.origin ?? ''}
        onChange={(origin) => onChange({ ...value, origin: origin || null })}
      />
    </>
  )
}
export function SourceSnapshotAuthor({
  value,
  onChange,
  locale,
}: {
  value: SoftwareSource
  onChange: (value: SoftwareSource) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <>
      <TextField
        label={l('软件来源标识', 'Software source ID')}
        value={value.id}
        onChange={(id) => onChange({ ...value, id })}
      />
      <TextField
        label={l('软件来源精确版本', 'Exact software source revision')}
        value={value.revision}
        onChange={(revision) => onChange({ ...value, revision })}
      />
      <DigestField
        label={l('软件来源快照 SHA-256', 'Software source snapshot SHA-256')}
        value={value.sha256}
        onChange={(sha256) => onChange({ ...value, sha256 })}
      />
    </>
  )
}

export type MaterialHashFile = (
  file: File,
  apply: (metadata: Pick<Artifact, 'length' | 'sha256'>) => void,
) => void

export const emptySoftwareArtifact = (): SoftwareArtifact => ({
  reference: '',
  length: 1,
  sha256: [],
  origin: null,
})
