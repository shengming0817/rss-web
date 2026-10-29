import { publicChain } from '../../enrollment/clients/recovery'
/** Public certificates only. Reject mixed PEM, private keys and free text before dispatch. */
export function readPublicChain(text: string) {
  if (new TextEncoder().encode(text).byteLength > 180000) throw new Error('Public chain too large')
  if (text.trim().startsWith('[')) return publicChain(JSON.parse(text))
  const pattern = /-----BEGIN CERTIFICATE-----([A-Za-z0-9+/=\r\n \t]+)-----END CERTIFICATE-----/g
  const blocks = [...text.matchAll(pattern)]
  if (text.replace(pattern, '').trim()) throw new Error('Only public certificate PEM is accepted')
  return publicChain(blocks.map((v) => v[1]!.replace(/\s+/g, '')))
}
