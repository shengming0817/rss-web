import type { BinaryResponse } from '@rss/api/mdm'
/** Admit an attachment without reserializing its bytes. Invalid secret responses are erased. */
export function attachment(
  value: BinaryResponse,
  contentType: string,
  filename: string,
  maximum: number,
) {
  const bytes = value.bytes
  if (!(bytes instanceof ArrayBuffer)) throw new Error('Invalid attachment bytes')
  try {
    if (
      !bytes.byteLength ||
      bytes.byteLength > maximum ||
      typeof value.contentType !== 'string' ||
      typeof value.contentDisposition !== 'string' ||
      value.contentType.split(';')[0]?.trim().toLowerCase() !== contentType ||
      ![`attachment; filename=${filename}`, `attachment; filename="${filename}"`].includes(
        value.contentDisposition,
      )
    )
      throw new Error('Invalid attachment')
    return { bytes, contentType: value.contentType, filename }
  } catch (error) {
    new Uint8Array(bytes).fill(0)
    throw error
  }
}
