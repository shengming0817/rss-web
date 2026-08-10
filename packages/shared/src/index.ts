export const SOURCE_KINDS = ['rss', 'mock', 'manual', 'external', 'unavailable'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

declare const SOURCE_META_BRAND: unique symbol
type SealedSource<T> = T & { readonly [SOURCE_META_BRAND]: true }

type SourceShape =
  | { readonly kind: 'rss'; readonly authoritative: true; readonly preview: false }
  | { readonly kind: 'mock'; readonly authoritative: false; readonly preview: true }
  | {
      readonly kind: 'manual' | 'external' | 'unavailable'
      readonly authoritative: false
      readonly preview: false
    }

type SealUnion<T> = T extends SourceShape ? SealedSource<T> : never
export type SourceMeta = SealUnion<SourceShape>

function sealSource<const T extends SourceShape>(source: T): SealedSource<T> {
  return Object.freeze(source) as SealedSource<T>
}

export const RSS_SOURCE = sealSource({ kind: 'rss', authoritative: true, preview: false })
export const MOCK_SOURCE = sealSource({ kind: 'mock', authoritative: false, preview: true })
export const MANUAL_SOURCE = sealSource({ kind: 'manual', authoritative: false, preview: false })
export const EXTERNAL_SOURCE = sealSource({
  kind: 'external',
  authoritative: false,
  preview: false,
})
export const UNAVAILABLE_SOURCE = sealSource({
  kind: 'unavailable',
  authoritative: false,
  preview: false,
})
