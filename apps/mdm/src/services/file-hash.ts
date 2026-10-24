// ref: noble-hashes 2.4.0 src/sha2.ts — incremental SHA-256, no complete-file buffer.
import { sha256 } from '@noble/hashes/sha2.js'
export const FILE_CHUNK_BYTES = 4 * 1024 * 1024
export async function fileHash(file: Blob, signal?: AbortSignal) {
  const hash = sha256.create()
  try {
    for (let offset = 0; offset < file.size; offset += FILE_CHUNK_BYTES) {
      signal?.throwIfAborted()
      const bytes = await file.slice(offset, offset + FILE_CHUNK_BYTES).arrayBuffer()
      signal?.throwIfAborted()
      hash.update(new Uint8Array(bytes))
    }
    return [...hash.digest()]
  } finally {
    hash.destroy()
  }
}
