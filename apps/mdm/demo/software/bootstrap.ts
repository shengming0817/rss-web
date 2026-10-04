import { randomUUID } from 'node:crypto'
import type { DomainHandler, Scenario } from '../scenario'
import { closed, enumeration, identifier, record, uuid } from '../../src/services/decode'
import { createPages, createReceipts, error, operation } from '../http'
import type { createDeviceDemo } from '../devices/state'
import type { createScopeDemo } from '../policies/scopes'
import type { createResourceDemo } from '../policies/resources'
import type { createAdmissionDemo } from './admission'
import type { DemoEvent } from '../policies/schedule'
import type { ExecutionSummary } from '../../src/features/policies/clients/executions'
import {
  bootstrapDefinition,
  bootstrapPolicy,
  type BootstrapAttempt,
  type BootstrapDefinition,
  type BootstrapPolicy,
  type BootstrapTarget,
} from '../../src/features/software/clients/bootstrap'
import { candidate } from './catalog'
import { softwareProfiles } from './runs'
const unfinished = (a: BootstrapAttempt | null) =>
  !!a &&
  (['queued', 'waiting_user', 'running', 'unknown', 'reconciling'].includes(a.phase) ||
    (a.phase === 'acknowledged' && a.installation === 'unverified'))
export function createBootstrapDemo(
  devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts'>,
  scopes: Pick<ReturnType<typeof createScopeDemo>, 'freeze'>,
  resources: Pick<ReturnType<typeof createResourceDemo>, 'read'>,
  admission: Pick<ReturnType<typeof createAdmissionDemo>, 'isAdmitted'>,
) {
  const policies = new Map<string, BootstrapPolicy>(),
    receipts = createReceipts(),
    pages = createPages()
  const attempts = new Map<
    string,
    { policy: string; device: string; definition: BootstrapDefinition; value: BootstrapAttempt }
  >()
  let now = Math.floor(Date.now() / 1000)
  function packageApproved(d: BootstrapDefinition) {
    const a = d.action
    if (a.kind === 'request_mdm') return true
    const r = resources.read(a.resource.id),
      v = r?.versions.find((v) => v.id === a.resource.version)
    if (
      v?.state !== 'active' ||
      !admission.isAdmitted(a.resource.id, a.resource.version, a.admissionOperation)
    )
      return false
    return Object.entries(a.resource.variants).every(([target, key]) =>
      v.variants.some((v) => {
        if (
          `${v.platform}_${v.architecture}` !== target ||
          v.key !== key ||
          v.declaration.kind !== 'software'
        )
          return false
        const s = v.declaration.definition
        // A synthetic release allowlist, not a claim that a package name proves production trust.
        return (
          s.package === 'RSS.DemoAgent' &&
          s.format === (v.platform === 'windows' ? 'msi' : 'pkg') &&
          s.install.executor === (v.platform === 'windows' ? 'msi' : 'package_installer') &&
          s.install.runAs === 'system' &&
          s.install.arguments.length === 0 &&
          Object.keys(s.install.environment).length === 0 &&
          s.dependencies.length === 0 &&
          Object.keys(s.artifacts).length === 1 &&
          s.detect.kind !== 'script'
        )
      }),
    )
  }
  function target(
    d: BootstrapDefinition,
    deviceId: string,
    attempt: BootstrapAttempt | null,
  ): BootstrapTarget {
    const device = devices.facts().find((d) => d.summary.id === deviceId),
      mdm = d.platform === 'windows' ? 'mdm.windows' : 'mdm.apple'
    const from = d.action.kind === 'install_agent' ? mdm : 'agent.builtin',
      to = d.action.kind === 'install_agent' ? 'agent.builtin' : mdm
    const origins =
      device?.registrations.filter((r) => r.status === 'active' && r.source === from) ?? []
    const destinations =
      device?.registrations
        .filter((r) => r.source === to)
        .sort((a, b) => b.generation - a.generation) ?? []
    const active = destinations.filter((r) => r.status === 'active'),
      destination =
        active.length === 1 ? active[0]! : active.length ? null : (destinations[0] ?? null)
    const source =
      origins.length === 1
        ? {
            registrationId: origins[0]!.registrationId,
            generation: origins[0]!.generation,
            source: origins[0]!.source,
          }
        : null
    const scope = scopes.freeze(d.scope)
    let state: BootstrapTarget['admission'] = !d.enabled
      ? 'paused'
      : !scope
        ? 'scope_pending'
        : !scope.members.includes(deviceId)
          ? 'outside_scope'
          : !device || device.summary.platform !== d.platform
            ? 'unsupported'
            : origins.length === 0
              ? 'missing_source'
              : origins.length > 1
                ? 'ambiguous_source'
                : active.length > 1
                  ? 'ambiguous_target'
                  : active.length === 1
                    ? 'already_registered'
                    : !packageApproved(d)
                      ? 'package_unapproved'
                      : 'eligible'
    if (state === 'eligible') {
      const capability = d.action.kind === 'install_agent' ? 'agent.bootstrap.v1' : 'mdm.enroll.v1'
      if (
        !device!.bootstrapBindings?.some(
          (b) =>
            b.registration === source!.registrationId &&
            b.generation === source!.generation &&
            b.capability === capability,
        ) ||
        (d.action.kind === 'request_mdm' && softwareProfiles(device).length !== 1) ||
        (d.action.kind === 'install_agent' &&
          !d.action.resource.variants[`${d.platform}_${device!.architecture}`])
      )
        state = 'unsupported'
    }
    const profiles = (device?.agentBindings ?? []).filter(
      (p) =>
        destination?.status === 'active' &&
        p.registration === destination.registrationId &&
        p.generation === destination.generation,
    )
    const binding: BootstrapTarget['binding'] =
      d.action.kind === 'request_mdm'
        ? 'not_applicable'
        : active.length > 1 || profiles.length > 1
          ? 'ambiguous'
          : !profiles.length
            ? 'missing'
            : profiles[0]!.wireVersion === 3 &&
                profiles[0]!.capabilities.includes('software.execute.v3')
              ? 'ready'
              : 'unsupported'
    return { device: deviceId, source, admission: state, attempt, target: destination, binding }
  }
  function view(p: BootstrapPolicy) {
    return bootstrapPolicy({
      ...structuredClone(p),
      targets: p.targets.map((r) =>
        target(
          p.definition,
          r.device,
          r.attempt ? structuredClone(attempts.get(r.attempt.id)!.value) : null,
        ),
      ),
    })
  }
  function createAttempt(p: BootstrapPolicy, row: BootstrapTarget) {
    const value: BootstrapAttempt = {
      id: randomUUID(),
      policyRevision: p.revision,
      kind: p.definition.action.kind,
      source: row.source!,
      createdAt: now,
      deadline: now + 86400,
      phase: 'queued',
      delivery: 'queued',
      installation: p.definition.action.kind === 'request_mdm' ? 'not_applicable' : 'unverified',
      acknowledgedAt: null,
      detectedAt: null,
      code: null,
    }
    attempts.set(value.id, {
      policy: p.id,
      device: row.device,
      definition: structuredClone(p.definition),
      value,
    })
    p.targets.find((r) => r.device === row.device)!.attempt = value
  }
  const handle: DomainHandler = (request, scenario) => {
    const route =
      /^\/api\/v1\/mdm-candidate\/software\/bootstrap(?:\/([^/]+)(?:\/attempts\/([^/]+))?)?$/.exec(
        request.path,
      )
    if (!route) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      if (route[2]) {
        const attempt = attempts.get(uuid(route[2]))
        if (request.method !== 'GET') return error('malformed_request', 400)
        return attempt && attempt.policy === route[1]
          ? candidate({ attempt: structuredClone(attempt.value) })
          : error('operation_not_found', 404)
      }
      const id = route[1] ? uuid(route[1]) : undefined,
        current = id ? policies.get(id) : undefined
      if (request.method === 'GET')
        return id
          ? current
            ? candidate({ policy: view(current) })
            : error('resource_not_found', 404)
          : candidate(
              pages.page(
                request.path,
                scenario === 'empty' ? [] : [...policies.values()].map(view),
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
            'evaluate',
            'dispatch',
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
        if (action === 'put') {
          const definition = bootstrapDefinition(input['definition'])
          if (
            current?.targets.some((r) => unfinished(r.attempt)) ||
            !scopes.freeze(definition.scope) ||
            !packageApproved(definition)
          )
            return error('operation_conflict')
          const p = {
            id,
            revision: op.expectedRevision + 1,
            operation: op.operationId,
            definition,
            scopeRevision: null,
            targets: [],
          }
          policies.set(id, p)
          return candidate({ policy: p })
        }
        if (!current) return error('resource_not_found', 404)
        const p = current,
          d = p.definition
        if (action === 'evaluate') {
          const scope = scopes.freeze(d.scope)
          if (!scope || p.targets.some((r) => unfinished(r.attempt)))
            return error('operation_conflict')
          p.scopeRevision = scope.revision
          p.targets = scope.members.map((device) =>
            target(d, device, p.targets.find((r) => r.device === device)?.attempt ?? null),
          )
        } else if (action === 'dispatch' || action === 'retry') {
          const device = action === 'retry' ? identifier(input['device']) : null
          const rows = view(p).targets.filter(
            (r) =>
              (!device || device === r.device) &&
              r.admission === 'eligible' &&
              (device
                ? !!r.attempt && ['failed', 'cancelled'].includes(r.attempt.phase)
                : r.attempt === null),
          )
          if (
            !rows.length ||
            rows.some((row) =>
              [...attempts.values()].some(
                (a) =>
                  a.device === row.device && a.value.kind === d.action.kind && unfinished(a.value),
              ),
            )
          )
            return error('operation_conflict')
          for (const row of rows) createAttempt(p, row)
        } else if (action === 'pause') {
          d.enabled = false
          for (const row of p.targets) {
            const a = row.attempt
            if (!a) continue
            if (['queued', 'waiting_user'].includes(a.phase)) a.phase = 'cancelled'
            else if (a.phase === 'running') {
              a.phase = 'unknown'
              if (a.kind === 'install_agent') a.installation = 'unknown'
              a.code = 'cancel_effect_unknown'
            }
          }
        } else if (action === 'resume') {
          if (!packageApproved(d) || !scopes.freeze(d.scope)) return error('operation_conflict')
          d.enabled = true
        } else {
          const a = p.targets.find((r) => r.device === identifier(input['device']))?.attempt
          if (a?.phase !== 'unknown') return error('operation_conflict')
          a.phase = 'reconciling'
        }
        p.revision++
        p.operation = op.operationId
        return candidate({ policy: view(p) })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    references: (id: string, version: string) =>
      [...policies.values()].some(
        (p) =>
          p.definition.action.kind === 'install_agent' &&
          p.definition.action.resource.id === id &&
          p.definition.action.resource.version === version,
      ),
    tick(event: DemoEvent, scenario: Scenario) {
      if (event.at < now) return
      now = event.at
      for (const r of attempts.values()) {
        const a = r.value
        if (!unfinished(a)) continue
        if (now >= a.deadline && ['queued', 'waiting_user', 'running'].includes(a.phase)) {
          a.phase = a.phase === 'running' ? 'unknown' : 'failed'
          if (a.kind === 'install_agent' && a.phase === 'unknown') a.installation = 'unknown'
          a.code = 'deadline_elapsed'
          continue
        }
        if (event.kind !== 'clock' && event.device !== r.device) continue
        const p = policies.get(r.policy)!,
          current = target(p.definition, r.device, a)
        if (JSON.stringify(current.source) !== JSON.stringify(a.source)) {
          a.phase = ['queued', 'waiting_user'].includes(a.phase) ? 'failed' : 'unknown'
          if (a.kind === 'install_agent')
            a.installation = a.phase === 'unknown' ? 'unknown' : 'unverified'
          a.code = 'source_registration_changed'
          continue
        }
        if (event.kind === 'clock') continue
        if (scenario === 'offline') continue
        if (
          ['queued', 'waiting_user'].includes(a.phase) &&
          (current.admission !== 'eligible' || scenario === 'unsupported')
        ) {
          a.phase = 'failed'
          a.code = 'authorization_changed'
          continue
        }
        if (a.phase === 'queued' && event.kind === 'check_in') {
          a.delivery = 'received'
          a.phase =
            r.definition.action.kind === 'request_mdm' ||
            r.definition.action.userAction === 'required'
              ? 'waiting_user'
              : 'running'
        } else if (a.phase === 'waiting_user' && event.kind === 'bootstrap_continue')
          a.phase = 'running'
        else if (a.phase === 'running' && event.kind === 'check_in') {
          a.phase =
            scenario === 'unknown' ? 'unknown' : scenario === 'partial' ? 'failed' : 'acknowledged'
          if (a.kind === 'install_agent')
            a.installation =
              a.phase === 'unknown' ? 'unknown' : a.phase === 'failed' ? 'failed' : 'unverified'
          a.code = a.phase === 'failed' ? 'synthetic_command_failure' : null
          if (a.phase === 'acknowledged') a.acknowledgedAt = now
        } else if (
          (a.phase === 'acknowledged' || a.phase === 'reconciling') &&
          event.kind === 'bootstrap_detect'
        ) {
          if (scenario === 'unknown' || scenario === 'partial') {
            a.phase = 'unknown'
            if (a.kind === 'install_agent') a.installation = 'unknown'
          } else {
            a.phase = 'acknowledged'
            a.acknowledgedAt ??= now
            a.code = null
            if (a.kind === 'install_agent') {
              a.installation = 'present'
              a.detectedAt = now
            }
          }
        }
      }
    },
    executions(): ExecutionSummary[] {
      return [...attempts.values()].map(({ policy, device, value: a }) => ({
        id: a.id,
        batch: null,
        device,
        origin: { kind: 'bootstrap', policy },
        admission: 'accepted',
        dispatch:
          a.delivery === 'queued' ? 'queued' : a.delivery === 'unknown' ? 'unknown' : 'published',
        receipt:
          a.delivery === 'received'
            ? 'received'
            : a.delivery === 'unknown'
              ? 'unknown'
              : 'not_received',
        execution:
          a.phase === 'acknowledged'
            ? 'succeeded'
            : a.phase === 'failed'
              ? 'failed'
              : a.phase === 'cancelled'
                ? 'cancelled'
                : a.phase === 'running'
                  ? 'running'
                  : ['unknown', 'reconciling'].includes(a.phase)
                    ? 'unknown'
                    : 'not_started',
        effect:
          a.installation === 'present'
            ? 'verified_present'
            : a.installation === 'unknown'
              ? 'unknown'
              : a.installation === 'failed'
                ? 'failed'
                : 'unverified',
        compliance: 'unknown',
        attempt: a.id,
        nativeCode: a.code,
        waitingReason:
          a.phase === 'waiting_user'
            ? 'user_action'
            : ['unknown', 'reconciling'].includes(a.phase) ||
                (a.installation === 'unverified' && a.phase === 'acknowledged')
              ? 'effect_verification'
              : a.phase === 'queued'
                ? 'device_receipt'
                : null,
      }))
    },
    reset() {
      policies.clear()
      attempts.clear()
      receipts.reset()
      pages.reset()
      now = Math.floor(Date.now() / 1000)
    },
  }
}
