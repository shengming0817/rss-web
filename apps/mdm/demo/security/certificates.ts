import { randomUUID } from 'node:crypto'
import type { DomainHandler, Scenario } from '../scenario'
import type { DemoEvent } from '../policies/schedule'
import type { createDeviceDemo } from '../devices/state'
import type { createOperationsDemo } from '../operations/state'
import type { SecurityRequestTarget } from '../../src/features/security/clients/requests-model'
import type { SecuritySource } from '../../src/features/security/clients/source'
import {
  certificate,
  type Certificate,
} from '../../src/features/security/clients/certificates-model'
import { closed, identifier, uuid } from '../../src/services/decode'
import { createReceipts, error, operation } from '../http'
import { candidate, createSecurityPages, queryKeys } from './http'
export function createCertificatesDemo(
  now: () => number,
  devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts'>,
  operations: ReturnType<typeof createOperationsDemo>,
) {
  const records = new Map<string, Certificate>(),
    receipts = createReceipts(),
    pages = createSecurityPages(now),
    alertVersions = new Map<string, { key: string; version: number }>()
  function source(device: string): SecuritySource | null {
    const d = devices.facts().find((d) => d.summary.id === device),
      expected = d?.summary.platform === 'windows' ? 'mdm.windows' : 'mdm.apple',
      active = d?.registrations.filter((r) => r.status === 'active' && r.source === expected) ?? []
    if (active.length !== 1) return null
    const r = active[0]!
    if (
      !d?.securityBindings?.some(
        (b) =>
          b.registration === r.registrationId &&
          b.generation === r.generation &&
          b.capabilities.includes('certificate.deploy.v1'),
      )
    )
      return null
    return { registrationId: r.registrationId, generation: r.generation, source: expected }
  }
  function credential(device: string, at: number, lifetime: number) {
    return {
      serial: `SYNTHETIC-${randomUUID()}`,
      fingerprint: `SYNTHETIC-${randomUUID()}`,
      subject: `CN=Synthetic ${device}`,
      notBefore: at,
      notAfter: at + lifetime,
    }
  }
  function seed() {
    for (const d of devices.facts()) {
      if (
        !['windows', 'macos'].includes(d.summary.platform) ||
        [...records.values()].some((c) => c.device === d.summary.id)
      )
        continue
      const at = now(),
        s = source(d.summary.id),
        installed =
          d.summary.id === 'device-01' && s
            ? { credential: credential(d.summary.id, at - 86400, 90000), observedAt: at, source: s }
            : null
      const c = certificate({
        id: randomUUID(),
        revision: 1,
        device: d.summary.id,
        profile: {
          id: randomUUID(),
          name: 'Synthetic device identity',
          platform: d.summary.platform,
          protocol: d.summary.platform === 'windows' ? 'scep' : 'acme',
          issuer: 'RSS synthetic CA v1',
          purpose: 'device_identity',
        },
        source: s,
        issuance: null,
        installed,
        validity: installed ? 'expiring' : 'unknown',
        evaluatedAt: at,
      })
      records.set(c.id, c)
    }
  }
  function audit(
    c: Certificate,
    action: 'certificate_requested' | 'certificate_issued' | 'certificate_observed',
    actor: string | null,
    outcome: 'accepted' | 'observed' | 'failed' | 'unknown',
  ) {
    operations.record({
      at: now(),
      actor,
      action,
      target: { kind: 'certificate', id: c.id, device: c.device, revision: c.revision },
      operation: action === 'certificate_requested' ? c.issuance!.operation : null,
      outcome,
    })
  }
  function settle() {
    for (const c of records.values()) {
      const s = source(c.device)
      if (JSON.stringify(s) !== JSON.stringify(c.source)) {
        c.source = s
        c.revision++
      }
      c.evaluatedAt = now()
      const current =
        c.installed && c.source && JSON.stringify(c.installed.source) === JSON.stringify(c.source)
          ? c.installed.credential
          : null
      c.validity = !current
        ? 'unknown'
        : now() < current.notBefore
          ? 'not_yet_valid'
          : now() >= current.notAfter
            ? 'expired'
            : now() + 7 * 86400 >= current.notAfter
              ? 'expiring'
              : 'valid'
      const key = JSON.stringify([c.validity, c.installed?.credential.fingerprint, c.source]),
        previous = alertVersions.get(c.id)
      if (key === previous?.key) continue
      const version = (previous?.version ?? 0) + 1
      alertVersions.set(c.id, { key, version })
      operations.observeAlert({
        code: 'certificate_expiry',
        severity: 'high',
        target: { kind: 'certificate', id: c.id, device: c.device, revision: c.revision },
        evidence: {
          id: c.id,
          version,
          at: now(),
          state:
            c.validity === 'unknown' ? 'unknown' : c.validity === 'valid' ? 'cleared' : 'active',
        },
      })
    }
  }
  function valid(target: SecurityRequestTarget) {
    if (target.kind !== 'certificate_deploy') return false
    settle()
    const c = records.get(target.certificate),
      issued = c?.issuance?.credential
    return !!(
      c &&
      c.device === target.device &&
      c.revision === target.certificateRevision &&
      c.source &&
      c.issuance?.state === 'issued' &&
      issued?.fingerprint === target.fingerprint &&
      issued.notBefore <= now() &&
      issued.notAfter > now() &&
      c.installed?.credential.fingerprint !== issued.fingerprint
    )
  }
  const handle: DomainHandler = (request, scenario) => {
    const route =
      /^\/api\/mdm-candidate\/v1\/security\/certificates(?:\/([^/]+)(?:\/(issue))?)?$/.exec(
        request.path,
      )
    if (!route) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      seed()
      settle()
      const id = route[1] ? uuid(route[1]) : null
      if (request.method === 'GET' && !route[2]) {
        if (id) {
          queryKeys(request.query, [])
          const c = records.get(id)
          return c
            ? candidate({ certificate: structuredClone(c), asOf: now() })
            : error('operation_not_found', 404)
        }
        queryKeys(request.query, ['device', 'limit', 'cursor'])
        const device = request.query.has('device') ? identifier(request.query.get('device')) : null
        return candidate(
          pages.page(
            JSON.stringify([request.actor.principalId, device]),
            scenario === 'empty'
              ? []
              : [...records.values()].filter((c) => !device || c.device === device),
            request.query,
          ),
        )
      }
      if (request.method !== 'POST' || !id || route[2] !== 'issue')
        return error('malformed_request', 400)
      queryKeys(request.query, [])
      const op = operation(request.body)
      closed(op.input, [])
      return receipts.write(request, op.operationId, () => {
        const c = records.get(id)
        if (!c) return error('operation_not_found', 404)
        if (
          c.revision !== op.expectedRevision ||
          (c.issuance &&
            (['requested', 'unknown'].includes(c.issuance.state) ||
              (c.issuance.credential &&
                c.issuance.credential.notAfter > now() &&
                c.issuance.credential.fingerprint !== c.installed?.credential.fingerprint)))
        )
          return error('operation_conflict')
        if (!c.source || scenario === 'unsupported') return error('action_not_supported', 501)
        if (scenario === 'offline') return error('service_unavailable', 503)
        c.issuance = {
          operation: op.operationId,
          state: 'requested',
          requestedAt: now(),
          resultAt: null,
          credential: null,
        }
        c.revision++
        audit(c, 'certificate_requested', request.actor.principalId, 'accepted')
        return candidate({ certificate: structuredClone(c), asOf: now() })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    settle,
    handle,
    source,
    valid,
    observe(
      target: Extract<SecurityRequestTarget, { kind: 'certificate_deploy' }>,
      frozen: SecuritySource,
      at: number,
    ) {
      if (!valid(target)) return false
      const c = records.get(target.certificate)!
      if (
        JSON.stringify(c.source) !== JSON.stringify(frozen) ||
        at <= (c.issuance!.resultAt ?? now()) ||
        at > now()
      )
        return false
      c.installed = {
        credential: structuredClone(c.issuance!.credential!),
        observedAt: at,
        source: structuredClone(frozen),
      }
      c.revision++
      audit(c, 'certificate_observed', null, 'observed')
      settle()
      return true
    },
    tick(event: DemoEvent, scenario: Scenario) {
      settle()
      if (event.kind !== 'certificate_issued' || !event.task || scenario === 'offline') return
      const c = [...records.values()].find((c) => c.issuance?.operation === event.task),
        i = c?.issuance
      if (
        !c ||
        !i ||
        c.device !== event.device ||
        !['requested', 'unknown'].includes(i.state) ||
        event.at <= (i.resultAt ?? i.requestedAt) ||
        event.at > now()
      )
        return
      i.state =
        scenario === 'unknown'
          ? 'unknown'
          : ['partial', 'unsupported'].includes(scenario)
            ? 'failed'
            : 'issued'
      i.resultAt = event.at
      i.credential = i.state === 'issued' ? credential(c.device, event.at, 90 * 86400) : null
      c.revision++
      audit(c, 'certificate_issued', null, i.state === 'issued' ? 'observed' : i.state)
    },
    reset() {
      records.clear()
      receipts.reset()
      pages.reset()
      alertVersions.clear()
    },
  }
}
