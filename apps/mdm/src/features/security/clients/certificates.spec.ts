import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { operation } from '../../../services/useOperation'
import { certificate } from './certificates-model'
import { createCertificatesClient } from './certificates'
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222',
  source = { registrationId: other, generation: 1, source: 'mdm.windows' },
  credential = {
    serial: 'SYNTHETIC-1',
    fingerprint: 'SYNTHETIC-2',
    subject: 'CN=Synthetic',
    notBefore: 90,
    notAfter: 200,
  },
  record = {
    id,
    revision: 1,
    device: 'device-01',
    profile: {
      id: other,
      name: 'Synthetic certificate',
      platform: 'windows',
      protocol: 'scep',
      issuer: 'Synthetic CA',
      purpose: 'device_identity',
    },
    source,
    issuance: null,
    installed: { credential, source, observedAt: 100 },
    validity: 'expiring',
    evaluatedAt: 100,
  },
  envelope = { contract: 'security-v1', tenantId: id, source: 'mock', asOf: 100 }
it('rejects secret fields, wrong platform sources, invalid validity and claimed installation without evidence', () => {
  expect(certificate(record).installed?.credential.fingerprint).toBe('SYNTHETIC-2')
  expect(() =>
    certificate({
      ...record,
      installed: {
        ...record.installed,
        credential: { ...credential, privateKey: 'must not pass' },
      },
    }),
  ).toThrow()
  expect(() => certificate({ ...record, source: { ...source, source: 'mdm.apple' } })).toThrow()
  expect(() => certificate({ ...record, installed: null })).toThrow()
  expect(() => certificate({ ...record, validity: 'expired' })).toThrow()
  expect(() => certificate({ ...record, validity: 'valid', evaluatedAt: 201 })).toThrow()
  expect(() =>
    certificate({
      ...record,
      installed: { ...record.installed, credential: { ...credential, notAfter: 80 } },
    }),
  ).toThrow()
  expect(() =>
    certificate({ ...record, installed: { ...record.installed, observedAt: 101 } }),
  ).toThrow()
  expect(() =>
    certificate({
      ...record,
      issuance: {
        operation: other,
        state: 'issued',
        requestedAt: 98,
        resultAt: 99,
        credential: null,
      },
    }),
  ).toThrow()
})
it('binds device pages and exact issuance receipts and rejects mock data from a real source', async () => {
  let reply: unknown = { ...envelope, items: [record], snapshot: other, nextCursor: null }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply)),
    transport = { request } as unknown as HttpTransport,
    client = createCertificatesClient(transport, id, true)
  await expect(client.list('device-01')).resolves.toMatchObject({ items: [{ id }] })
  await expect(client.list('device-02')).rejects.toThrow()
  const body = operation({}, 1),
    issued = {
      ...record,
      revision: 2,
      issuance: {
        operation: body.operationId,
        state: 'requested',
        requestedAt: 100,
        resultAt: null,
        credential: null,
      },
    }
  reply = { ...envelope, certificate: issued }
  await expect(client.issue(id, body)).resolves.toMatchObject({ certificate: { revision: 2 } })
  expect(request.mock.lastCall![0]).toMatchObject({ pathParams: { id }, body })
  reply = {
    ...envelope,
    certificate: { ...issued, issuance: { ...issued.issuance, operation: other } },
  }
  await expect(client.issue(id, body)).rejects.toThrow()
  reply = { ...envelope, certificate: record }
  await expect(client.read(other)).rejects.toThrow()
  await expect(createCertificatesClient(transport, id, false).read(id)).rejects.toThrow()
})
