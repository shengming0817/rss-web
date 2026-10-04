import { randomUUID } from 'node:crypto'
import type { DomainHandler, Scenario } from '../scenario'
import { closed, enumeration, identifier, record, uuid } from '../../src/services/decode'
import { createPages, createReceipts, error, operation } from '../http'
import type { createDeviceDemo } from '../devices/state'
import type { createScopeDemo } from '../policies/scopes'
import type { createResourceDemo } from '../policies/resources'
import type { createAdmissionDemo } from './admission'
import type { createSoftwarePolicyDemo } from './assignments'
import type { DemoEvent } from '../policies/schedule'
import type { ExecutionSummary } from '../../src/features/policies/clients/executions'
import {
  updateDefinition,
  updateRing,
  type UpdateDefinition,
  type UpdateDevice,
  type UpdateRing,
} from '../../src/features/software/clients/updates'
import { candidate } from './catalog'
import { nativeDue } from './schedule'
import { softwareProfiles } from './runs'
const releases = [
  {
    id: 'demo-windows-quality-1',
    platform: 'windows',
    title: 'Synthetic Windows quality update',
    version: 'demo-1',
    releasedAt: 1780000000,
    source: 'synthetic Windows update feed',
  },
  {
    id: 'demo-macos-quality-1',
    platform: 'macos',
    title: 'Synthetic macOS security update',
    version: 'demo-1',
    releasedAt: 1780000000,
    source: 'synthetic Apple update feed',
  },
] as const
const unresolved = (d: UpdateDevice) =>
  [
    'scanning',
    'queued',
    'downloading',
    'installing',
    'waiting_reboot',
    'unknown',
    'reconciling',
    'cancel_requested',
  ].includes(d.phase)
export function createUpdatesDemo(
  devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts'>,
  scopes: Pick<ReturnType<typeof createScopeDemo>, 'freeze' | 'forManagedDevices'>,
  patches?: {
    resources: Pick<ReturnType<typeof createResourceDemo>, 'read'>
    admission: Pick<ReturnType<typeof createAdmissionDemo>, 'isAdmitted'>
    software: Pick<
      ReturnType<typeof createSoftwarePolicyDemo>,
      'createManagedPolicy' | 'cancelManagedPolicy' | 'runs'
    >
  },
) {
  const rings = new Map<string, UpdateRing>(),
    receipts = createReceipts(),
    pages = createPages()
  // Historical OS attempts are retained independently from the ring's current scan.
  const history = new Map<
    string,
    { ring: string; value: UpdateDevice; delivery: 'queued' | 'received' }
  >()
  const stoppedPolicies = new Set<string>()
  let now = Math.floor(Date.now() / 1000)
  function registration(id: string, definition: UpdateDefinition) {
    const device = devices.facts().find((d) => d.summary.id === id)
    if (!device || device.summary.platform !== definition.platform) return null
    if (definition.target.kind === 'third_party') {
      const profiles = softwareProfiles(device)
      if (
        profiles.length !== 1 ||
        !profiles[0]!.capabilities.includes('software.execute.v3') ||
        !definition.target.resource.variants[
          `${profiles[0]!.platform}_${profiles[0]!.architecture}`
        ]
      )
        return null
      const p = profiles[0]!
      return { id: p.registration, generation: p.generation, source: 'agent.builtin' as const }
    }
    const rs = device.registrations.filter(
      (r) =>
        r.status === 'active' &&
        r.source === (definition.platform === 'windows' ? 'mdm.windows' : 'mdm.apple'),
    )
    if (rs.length !== 1) return null
    const r = rs[0]!
    if (
      !device.updateBindings?.some(
        (b) =>
          b.registration === r.registrationId &&
          b.generation === r.generation &&
          b.capabilities.includes('os.update.v1'),
      )
    )
      return null
    return { id: r.registrationId, generation: r.generation, source: r.source }
  }
  function available(d: UpdateDefinition) {
    if (d.target.kind === 'os')
      return releases.some(
        (r) =>
          r.id === d.target.release &&
          r.platform === d.platform &&
          r.releasedAt + d.deferDays * 86400 < d.deadline,
      )
    const t = d.target,
      v = patches?.resources.read(t.resource.id)?.versions.find((v) => v.id === t.resource.version)
    return !!(
      v?.state === 'active' &&
      patches?.admission.isAdmitted(t.resource.id, t.resource.version, t.admissionOperation) &&
      Object.entries(t.resource.variants).every(([target, key]) =>
        v.variants.some(
          (v) =>
            `${v.platform}_${v.architecture}` === target &&
            v.key === key &&
            v.declaration.kind === 'software',
        ),
      )
    )
  }
  function view(r: UpdateRing) {
    if (r.policy && patches) {
      const rows = patches.software.runs.rows().filter((v) => v.policy.id === r.policy!.id)
      for (const d of r.devices) {
        const run = rows.filter((v) => v.value.device === d.device).at(-1)?.value
        if (!run) continue
        d.execution = run.taskId
        d.attempt = run.taskId
        const s = run.state
        d.phase =
          run.effect === 'verified' &&
          run.result?.kind === 'software' &&
          run.result.detection === 'present'
            ? 'verified'
            : s.execution === 'waiting_reboot'
              ? 'waiting_reboot'
              : s.execution === 'unknown'
                ? 'unknown'
                : s.execution === 'failed'
                  ? 'failed'
                  : s.cancellation === 'confirmed' && s.execution === 'not_started'
                    ? 'cancelled'
                    : s.execution === 'running'
                      ? 'installing'
                      : 'queued'
        d.effect =
          d.phase === 'verified' ? 'verified' : d.phase === 'unknown' ? 'unknown' : 'unverified'
        if (d.phase === 'verified') {
          d.gap = 'installed'
          d.observedAt = run.result!.diagnostics.executedAt
          d.source = 'update_report'
        }
        d.waiting = d.phase === 'waiting_reboot' ? 'user' : d.phase === 'unknown' ? 'report' : null
      }
    }
    return updateRing(structuredClone(r))
  }
  function track(r: UpdateRing, d: UpdateDevice, delivery?: 'received') {
    if (r.definition.target.kind === 'os' && d.execution)
      history.set(d.execution, {
        ring: r.id,
        value: structuredClone(d),
        delivery: delivery ?? history.get(d.execution)?.delivery ?? 'queued',
      })
  }
  function stopPolicy(r: UpdateRing) {
    if (!r.policy || stoppedPolicies.has(r.policy.id)) return
    patches?.software.cancelManagedPolicy(r.policy.id)
    stoppedPolicies.add(r.policy.id)
    for (const row of r.devices) {
      if (!row.execution && row.phase === 'queued') row.phase = 'cancelled'
    }
  }
  const handle: DomainHandler = (request, scenario) => {
    const route = /^\/api\/v1\/mdm-candidate\/software\/updates(?:\/([^/]+))?$/.exec(request.path)
    if (!route) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      if (request.method === 'GET' && route[1] === 'releases')
        return candidate({ items: scenario === 'empty' ? [] : releases })
      const id = route[1] ? uuid(route[1]) : undefined,
        current = id ? rings.get(id) : undefined
      if (request.method === 'GET')
        return id
          ? current
            ? candidate({ ring: view(current) })
            : error('resource_not_found', 404)
          : candidate(
              pages.page(
                request.path,
                scenario === 'empty' ? [] : [...rings.values()].map(view),
                request.query,
              ),
            )
      if (request.method !== 'POST' || !id) return
      const op = operation(request.body)
      return receipts.write(request, op.operationId, () => {
        if (op.expectedRevision !== (current?.revision ?? 0)) return error('operation_conflict')
        const input = record(op.input),
          action = enumeration(input['action'], [
            'put',
            'scan',
            'install',
            'pause',
            'resume',
            'retry',
            'reconcile',
          ] as const)
        closed(
          input,
          action === 'put'
            ? ['action', 'definition']
            : ['retry', 'reconcile'].includes(action)
              ? ['action', 'device']
              : ['action'],
        )
        if (current) view(current)
        if (action === 'put') {
          const definition = updateDefinition(input['definition'])
          if (
            current?.devices.some(unresolved) ||
            !scopes.freeze(definition.scope) ||
            !available(definition) ||
            definition.deadline <= now
          )
            return error('operation_conflict')
          if (current?.policy) stopPolicy(current)
          const next = {
            id,
            revision: op.expectedRevision + 1,
            operation: op.operationId,
            definition,
            scopeRevision: null,
            devices: [],
            policy: null,
          }
          rings.set(id, next)
          return candidate({ ring: next })
        }
        if (!current) return error('resource_not_found', 404)
        const r = current,
          d = r.definition
        if (action === 'scan') {
          const scope = scopes.freeze(d.scope)
          if (r.devices.some(unresolved) || !scope || !available(d))
            return error('operation_conflict')
          if (r.policy) stopPolicy(r)
          r.policy = null
          r.scopeRevision = scope.revision
          r.devices = scope.members.map((device) => {
            const reg = scenario === 'unsupported' ? null : registration(device, d)
            return {
              device,
              registration: reg,
              gap: 'unknown',
              observedAt: null,
              source: 'unavailable',
              phase: reg ? 'scanning' : 'unsupported',
              effect: 'unverified',
              attempt: null,
              execution: null,
              notifiedAt: null,
              rebootRequestedAt: null,
              code: reg ? null : 'unsupported_update_channel',
              waiting: reg ? 'report' : null,
            }
          })
        } else if (action === 'pause') {
          d.enabled = false
          if (r.policy) stopPolicy(r)
          else
            for (const row of r.devices) {
              if (row.phase === 'queued') row.phase = 'cancelled'
              else if (['downloading', 'installing'].includes(row.phase))
                row.phase = 'cancel_requested'
              track(r, row)
            }
        } else if (action === 'resume') {
          if (!available(d) || d.deadline <= now) return error('operation_conflict')
          d.enabled = true // Resuming does not replay cancelled or unknown installations.
        } else if (action === 'install' || action === 'retry') {
          const scope = scopes.freeze(d.scope),
            target = action === 'retry' ? identifier(input['device']) : null
          if (
            !d.enabled ||
            !scope ||
            !available(d) ||
            d.deadline <= now ||
            r.policy ||
            r.devices.some((row) => unresolved(row) && row.phase !== 'scanning')
          )
            return error('operation_conflict')
          const rows = r.devices.filter(
            (row) =>
              (!target || row.device === target) &&
              row.gap === 'missing' &&
              (target ? row.phase === 'failed' : ['idle', 'cancelled'].includes(row.phase)),
          )
          if (
            !rows.length ||
            rows.some(
              (row) =>
                row.observedAt === null ||
                now - row.observedAt > 86400 ||
                !scope.members.includes(row.device) ||
                JSON.stringify(registration(row.device, d)) !== JSON.stringify(row.registration),
            )
          )
            return error('operation_conflict')
          if (d.target.kind === 'third_party') {
            const t = d.target
            r.policy = scopes.forManagedDevices(
              rows.map((row) => row.device),
              (scope) =>
                patches!.software.createManagedPolicy({
                  resource: t.resource,
                  scope,
                  behavior: {
                    kind: 'software',
                    intent: 'required_install',
                    admissionOperation: t.admissionOperation,
                    schedule: {
                      trigger: { kind: 'check_in', minimumSeconds: 60 },
                      misfire: { kind: 'coalesce_one' },
                      notBefore: now + d.deferDays * 86400,
                      until: d.deadline,
                      jitterSeconds: 0,
                      window: d.window,
                    },
                    runLifetimeSeconds: 3600,
                    rollout: { stages: [{ scope, opensAt: now, minimumVerifiedPercent: null }] },
                  },
                }),
            )
          }
          for (const row of rows) {
            row.phase = 'queued'
            row.effect = 'unverified'
            row.code = null
            row.waiting = d.notifyMinutes ? 'notification' : null
            row.rebootRequestedAt = null
            row.attempt = randomUUID()
            row.execution = d.target.kind === 'os' ? randomUUID() : null
            row.notifiedAt = d.target.kind === 'os' ? now : null
            track(r, row)
          }
        } else {
          const row = r.devices.find((row) => row.device === identifier(input['device']))
          if (!row || row.phase !== 'unknown' || r.policy) return error('operation_conflict')
          row.phase = 'reconciling'
          row.waiting = 'report'
          track(r, row)
        }
        r.revision++
        r.operation = op.operationId
        return candidate({ ring: view(r) })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    references: (id: string, version: string) =>
      [...rings.values()].some(
        (r) =>
          r.definition.target.kind === 'third_party' &&
          r.definition.target.resource.id === id &&
          r.definition.target.resource.version === version,
      ),
    tick(event: DemoEvent, scenario: Scenario) {
      if (event.at < now) return
      now = event.at
      // Recheck the original ring authority before the native Agent run owner advances.
      for (const r of rings.values()) {
        if (!r.policy) continue
        const scope = scopes.freeze(r.definition.scope)
        if (
          !r.definition.enabled ||
          !available(r.definition) ||
          !scope ||
          r.devices.some(
            (row) => (row.attempt || row.execution) && !scope.members.includes(row.device),
          )
        )
          stopPolicy(r)
      }
      for (const r of rings.values())
        for (const row of r.devices) {
          if (
            r.policy ||
            !unresolved(row) ||
            (event.kind !== 'clock' && row.device !== event.device)
          )
            continue
          const d = r.definition,
            reg = registration(row.device, d)
          if (JSON.stringify(reg) !== JSON.stringify(row.registration)) {
            row.phase = ['scanning', 'queued'].includes(row.phase) ? 'failed' : 'unknown'
            row.effect = row.phase === 'unknown' ? 'unknown' : 'unverified'
            row.code = 'registration_changed'
            row.waiting = 'authorization'
            track(r, row)
            continue
          }
          if (event.kind === 'clock') {
            if (now >= d.deadline && row.phase === 'queued') {
              row.phase = 'failed'
              row.code = 'deadline_elapsed'
              row.waiting = 'deadline'
              track(r, row)
            }
            continue
          }
          if (event.kind !== 'check_in' && event.kind !== 'software_reboot') continue
          if (scenario === 'offline') {
            row.waiting = 'offline'
            continue
          }
          if (row.phase === 'scanning' && event.kind === 'check_in') {
            // Explicit synthetic update-service reports; inventory OS versions are never consulted.
            row.gap =
              scenario === 'unknown'
                ? 'unknown'
                : Number(row.device.slice(-2)) % 7 === 0
                  ? 'installed'
                  : 'missing'
            row.observedAt = now
            row.source = 'update_report'
            row.phase = 'idle'
            row.waiting = null
          } else if (row.phase === 'reconciling' && event.kind === 'check_in') {
            if (scenario === 'unknown' || scenario === 'partial') {
              row.phase = 'unknown'
              row.effect = 'unknown'
            } else {
              row.phase = 'verified'
              row.effect = 'verified'
              row.gap = 'installed'
              row.observedAt = now
              row.source = 'update_report'
              row.waiting = null
              row.code = null
            }
          } else if (row.phase === 'cancel_requested') {
            row.phase = 'unknown'
            row.effect = 'unknown'
            row.waiting = 'report'
          } else if (row.phase === 'queued' && event.kind === 'check_in') {
            if (
              !d.enabled ||
              !available(d) ||
              !scopes.freeze(d.scope)?.members.includes(row.device)
            ) {
              row.phase = 'failed'
              row.code = 'authorization_changed'
              row.waiting = 'authorization'
            } else if (now >= d.deadline) {
              row.phase = 'failed'
              row.code = 'deadline_elapsed'
              row.waiting = 'deadline'
            } else {
              const release =
                d.target.kind === 'os' ? releases.find((v) => v.id === d.target.release) : null
              const start = Math.max(
                (release?.releasedAt ?? row.notifiedAt!) + d.deferDays * 86400,
                (row.notifiedAt ?? 0) + d.notifyMinutes * 60,
              )
              const occurrence = nativeDue(
                {
                  trigger: { kind: 'check_in', minimumSeconds: 60 },
                  misfire: { kind: 'coalesce_one' },
                  notBefore: start,
                  until: d.deadline,
                  jitterSeconds: 0,
                  window: d.window,
                },
                now,
                row.device,
              )
              if (!occurrence || occurrence.availableAt > now)
                row.waiting =
                  now < start
                    ? d.notifyMinutes && now < (row.notifiedAt ?? 0) + d.notifyMinutes * 60
                      ? 'notification'
                      : 'deferral'
                    : 'maintenance'
              else {
                row.phase = 'downloading'
                row.waiting = null
                track(r, row, 'received')
              }
            }
          } else if (row.phase === 'downloading' && event.kind === 'check_in')
            row.phase = 'installing'
          else if (row.phase === 'installing' && event.kind === 'check_in') {
            row.phase =
              scenario === 'unknown'
                ? 'unknown'
                : scenario === 'partial'
                  ? 'failed'
                  : 'waiting_reboot'
            row.effect = row.phase === 'unknown' ? 'unknown' : 'unverified'
            row.code = row.phase === 'failed' ? 'synthetic_install_failure' : null
            row.waiting =
              row.phase === 'waiting_reboot' ? 'user' : row.phase === 'unknown' ? 'report' : null
          } else if (
            row.phase === 'waiting_reboot' &&
            d.reboot === 'maintenance' &&
            event.kind === 'check_in'
          ) {
            const slot = nativeDue(
              {
                trigger: { kind: 'check_in', minimumSeconds: 60 },
                misfire: { kind: 'coalesce_one' },
                notBefore: 0,
                until: null,
                jitterSeconds: 0,
                window: d.window,
              },
              now,
              row.device,
            )
            if (
              d.enabled &&
              available(d) &&
              scopes.freeze(d.scope)?.members.includes(row.device) &&
              slot &&
              slot.availableAt <= now
            ) {
              row.rebootRequestedAt ??= now
              row.waiting = 'report'
            } else row.waiting = 'maintenance'
          } else if (row.phase === 'waiting_reboot' && event.kind === 'software_reboot') {
            // This event is an independent post-reboot report, not an administrative reboot ACK.
            if (scenario === 'unknown') {
              row.phase = 'unknown'
              row.effect = 'unknown'
              row.waiting = 'report'
            } else {
              row.phase = 'verified'
              row.effect = 'verified'
              row.gap = 'installed'
              row.source = 'update_report'
              row.observedAt = now
              row.waiting = null
            }
          }
          track(r, row)
        }
    },
    executions(): ExecutionSummary[] {
      return [...history.entries()].map(([id, { ring, value: d, delivery }]) => ({
        id,
        batch: null,
        device: d.device,
        origin: { kind: 'update', ring },
        admission: 'accepted',
        dispatch: delivery === 'received' ? 'published' : 'queued',
        receipt: delivery === 'received' ? 'received' : 'not_received',
        execution:
          d.phase === 'verified'
            ? 'succeeded'
            : d.phase === 'failed'
              ? 'failed'
              : d.phase === 'cancelled'
                ? 'cancelled'
                : d.phase === 'queued'
                  ? 'not_started'
                  : d.phase === 'waiting_reboot'
                    ? 'waiting_reboot'
                    : ['unknown', 'reconciling', 'cancel_requested'].includes(d.phase)
                      ? 'unknown'
                      : 'running',
        effect:
          d.effect === 'verified'
            ? 'verified_present'
            : d.effect === 'unknown'
              ? 'unknown'
              : 'unverified',
        compliance: 'unknown',
        attempt: d.attempt,
        nativeCode: d.code,
        waitingReason:
          d.waiting === 'offline'
            ? 'offline'
            : d.waiting === 'maintenance'
              ? 'maintenance_window'
              : d.waiting === 'user'
                ? 'reboot'
                : d.waiting === 'report'
                  ? 'effect_verification'
                  : d.waiting === 'authorization'
                    ? 'authorization'
                    : d.waiting
                      ? 'trigger'
                      : null,
      }))
    },
    reset() {
      rings.clear()
      history.clear()
      stoppedPolicies.clear()
      receipts.reset()
      pages.reset()
      now = Math.floor(Date.now() / 1000)
    },
  }
}
