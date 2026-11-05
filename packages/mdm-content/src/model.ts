import type { MaterialTarget, SoftwareFormat, SoftwareSource } from '@rss/mdm-resources'

export const chunkBytes = 4 * 1024 * 1024
export interface UploadIntent {
  readonly id: string
  readonly target: MaterialTarget
}
export interface UploadSession {
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
  begin(intent: UploadIntent, signal?: AbortSignal): Promise<UploadSession>
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
