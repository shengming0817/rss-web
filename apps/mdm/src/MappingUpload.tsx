import { useState } from 'react'
import type { createMappings, PreparedMaterial } from '@rss/mdm-resources'
import type { UploadIntent, UploadSession } from '@rss/mdm-content'
import { ContentUpload, type ContentUseCases } from './ContentUpload'
import { bufferedMaterial } from './MaterialSource'
import type { Locale } from './i18n'

export type MappingUseCases = ReturnType<typeof createMappings>
/** Mapping owns reconstruction of fixed declarations; the content panel owns transfer and receipt state. */
export function MappingUpload({
  mappings,
  content,
  upload,
  intent,
  initialSession,
  scriptSourceVersion,
  locale,
  canWrite,
  confirmed,
  initialAvailable = true,
}: {
  mappings: MappingUseCases
  content: ContentUseCases
  upload: PreparedMaterial
  intent: UploadIntent
  initialSession?: UploadSession
  scriptSourceVersion?: string
  locale: Locale
  canWrite: boolean
  confirmed?: () => void
  initialAvailable?: boolean
}) {
  const [source] = useState(() => (initialAvailable ? bufferedMaterial(upload.bytes) : undefined))
  return (
    <ContentUpload
      content={content}
      intent={intent}
      {...(source ? { initialSource: source } : {})}
      {...(initialSession ? { initialSession } : {})}
      restore={async (signal) => {
        const material = await mappings.restore(
          upload.target,
          scriptSourceVersion ? { version: scriptSourceVersion } : undefined,
          signal,
        )
        return bufferedMaterial(material.bytes)
      }}
      locale={locale}
      canWrite={canWrite}
      {...(confirmed ? { confirmed } : {})}
    />
  )
}
