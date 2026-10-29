import type { SoftwareSignature } from '@rss/mdm-resources'
import { BooleanField, Choice, ItemList, TextField } from './AuthorFields'
import {
  SoftwareArtifactAuthor,
  emptySoftwareArtifact,
  type MaterialHashFile,
} from './ArtifactAuthor'
import { labels } from './AdminUi'
import type { Locale } from './i18n'

export function SoftwareSignatures({
  value,
  onChange,
  onHashFile,
  locale,
}: {
  value: readonly SoftwareSignature[]
  onChange: (value: readonly SoftwareSignature[]) => void
  onHashFile?: MaterialHashFile
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <ItemList
      label={l('软件签名声明', 'Software signature declarations')}
      value={value}
      onChange={onChange}
      create={() => ({
        artifact: '',
        mechanism: 'authenticode' as const,
        publisher: '',
        evidence: null,
      })}
      locale={locale}
    >
      {(signature, update) => (
        <>
          <TextField
            label={l('签名材料键', 'Signed material key')}
            value={signature.artifact}
            onChange={(artifact) => update({ ...signature, artifact })}
          />
          <Choice
            label={l('签名机制', 'Signature mechanism')}
            value={signature.mechanism}
            options={['authenticode', 'apple_developer_id', 'msix']}
            onChange={(mechanism) => update({ ...signature, mechanism })}
          />
          <TextField
            label={l('签名主体', 'Signing publisher')}
            value={signature.publisher}
            onChange={(publisher) => update({ ...signature, publisher })}
          />
          <BooleanField
            label={l('附带签名证据材料', 'Include signature evidence material')}
            value={signature.evidence !== null}
            onChange={(enabled) =>
              update({ ...signature, evidence: enabled ? emptySoftwareArtifact() : null })
            }
          />
          {signature.evidence && (
            <SoftwareArtifactAuthor
              value={signature.evidence}
              onChange={(evidence) => update({ ...signature, evidence })}
              locale={locale}
              label={l('签名证据', 'Signature evidence')}
              {...(onHashFile ? { onHashFile } : {})}
            />
          )}
        </>
      )}
    </ItemList>
  )
}
