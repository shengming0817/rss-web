/** MOCK_SOURCE: safe synthetic formal PKI only; no real CA or device trust effect. */
import { INSTANCE } from './operations/authorization'
import type { DomainHandler } from './scenario'
import { TENANT } from './scenario'
import { error, ok } from './http'
import { closed, enumeration, uuid, count } from '../src/services/decode'
import {
  pkiTrust,
  pkiPublications,
  pkiPurposes,
  type PkiPurpose,
  type PkiTrust,
} from '../src/features/settings/clients/pki'
import { recoveryGrant, publicChain } from '../src/features/enrollment/clients/recovery'
const origin = 'https://mdm.example.test'
export function createPkiDemo() {
  const trusts = new Map<PkiPurpose, PkiTrust>(),
    rotations = new Map<
      string,
      {
        purpose: PkiPurpose
        state: 'distributing' | 'activated' | 'retired'
        previous: string
        candidate: string
      }
    >(),
    receipts = new Map<string, { input: string; value: unknown; status: number }>()
  function reset() {
    trusts.clear()
    rotations.clear()
    receipts.clear()
    for (const purpose of pkiPurposes)
      trusts.set(purpose, {
        version: 1,
        service_id: INSTANCE,
        origin,
        tenant: TENANT,
        purpose,
        revision: 1,
        issuers: [
          {
            digest: 'a'.repeat(64),
            mode: 'active',
            certificate: 'YQ==',
            root: 'YQ==',
            crl: 'YQ==',
            root_crl: 'YQ==',
            provisioner: `synthetic-${purpose}`,
            kid: 'synthetic-public',
          },
        ],
      })
  }
  reset()
  const handle: DomainHandler = (r, scenario) => {
    if (
      !r.path.startsWith('/api/v1/pki/') &&
      !/^\/api\/v1\/agent-(registrations|issuances)\//.test(r.path)
    )
      return
    if (r.actor.tenantId !== TENANT || scenario === 'denied' || scenario === 'forbidden')
      return error('permission_denied', 403)
    const read = /^\/api\/v1\/pki\/(agent|windows|apple)\/trust$/.exec(r.path)
    if (read && r.method === 'GET') return ok(trusts.get(read[1] as PkiPurpose))
    if (
      /^\/api\/v1\/pki\/agent\/trust\/devices\/[^/]+\/observation$/.test(r.path) &&
      r.method === 'GET'
    )
      return ok(null)
    if (
      /^\/api\/v1\/agent-issuances\/[^/]+\/recovery-operations\/[^/]+$/.test(r.path) &&
      r.method === 'GET'
    )
      return ok(null)
    if (r.method !== 'POST') return error('action_not_supported', 501)
    try {
      if (/^\/api\/v1\/agent-registrations\/[^/]+\/recovery$/.test(r.path)) {
        recoveryGrant(r.body)
        return { status: 503, body: { code: 'service_unavailable', issuanceId: null } }
      }
      if (/^\/api\/v1\/agent-issuances\/[^/]+\/recover$/.test(r.path)) {
        const v = closed(r.body, ['wireVersion', 'operationId', 'certificateChain'])
        if (v['wireVersion'] !== 1) throw new Error('version')
        uuid(v['operationId'])
        publicChain(v['certificateChain'])
        return { status: 503, body: { code: 'issuance_unknown', issuanceId: r.path.split('/')[4] } }
      }
      const transition = /^\/api\/v1\/pki\/(agent|windows|apple)\/rotations$/.exec(r.path)
      const v = closed(
        r.body,
        r.path.endsWith('/crls')
          ? ['operation', 'purpose', 'publications']
          : transition
            ? ['id', 'expected_revision', 'action']
            : r.path.endsWith('/signing/recover')
              ? ['operation', 'attempt', 'chain']
              : ['id', 'purpose', 'expected_revision', 'candidate'],
      )
      const id = uuid(v['id'] ?? v['operation']),
        phase = transition ? enumeration(v['action'], ['activate', 'retire'] as const) : r.path
      const key = JSON.stringify([r.actor.principalId, id, phase]),
        input = JSON.stringify(r.body),
        old = receipts.get(key)
      if (old)
        return old.input === input
          ? { status: old.status, body: structuredClone(old.value) }
          : error('operation_conflict')
      if (scenario === 'conflict' || scenario === 'partial') return error('operation_conflict')
      let value: unknown,
        status = 200
      if (r.path.endsWith('/signing/recover')) {
        uuid(v['attempt'])
        publicChain(v['chain'])
        return error('service_unavailable', 503)
      }
      const purpose = enumeration(transition?.[1] ?? v['purpose'], pkiPurposes),
        current = trusts.get(purpose)!
      if (r.path.endsWith('/crls')) {
        const publications = pkiPublications(v['publications'])
        for (const p of publications) {
          const issuer = current.issuers.find((i) => i.digest === p.issuer)
          if (!issuer) throw new Error('issuer')
          issuer.crl = p.crl
          issuer.root_crl = p.root_crl
        }
        status = 204
      } else if (!transition) {
        const candidate = pkiTrust(v['candidate'], TENANT, purpose)
        if (
          count(v['expected_revision']) !== current.revision ||
          candidate.revision !== current.revision + 1 ||
          candidate.service_id !== current.service_id
        )
          return error('operation_conflict')
        const added = candidate.issuers.filter(
          (i) => !current.issuers.some((o) => o.digest === i.digest),
        )
        if (added.length !== 1 || added[0]!.mode !== 'prepared') throw new Error('issuer')
        if (
          current.issuers.some(
            (i) => !candidate.issuers.some((n) => JSON.stringify(n) === JSON.stringify(i)),
          )
        )
          return error('operation_conflict')
        rotations.set(id, {
          purpose,
          state: 'distributing',
          previous: current.issuers.find((i) => i.mode === 'active')!.digest,
          candidate: added[0]!.digest,
        })
        trusts.set(purpose, candidate)
        value = { operation: id, revision: candidate.revision, state: 'distributing' }
      } else {
        const rotation = rotations.get(id),
          action = v['action']
        if (
          !rotation ||
          rotation.purpose !== purpose ||
          count(v['expected_revision']) !== current.revision ||
          (action === 'activate'
            ? rotation.state !== 'distributing'
            : rotation.state !== 'activated')
        )
          return error('operation_conflict')
        // No authenticated PKI ACK or original CA lifecycle is simulated here.
        return error('operation_conflict')
      }
      receipts.set(key, { input, value: structuredClone(value), status })
      return scenario === 'unknown' ? error('operation_unknown', 503) : { status, body: value }
    } catch {
      return error('malformed_request', 400)
    }
  }
  return { handle, reset }
}
