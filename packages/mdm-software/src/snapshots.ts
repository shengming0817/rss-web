import type { DirectoryQuery, Page } from '@rss/mdm-devices'
import { freeze, operation, uuid, type Operation } from '@rss/mdm-inventory'

export type SnapshotExtraction = Readonly<{
  records?: string | null
  packageId?: string | null
  name?: string | null
  version?: string | null
}>
export interface Snapshot {
  readonly source: string
  readonly revision: number
  readonly documentSha256: readonly number[]
  readonly entryCount: number
  readonly importedAt: number
  readonly extraction: SnapshotExtraction
}
export interface SnapshotEntry {
  readonly source: string
  readonly revision: number
  readonly entryId: string
  readonly packageId: string | null
  readonly name: string | null
  readonly version: string | null
}
export type SnapshotDetail = Snapshot & { readonly document: string }
export type SnapshotEntryDetail = SnapshotEntry & {
  readonly documentSha256: readonly number[]
  readonly data: string
}
export type SnapshotImport = Operation<{
  readonly document: string
  readonly extraction: SnapshotExtraction
}>
export type SnapshotReceipt = Snapshot & { readonly operationId: string }

export interface SoftwareSnapshotsPort {
  sources(
    query: DirectoryQuery<keyof Snapshot>,
    signal?: AbortSignal,
  ): Promise<Page<Partial<Snapshot> & Pick<Snapshot, 'source'>>>
  snapshot(source: string, signal?: AbortSignal): Promise<SnapshotDetail>
  entries(
    source: string,
    query: DirectoryQuery<keyof SnapshotEntry>,
    signal?: AbortSignal,
  ): Promise<Page<Partial<SnapshotEntry> & Pick<SnapshotEntry, 'entryId'>>>
  entry(source: string, entry: string, signal?: AbortSignal): Promise<SnapshotEntryDetail>
  replace(source: string, intent: SnapshotImport): Promise<SnapshotReceipt>
  receipt(source: string, operation: string): Promise<SnapshotReceipt>
}

export function createSoftwareSnapshots(port: SoftwareSnapshotsPort) {
  return Object.freeze({
    sources: port.sources,
    async snapshot(source: string, signal?: AbortSignal) {
      const value = await port.snapshot(source, signal)
      if (value.source !== source) throw new Error('Wrong snapshot source')
      return value
    },
    entries: port.entries,
    async entry(source: string, revision: number, entry: string, signal?: AbortSignal) {
      const value = await port.entry(source, uuid(entry), signal)
      if (value.source !== source || value.revision !== revision || value.entryId !== entry)
        throw { cause: 'client', status: 409, code: 'configuration_changed' }
      return value
    },
    async replace(source: string, intent: SnapshotImport) {
      operation(intent)
      const result = await port.replace(source, freeze(intent))
      if (
        result.source !== source ||
        result.operationId !== intent.operationId ||
        result.revision !== intent.expectedRevision + 1
      )
        throw new Error('Wrong snapshot replacement receipt')
      return result
    },
    async receipt(source: string, id: string) {
      const value = await port.receipt(source, uuid(id))
      if (value.source !== source || value.operationId !== id)
        throw new Error('Wrong snapshot operation')
      return value
    },
  })
}
