/** Public CA material only. Parsing identifies framing; the backend validates X.509/CRL/CSR semantics. */
export function publicDer(input: string, kind: 'certificate' | 'crl' | 'csr'): string {
  if (input.length > 24 * 1024 * 1024 || /PRIVATE KEY|ENCRYPTED|PASSWORD/i.test(input))
    throw { cause: 'client', code: 'invalid_input' }
  const label =
    kind === 'certificate' ? 'CERTIFICATE' : kind === 'crl' ? 'X509 CRL' : 'CERTIFICATE REQUEST'
  const trimmed = input.trim(),
    begin = `-----BEGIN ${label}-----`,
    end = `-----END ${label}-----`
  let encoded = trimmed
  if (trimmed.startsWith(begin) && trimmed.endsWith(end))
    encoded = trimmed.slice(begin.length, -end.length).replace(/\s/g, '')
  else encoded = trimmed.replace(/\s/g, '')
  if (!encoded || encoded.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))
    throw { cause: 'client', code: 'invalid_input' }
  try {
    if (btoa(atob(encoded)) !== encoded) throw new Error('encoding')
  } catch {
    throw { cause: 'client', code: 'invalid_input' }
  }
  return encoded
}
export function publicCertificateChain(input: string): readonly string[] {
  if (input.length > 180000 || /PRIVATE KEY|ENCRYPTED|PASSWORD/i.test(input))
    throw { cause: 'client', code: 'invalid_input' }
  if (input.includes('-----BEGIN')) {
    const blocks = [
      ...input.matchAll(/-----BEGIN CERTIFICATE-----[A-Za-z0-9+/=\s]+-----END CERTIFICATE-----/g),
    ]
    const remainder = input
      .replace(/-----BEGIN CERTIFICATE-----[A-Za-z0-9+/=\s]+-----END CERTIFICATE-----/g, '')
      .trim()
    if (remainder || !blocks.length || blocks.length > 4)
      throw { cause: 'client', code: 'invalid_input' }
    return blocks.map((block) => publicDer(block[0], 'certificate'))
  }
  const lines = input
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length || lines.length > 4) throw { cause: 'client', code: 'invalid_input' }
  return lines.map((line) => publicDer(line, 'certificate'))
}
export async function certificateFingerprint(encoded: string): Promise<string> {
  const bytes = Uint8Array.from(atob(publicDer(encoded, 'certificate')), (c) => c.charCodeAt(0))
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
