import { createExperienceDemo } from './experience'
import { randomUUID } from 'node:crypto'
import type { DomainHandler, Scenario } from '../scenario'
import type { DemoEvent } from '../policies/schedule'
import type { createDeviceDemo } from '../devices/state'
import type { createOperationsDemo } from '../operations/state'
import type { createSecurityRequests } from './requests'
import type {
  SecurityRequest,
  SecurityRequestTarget,
} from '../../src/features/security/clients/requests-model'
import type { SecuritySource } from '../../src/features/security/clients/source'
import {
  isSupportTarget,
  supportContext,
  supportRecord,
  type SupportContext,
  type SupportRecord,
  type SupportTarget,
} from '../../src/features/security/clients/support-model'
import { identifier, uuid } from '../../src/services/decode'
import { error } from '../http'
import { candidate, queryKeys } from './http'
export function createSupportDemo(
  now: () => number,
  devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts'>,
  requests: Pick<ReturnType<typeof createSecurityRequests>, 'rows'>,
  operations: ReturnType<typeof createOperationsDemo>,
) {
  const contexts = new Map<string, SupportContext>(),
    records = new Map<string, SupportRecord>()
  function context(device: string) {
    const d = devices.facts().find((d) => d.summary.id === device)
    if (!d) return null
    const active = d.registrations.filter(
        (r) => r.source === 'agent.builtin' && r.status === 'active',
      ),
      r = active.length === 1 ? active[0] : undefined,
      source: SecuritySource | null = r
        ? { registrationId: r.registrationId, generation: r.generation, source: 'agent.builtin' }
        : null,
      caps =
        d.securityBindings?.find(
          (b) => b.registration === r?.registrationId && b.generation === r?.generation,
        )?.capabilities ?? [],
      capabilities = {
        elevation: !!source && caps.includes('support.elevation.v1'),
        diagnostics: !!source && caps.includes('support.diagnostics.v1'),
        remoteModes: source
          ? (['view', 'control'] as const).filter((mode) =>
              caps.includes(`support.remote.${mode}.v1`),
            )
          : [],
      },
      old = contexts.get(device)
    const c = supportContext({
      device,
      revision: old?.revision ?? 1,
      platform: d.summary.platform,
      source,
      capabilities,
      accounts: old?.accounts ?? [
        { id: `synthetic-user-${device}`, name: 'Synthetic device user' },
      ],
      programs: old?.programs ?? [
        {
          id: randomUUID(),
          name: 'Synthetic support utility',
          path:
            d.summary.platform === 'windows'
              ? 'C:/Synthetic/SupportUtility.exe'
              : '/Applications/SyntheticSupport.app',
          sha256: 'a'.repeat(64),
          publisher: 'RSS synthetic publisher',
        },
      ],
      evaluatedAt: now(),
    })
    if (
      old &&
      JSON.stringify([old.source, old.capabilities]) !== JSON.stringify([c.source, c.capabilities])
    )
      c.revision++
    contexts.set(device, c)
    return structuredClone(c)
  }
  function valid(target: SecurityRequestTarget) {
    if (!isSupportTarget(target)) return false
    const c = context(target.device)
    if (!c?.source || c.revision !== target.contextRevision) return false
    if (target.kind === 'elevation')
      return (
        c.capabilities.elevation &&
        c.accounts.some((a) => a.id === target.account) &&
        c.programs.some((p) => JSON.stringify(p) === JSON.stringify(target.program))
      )
    return target.kind === 'diagnostics'
      ? c.capabilities.diagnostics
      : c.capabilities.remoteModes.includes(target.mode)
  }
  const request = (id: string) => requests.rows().find((r) => r.id === id)
  const authorized = (r: SecurityRequest) =>
    r.state === 'approved' && r.validFrom <= now() && r.validUntil > now() && valid(r.target)
  function ensure(r: SecurityRequest) {
    if (!isSupportTarget(r.target)) return null
    const old = records.get(r.id)
    if (old) return old
    const target = r.target,
      c = context(target.device),
      source = c?.revision === target.contextRevision ? c.source : null,
      details =
        target.kind === 'elevation'
          ? {
              kind: target.kind,
              grant: { state: 'not_requested', observedAt: null },
              usage: { state: 'not_observed', startedAt: null, endedAt: null },
            }
          : target.kind === 'diagnostics'
            ? {
                kind: target.kind,
                state: 'not_collected',
                collection: null,
                uploadedAt: null,
                scan: { state: 'not_scanned', at: null },
                availableUntil: null,
              }
            : {
                kind: target.kind,
                attempt: r.id,
                helper: r.requester,
                mode: target.mode,
                consent: { state: 'not_requested', at: null, validUntil: null },
                session: { state: 'not_started', startedAt: null, endedAt: null },
              },
      value = supportRecord({
        request: r.id,
        requester: r.requester,
        target,
        source,
        action: null,
        details,
      })
    records.set(r.id, value)
    return value
  }
  function projection(r: SecurityRequest) {
    const raw = ensure(r)
    if (!raw) return null
    const value = structuredClone(raw),
      d = value.details,
      allowed = authorized(r),
      same = JSON.stringify(context(r.target.device)?.source) === JSON.stringify(value.source)
    if (d.kind === 'elevation') {
      if ((!allowed || !same) && d.grant.state === 'available') d.grant.state = 'unknown'
      if ((!allowed || !same) && d.usage.state === 'started') d.usage.state = 'unknown'
    } else if (d.kind === 'remote_support') {
      if (!same) d.consent.state = 'unavailable'
      else if (
        !allowed &&
        (['pending', 'granted'].includes(d.consent.state) ||
          (d.consent.state === 'not_requested' && r.decision?.value === 'approved'))
      )
        d.consent.state = r.state === 'revoked' ? 'revoked' : 'expired'
      else if (allowed && d.consent.state === 'not_requested') d.consent.state = 'pending'
      if (d.consent.state === 'granted' && now() >= (d.consent.validUntil ?? 0))
        d.consent.state = 'expired'
      if ((!allowed || !same || d.consent.state !== 'granted') && d.session.state === 'active')
        d.session.state = 'unknown'
    } else if (d.collection && now() >= (d.availableUntil ?? 0)) d.state = 'expired'
    return value
  }
  function audit(
    value: SupportRecord,
    action: 'support_consent' | 'support_observed',
    outcome: 'observed' | 'denied' | 'unknown',
  ) {
    operations.record({
      at: now(),
      actor: null,
      action,
      target: {
        kind: 'security_request',
        id: value.request,
        device: value.target.device,
        revision: null,
      },
      operation: null,
      outcome,
    })
  }
  function executionAllowed(id: string) {
    const r = request(id),
      value = r ? projection(r) : null
    return !!(
      r &&
      value &&
      authorized(r) &&
      (value.details.kind !== 'remote_support' || value.details.consent.state === 'granted')
    )
  }
  const experiences = createExperienceDemo(now, (device) => {
    const c = context(device)
    if (!c) return undefined
    const d = devices.facts().find((d) => d.summary.id === device)
    return c.source &&
      d?.securityBindings?.some(
        (b) =>
          b.registration === c.source!.registrationId &&
          b.generation === c.source!.generation &&
          b.capabilities.includes('support.experience.v1'),
      )
      ? c.source
      : null
  })
  const handle: DomainHandler = (req, scenario) => {
    const metrics = experiences.handle(req, scenario)
    if (metrics) return metrics
    const route = /^\/api\/mdm-candidate\/v1\/security\/support\/(devices|requests)\/([^/]+)$/.exec(
      req.path,
    )
    if (!route) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      queryKeys(req.query, [])
      if (req.method !== 'GET') return error('malformed_request', 400)
      if (route[1] === 'devices') {
        const c = context(identifier(route[2]))
        return c ? candidate({ context: c, asOf: now() }) : error('device_not_found', 404)
      }
      const r = request(uuid(route[2])),
        value = r ? projection(r) : null
      return value ? candidate({ support: value, asOf: now() }) : error('operation_not_found', 404)
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    valid,
    executionAllowed,
    occupied(id: string) {
      const r = request(id),
        d = r ? projection(r)?.details : null
      return d?.kind === 'elevation'
        ? ['available', 'unknown'].includes(d.grant.state) ||
            ['started', 'unknown'].includes(d.usage.state)
        : d?.kind === 'remote_support'
          ? ['active', 'unknown'].includes(d.session.state)
          : false
    },
    source: (target: SupportTarget) =>
      valid(target) ? (context(target.device)?.source ?? null) : null,
    attach(r: SecurityRequest, action: string, source: SecuritySource) {
      const value = ensure(r)
      if (value) {
        value.action = action
        value.source = structuredClone(source)
      }
    },
    effect(id: string) {
      const r = request(id),
        d = r ? projection(r)?.details : null
      if (!d) return null
      if (d.kind === 'elevation')
        return d.grant.state === 'revoked'
          ? { state: 'verified_absent' as const, at: d.grant.observedAt }
          : d.grant.state === 'unknown'
            ? { state: 'unknown' as const, at: null }
            : null
      if (d.kind === 'remote_support')
        return d.session.state === 'ended'
          ? { state: 'verified_absent' as const, at: d.session.endedAt }
          : d.session.state === 'unknown'
            ? { state: 'unknown' as const, at: null }
            : null
      return null
    },
    observe(id: string, source: SecuritySource, at: number) {
      const r = request(id),
        value = r ? ensure(r) : null
      if (
        !r ||
        !value ||
        !executionAllowed(id) ||
        !value.action ||
        at > now() ||
        JSON.stringify(value.source) !== JSON.stringify(source)
      )
        return false
      const d = value.details
      if (d.kind === 'elevation') {
        if (d.grant.observedAt !== null) return false
        d.grant = { state: 'available', observedAt: at }
      } else if (d.kind === 'remote_support') {
        if (d.session.startedAt !== null || at <= (d.consent.at ?? now())) return false
        d.session = { state: 'active', startedAt: at, endedAt: null }
      } else {
        if (d.collection || value.target.kind !== 'diagnostics') return false
        d.collection = {
          at,
          artifacts: value.target.artifacts.map((kind) => ({ kind, records: 5, bytes: 1024 })),
        }
        d.availableUntil = at + value.target.retentionSeconds
        d.state = 'collected'
      }
      audit(value, 'support_observed', 'observed')
      return true
    },
    tick(event: DemoEvent, scenario: Scenario) {
      if (!event.task || scenario === 'offline') return false
      const consentEvent = ['remote_consent', 'remote_revoke'].includes(event.kind),
        r = consentEvent
          ? request(event.task)
          : request([...records.values()].find((v) => v.action === event.task)?.request ?? ''),
        value = r ? ensure(r) : null
      if (
        !r ||
        !value ||
        value.target.device !== event.device ||
        event.at > now() ||
        event.at <= r.createdAt ||
        JSON.stringify(context(value.target.device)?.source) !== JSON.stringify(value.source) ||
        !value.source
      )
        return false
      const d = value.details
      if (d.kind === 'remote_support') {
        if (
          event.kind === 'remote_consent' &&
          authorized(r) &&
          event.at >= Math.max(r.validFrom, r.decision?.at ?? now()) &&
          d.consent.state === 'not_requested' &&
          typeof event.active === 'boolean'
        ) {
          d.consent = {
            state: event.active ? 'granted' : 'denied',
            at: event.at,
            validUntil: event.active ? Math.min(r.validUntil, event.at + 300) : null,
          }
          audit(value, 'support_consent', event.active ? 'observed' : 'denied')
          return true
        } else if (
          event.kind === 'remote_revoke' &&
          d.consent.state === 'granted' &&
          event.at > (d.consent.at ?? now())
        ) {
          d.consent = { ...d.consent, state: 'revoked', at: event.at }
          audit(value, 'support_consent', 'observed')
          return true
        } else if (
          event.kind === 'remote_ended' &&
          d.session.startedAt !== null &&
          d.session.endedAt === null &&
          event.at > Math.max(d.session.startedAt, d.consent.at ?? 0) &&
          scenario === 'normal'
        ) {
          d.session.state = 'ended'
          d.session.endedAt = event.at
          audit(value, 'support_observed', 'observed')
        }
      } else if (d.kind === 'elevation') {
        if (
          event.kind === 'elevation_used' &&
          authorized(r) &&
          d.grant.state === 'available' &&
          d.usage.state === 'not_observed' &&
          event.at > (d.grant.observedAt ?? now()) &&
          scenario === 'normal'
        ) {
          d.usage = { state: 'started', startedAt: event.at, endedAt: null }
          audit(value, 'support_observed', 'observed')
        } else if (
          event.kind === 'elevation_revoked' &&
          d.grant.state === 'available' &&
          event.at > (d.grant.observedAt ?? now()) &&
          scenario === 'normal'
        ) {
          d.grant = { state: 'revoked', observedAt: event.at }
          audit(value, 'support_observed', 'observed')
        } else if (
          event.kind === 'elevation_ended' &&
          d.usage.startedAt !== null &&
          d.usage.endedAt === null &&
          event.at > d.usage.startedAt &&
          scenario === 'normal'
        ) {
          d.usage.state = 'ended'
          d.usage.endedAt = event.at
          audit(value, 'support_observed', 'observed')
        }
      } else if (d.collection && event.at < (d.availableUntil ?? 0)) {
        if (
          event.kind === 'diagnostic_uploaded' &&
          d.uploadedAt === null &&
          event.at > d.collection.at &&
          scenario === 'normal'
        ) {
          d.uploadedAt = event.at
          d.state = 'uploaded'
          audit(value, 'support_observed', 'observed')
        } else if (
          event.kind === 'diagnostic_scanned' &&
          d.uploadedAt !== null &&
          event.at > Math.max(d.uploadedAt, d.scan.at ?? 0) &&
          ['not_scanned', 'unknown'].includes(d.scan.state)
        ) {
          const state = ['unknown', 'unsupported'].includes(scenario)
            ? 'unknown'
            : scenario === 'partial'
              ? 'blocked'
              : 'clean'
          d.scan = { state, at: event.at }
          d.state = state === 'clean' ? 'ready' : state
          audit(value, 'support_observed', state === 'unknown' ? 'unknown' : 'observed')
        }
      }
      return false
    },
    reset() {
      experiences.reset()
      contexts.clear()
      records.clear()
    },
  }
}
