import { chunkBytes, type MaterialSource } from '@rss/mdm-content'

export interface OwnedMaterialSource {
  readonly source: MaterialSource
  release(): void
}
/** File stays local and is read only through bounded slices; releasing drops the sole retained handle. */
export function fileMaterial(file: File): OwnedMaterialSource {
  let held: File | null = file
  return {
    source: {
      length: file.size,
      async read(offset, length) {
        const current = held
        if (
          !current ||
          !Number.isSafeInteger(offset) ||
          !Number.isSafeInteger(length) ||
          offset < 0 ||
          length < 1 ||
          length > chunkBytes ||
          offset + length > current.size
        )
          throw { cause: 'client', code: 'material_source_required' }
        return current.slice(offset, offset + length).arrayBuffer()
      },
    },
    release() {
      held = null
    },
  }
}
export function bufferedMaterial(buffer: ArrayBuffer): OwnedMaterialSource {
  let held: ArrayBuffer | null = buffer
  return {
    source: {
      length: buffer.byteLength,
      async read(offset, length) {
        if (
          !held ||
          !Number.isSafeInteger(offset) ||
          !Number.isSafeInteger(length) ||
          offset < 0 ||
          length < 1 ||
          length > chunkBytes ||
          offset + length > held.byteLength
        )
          throw { cause: 'client', code: 'material_source_required' }
        return held.slice(offset, offset + length)
      },
    },
    release() {
      if (held) new Uint8Array(held).fill(0)
      held = null
    },
  }
}
