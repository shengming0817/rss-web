import type { BinaryResponse } from '@rss/api/mdm'
import { closed, integer, nullable, string } from '../../../services/decode'
/** Validate server-selected attachment metadata and retain the exact response bytes. */
export function attachment(
  value: unknown,
  type: string,
  filename: string,
  maximum: number,
): BinaryResponse {
  const v = closed(value, [
    'bytes',
    'status',
    'contentType',
    'contentDisposition',
    'contentLength',
    'contentRange',
    'etag',
  ])
  if (!(v['bytes'] instanceof ArrayBuffer)) throw new Error('Invalid bytes')
  const bytes = v['bytes']
  try {
    const status = integer(v['status']),
      contentLength = nullable(v['contentLength'], string),
      contentRange = nullable(v['contentRange'], string),
      etag = nullable(v['etag'], string)
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
      status,
      contentType: v['contentType'],
      contentDisposition: String(v['contentDisposition']),
      contentLength,
      contentRange,
      etag,
    }
  } catch (error) {
    new Uint8Array(bytes).fill(0)
    throw error
  }
}
