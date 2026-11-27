import type { MaterialTarget, SoftwareFormat, SoftwareSource } from '@rss/mdm-resources'

export const chunkBytes = 4 * 1024 * 1024
export interface ResourceContentIntent {
  readonly id: string
  readonly target: MaterialTarget
}
export interface ResourceUploadIntent extends ResourceContentIntent {
  readonly purpose: 'resource'
}
export interface ResourceUploadSession {
  readonly purpose: 'resource'
  readonly id: string
  readonly target: MaterialTarget
  readonly resourceDigest: readonly number[]
  readonly actor: string
  readonly storageClass: 'artifact' | 'native_configuration'
  readonly inspection: SoftwareFormat | null
  readonly source: SoftwareSource | null
  readonly origin: string | null
  readonly offset: number
  readonly expires: number
  /** Storage frontier only; not a durable business binding or software admission. */
  readonly complete: boolean
}
export interface SoftwareUploadTarget {
  readonly resource: string
  readonly filename: string
  readonly artifact: MaterialTarget['artifact']
}
export interface SoftwareUploadIntent {
  readonly purpose: 'software'
  readonly id: string
  readonly target: SoftwareUploadTarget
}
export interface SoftwareUploadSession extends SoftwareUploadIntent {
  readonly actor: string
  readonly offset: number
  readonly expires: number
  readonly complete: boolean
}
export type UploadIntent = ResourceUploadIntent | SoftwareUploadIntent
export type UploadSession = ResourceUploadSession | SoftwareUploadSession
export interface ContentReceipt {
  readonly operationId: string
  readonly resource: string
  readonly version: string
  readonly reference: string
  readonly length: number
  readonly sha256: readonly number[]
  readonly committed: true
}
/** The reader owns a fresh chunk; its consumer erases it before releasing it. */
export interface MaterialSource {
  readonly length: number
  read(offset: number, length: number): Promise<ArrayBuffer>
}
export interface DownloadRequest {
  readonly kind: 'script' | 'software'
  readonly target: MaterialTarget
}
export interface DownloadChunk {
  readonly bytes: ArrayBuffer
  readonly start: number
  readonly end: number
  readonly total: number
  readonly etag: string
}
export interface DownloadSink {
  write(bytes: Uint8Array): Promise<void>
  close(): Promise<void>
  abort(): Promise<void>
}
export interface ContentPort {
  mirror(intent: ResourceContentIntent, signal?: AbortSignal): Promise<void>
  begin(intent: ResourceUploadIntent, signal?: AbortSignal): Promise<ResourceUploadSession>
  read(resource: string, upload: string, signal?: AbortSignal): Promise<UploadSession>
  append(
    intent: UploadIntent,
    offset: number,
    bytes: ArrayBuffer,
    signal?: AbortSignal,
  ): Promise<UploadSession>
  complete(intent: UploadIntent, signal?: AbortSignal): Promise<void>
  receipt(resource: string, operationId: string): Promise<ContentReceipt>
  download(
    request: DownloadRequest,
    range: { readonly start: number; readonly end: number; readonly etag?: string },
    signal?: AbortSignal,
  ): Promise<DownloadChunk>
}
