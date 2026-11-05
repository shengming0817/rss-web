import { expect, it } from 'vitest'
import { certificateFingerprint, publicCertificateChain, publicDer } from './public-materials'
it('accepts public PEM and exact canonical DER framing and rejects private-key input', () => {
  expect(
    publicDer('-----BEGIN CERTIFICATE-----\nAQID\n-----END CERTIFICATE-----', 'certificate'),
  ).toBe('AQID')
  expect(publicDer('-----BEGIN X509 CRL-----\nAQID\n-----END X509 CRL-----', 'crl')).toBe('AQID')
  expect(
    publicDer(
      '-----BEGIN CERTIFICATE REQUEST-----\nAQID\n-----END CERTIFICATE REQUEST-----',
      'csr',
    ),
  ).toBe('AQID')
  for (const value of [
    '-----BEGIN PRIVATE KEY-----\nAQID\n-----END PRIVATE KEY-----',
    'YR==',
    '-----BEGIN X509 CRL-----AQID-----END X509 CRL-----',
  ])
    expect(() => publicDer(value, 'certificate')).toThrow()
})
it('retains public certificate chain order and rejects unrelated PEM content', () => {
  expect(
    publicCertificateChain(
      '-----BEGIN CERTIFICATE-----\nAQID\n-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----BAUG-----END CERTIFICATE-----',
    ),
  ).toEqual(['AQID', 'BAUG'])
  expect(() =>
    publicCertificateChain('-----BEGIN CERTIFICATE-----AQID-----END CERTIFICATE-----\nPRIVATE KEY'),
  ).toThrow()
})
it('computes the fingerprint from exact certificate DER without treating it as certificate verification', async () => {
  expect(await certificateFingerprint('AQID')).toBe(
    '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
  )
})
