import type { BinaryResponse } from '@rss/api/mdm'
import { closed } from '../../../services/decode'
/** Validate server-selected attachment metadata and retain the exact response bytes. */
export function attachment(
  value: unknown,
  type: string,
  filename: string,
  maximum: number,
): BinaryResponse {
  const v = closed(value, ['bytes', 'contentType', 'contentDisposition'])
  if (!(v['bytes'] instanceof ArrayBuffer)) throw new Error('Invalid bytes')
  const bytes = v['bytes']
  try {
    if (
      !bytes.byteLength ||
      bytes.byteLength > maximum ||
      typeof v['contentType'] !== 'string' ||
      v['contentType'].split(';')[0]!.trim().toLowerCase() !== type ||
      ![`attachment; filename=${filename}`, `attachment; filename="${filename}"`].includes(
        String(v['contentDisposition']),
      )
    )
      throw new Error('Invalid attachment')
    return {
      bytes,
      contentType: v['contentType'],
      contentDisposition: String(v['contentDisposition']),
    }
  } catch (error) {
    new Uint8Array(bytes).fill(0)
    throw error
  }
}
