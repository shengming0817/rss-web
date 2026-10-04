import type { DomainHandler, Scenario } from '../scenario'
import type { DemoEvent } from '../policies/schedule'
import type { createDeviceDemo } from '../devices/state'
import type { createOperationsDemo } from '../operations/state'
import type { createSecurityRequests } from './requests'
import type { createRisksDemo } from './risks'
import type { createMaterialsDemo } from './materials'
import type { createCertificatesDemo } from './certificates'
import type { createSupportDemo } from './support'
import { isSupportTarget } from '../../src/features/security/clients/support-model'
import type { MaterialKind } from '../../src/features/security/clients/materials-model'
import { closed, identifier, uuid } from '../../src/services/decode'
import {
  securityAction,
  type SecurityAction,
} from '../../src/features/security/clients/actions-model'
import { createReceipts, error, operation } from '../http'
import { candidate, createSecurityPages, queryKeys } from './http'
import { remediationSource } from './source'
export function createSecurityActions(
  now: () => number,
  devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts'>,
  requests: Pick<ReturnType<typeof createSecurityRequests>, 'rows'>,
  risks: ReturnType<typeof createRisksDemo>,
  materials: ReturnType<typeof createMaterialsDemo>,
  certificates: ReturnType<typeof createCertificatesDemo>,
  support: ReturnType<typeof createSupportDemo>,
  operations: ReturnType<typeof createOperationsDemo>,
) {
  const actions = new Map<string, SecurityAction>(),
    receipts = createReceipts(),
    pages = createSecurityPages(now)
  const currentRequest = (id: string) => requests.rows().find((r) => r.id === id)
  const source = (target: SecurityAction['target']) =>
    target.kind === 'risk_remediation'
      ? remediationSource(devices.facts().find((d) => d.summary.id === target.device))
      : target.kind === 'certificate_deploy'
        ? certificates.source(target.device)
        : isSupportTarget(target)
          ? support.source(target)
          : materials.source(target.device, target.material)
  const valid = (target: SecurityAction['target']) =>
    target.kind === 'risk_remediation'
      ? risks.valid(target)
      : target.kind === 'certificate_deploy'
        ? certificates.valid(target)
        : isSupportTarget(target)
          ? support.valid(target)
          : materials.valid(target)
  const targetKey = (target: SecurityAction['target']) =>
    JSON.stringify(
      target.kind === 'risk_remediation'
        ? [target.kind, target.device, target.risk]
        : target.kind === 'certificate_deploy'
          ? [target.kind, target.device, target.certificate]
          : isSupportTarget(target)
            ? [target.kind, target.device, target.kind === 'elevation' ? target.account : null]
            : [target.kind, target.device, target.material, target.volume],
    )
  const targetDetection = (kind: SecurityAction['target']['kind']) =>
    kind === 'certificate_deploy'
      ? 'certificate_detect'
      : kind === 'material_operation'
        ? 'material_detect'
        : 'support_detect'
  function audit(
    value: SecurityAction,
    action: 'security_dispatched' | 'security_result' | 'security_detected',
    actor: string | null,
    outcome: 'accepted' | 'observed' | 'failed' | 'unknown',
  ) {
    operations.record({
      at: now(),
      actor,
      action,
      target: {
        kind: 'security_action',
        id: value.id,
        revision: value.revision,
        device: value.target.device,
      },
      operation: action === 'security_dispatched' ? value.operation : null,
      outcome,
    })
  }
  function settle() {
    for (const a of actions.values()) {
      const s = a.summary
      const supportTarget = isSupportTarget(a.target),
        observedEffect = supportTarget && a.detectedAt !== null ? support.effect(a.request) : null
      if (observedEffect && observedEffect.state !== s.effect) {
        s.effect = observedEffect.state
        if (observedEffect.at !== null) a.detectedAt = observedEffect.at
        s.waitingReason = observedEffect.state === 'unknown' ? 'effect_verification' : null
        a.revision++
        audit(
          a,
          'security_detected',
          null,
          observedEffect.state === 'unknown' ? 'unknown' : 'observed',
        )
      }
      if (
        ['failed', 'cancelled'].includes(s.execution) ||
        s.effect === 'verified_absent' ||
        (!supportTarget && s.effect === 'verified_present')
      )
        continue
      const r = currentRequest(a.request),
        queued = s.execution === 'not_started',
        changed = JSON.stringify(source(a.target)) !== JSON.stringify(a.source),
        reason = changed
          ? 'source_registration_changed'
          : queued &&
              (!r ||
                r.state !== 'approved' ||
                now() < r.validFrom ||
                now() >= a.deadline ||
                !valid(a.target) ||
                (supportTarget && !support.executionAllowed(a.request)))
            ? 'authorization_changed'
            : null
      if (!reason || s.nativeCode === reason) continue
      s.execution = queued ? 'failed' : 'unknown'
      s.effect = queued ? 'unverified' : 'unknown'
      s.nativeCode = reason
      s.waitingReason = queued ? null : 'effect_verification'
      a.revision++
      audit(a, 'security_result', null, queued ? 'failed' : 'unknown')
    }
  }
  const handle: DomainHandler = (request, scenario) => {
    const dispatch = /^\/api\/v1\/mdm-candidate\/security\/requests\/([^/]+)\/dispatch$/.exec(
        request.path,
      ),
      route = /^\/api\/v1\/mdm-candidate\/security\/actions(?:\/([^/]+))?$/.exec(request.path)
    if (!dispatch && !route) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      settle()
      if (route && request.method === 'GET') {
        if (route[1]) {
          queryKeys(request.query, [])
          const a = actions.get(uuid(route[1]))
          return a
            ? candidate({ action: structuredClone(a), asOf: now() })
            : error('operation_not_found', 404)
        }
        queryKeys(request.query, ['device', 'request', 'limit', 'cursor'])
        const device = request.query.has('device') ? identifier(request.query.get('device')) : null,
          id = request.query.has('request') ? uuid(request.query.get('request')) : null
        return candidate(
          pages.page(
            JSON.stringify([request.actor.principalId, device, id]),
            scenario === 'empty'
              ? []
              : [...actions.values()]
                  .reverse()
                  .filter(
                    (a) => (!device || a.target.device === device) && (!id || a.request === id),
                  ),
            request.query,
          ),
        )
      }
      if (!dispatch || request.method !== 'POST') return error('malformed_request', 400)
      queryKeys(request.query, [])
      const id = uuid(dispatch[1]),
        op = operation(request.body)
      closed(op.input, [])
      return receipts.write(request, op.operationId, () => {
        const r = currentRequest(id)
        if (!r) return error('operation_not_found', 404)
        if (r.requester !== request.actor.principalId) return error('permission_denied', 403)
        if (
          r.revision !== op.expectedRevision ||
          r.state !== 'approved' ||
          r.validFrom > now() ||
          r.validUntil <= now() ||
          (r.target.kind !== 'risk_remediation' &&
            r.target.kind !== 'material_operation' &&
            r.target.kind !== 'certificate_deploy' &&
            !isSupportTarget(r.target)) ||
          !valid(r.target) ||
          (isSupportTarget(r.target) && !support.executionAllowed(r.id))
        )
          return error('operation_conflict')
        const target = r.target,
          identity = source(target)
        if (!identity || scenario === 'unsupported') return error('action_not_supported', 501)
        if (scenario === 'offline') return error('service_unavailable', 503)
        if (
          [...actions.values()].some(
            (a) =>
              a.request === id ||
              (targetKey(a.target) === targetKey(target) &&
                !['failed', 'cancelled'].includes(a.summary.execution) &&
                (isSupportTarget(a.target)
                  ? support.occupied(a.request) ||
                    !['verified_present', 'verified_absent'].includes(a.summary.effect)
                  : a.summary.effect !== 'verified_present')),
          )
        )
          return error('operation_conflict')
        const a = securityAction({
          id: op.operationId,
          revision: 1,
          operation: op.operationId,
          request: id,
          target: r.target,
          source: identity,
          createdAt: now(),
          deadline: Math.min(r.validUntil, now() + 3600),
          resultAt: null,
          detectedAt: null,
          summary: {
            id: op.operationId,
            batch: null,
            device: r.target.device,
            origin: { kind: 'security', request: id },
            admission: 'accepted',
            dispatch: 'queued',
            receipt: 'not_received',
            execution: 'not_started',
            effect: 'unverified',
            compliance: 'unknown',
            attempt: op.operationId,
            nativeCode: null,
            waitingReason: 'device_receipt',
          },
        })
        actions.set(a.id, a)
        if (isSupportTarget(a.target)) support.attach(r, a.id, a.source)
        audit(a, 'security_dispatched', request.actor.principalId, 'accepted')
        return candidate({ action: structuredClone(a), asOf: now() })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    settle,
    handle,
    tick(event: DemoEvent, scenario: Scenario) {
      settle()
      if (
        ![
          'security_result',
          'security_detect',
          'material_detect',
          'certificate_detect',
          'support_detect',
        ].includes(event.kind) ||
        !event.task
      )
        return
      const a = actions.get(event.task)
      if (
        !a ||
        a.target.device !== event.device ||
        event.at <= a.createdAt ||
        event.at > now() ||
        JSON.stringify(source(a.target)) !== JSON.stringify(a.source) ||
        scenario === 'offline'
      )
        return
      const s = a.summary
      if (event.kind === 'security_result' && s.execution === 'not_started') {
        a.resultAt = event.at
        s.dispatch = 'published'
        s.receipt = scenario === 'unknown' ? 'unknown' : 'received'
        s.execution =
          scenario === 'unknown' ? 'unknown' : scenario === 'partial' ? 'failed' : 'succeeded'
        s.effect =
          scenario === 'unknown' ? 'unknown' : scenario === 'partial' ? 'failed' : 'unverified'
        s.nativeCode = scenario === 'partial' ? 'synthetic_command_failure' : null
        s.waitingReason = scenario === 'partial' ? null : 'effect_verification'
        a.revision++
        audit(
          a,
          'security_result',
          null,
          s.execution === 'unknown' ? 'unknown' : s.execution === 'failed' ? 'failed' : 'observed',
        )
      } else if (
        (a.target.kind === 'risk_remediation'
          ? event.kind === 'security_detect'
          : targetDetection(a.target.kind) === event.kind) &&
        a.resultAt !== null &&
        event.at > a.resultAt &&
        a.detectedAt === null &&
        ['succeeded', 'unknown'].includes(s.execution) &&
        !['partial', 'unknown', 'unsupported'].includes(scenario) &&
        (a.target.kind === 'risk_remediation'
          ? risks.observe(a.target, a.source, event.at)
          : a.target.kind === 'certificate_deploy'
            ? certificates.observe(a.target, a.source, event.at)
            : isSupportTarget(a.target)
              ? support.observe(a.request, a.source, event.at)
              : materials.observe(a.target, a.source, event.at))
      ) {
        s.effect = 'verified_present'
        a.detectedAt = event.at
        s.waitingReason = null
        a.revision++
        audit(a, 'security_detected', null, 'observed')
      }
    },
    executions() {
      settle()
      return structuredClone([...actions.values()].map((a) => a.summary))
    },
    blocksDisclosure(device: string, kind: MaterialKind) {
      return [...actions.values()].some(
        (a) =>
          a.target.kind === 'material_operation' &&
          a.target.device === device &&
          a.target.material === kind &&
          !['failed', 'cancelled'].includes(a.summary.execution) &&
          a.summary.effect !== 'verified_present',
      )
    },
    reset() {
      actions.clear()
      receipts.reset()
      pages.reset()
    },
  }
}
