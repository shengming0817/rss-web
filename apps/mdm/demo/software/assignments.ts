import { createHash, randomUUID } from 'node:crypto'
import type { DomainHandler, Scenario } from '../scenario'
import { createReceipts, error, ok, operation } from '../http'
import type { createDeviceDemo } from '../devices/state'
import type { createResourceDemo } from '../policies/resources'
import type { createScopeDemo } from '../policies/scopes'
import type { createAdmissionDemo } from './admission'
import type { DemoEvent } from '../policies/schedule'
import { boolean, closed, enumeration, identifier, uuid } from '../../src/services/decode'
import {
  softwarePolicyDefinition,
  type SoftwarePolicy,
  type SoftwarePolicyDefinition,
  type taskAdmission,
} from '../../src/features/software/clients/assignment-model'
import { createSoftwareRuns, softwareProfiles } from './runs'
type Definition = SoftwarePolicyDefinition
function semantic(d: Definition) {
  const b = d.behavior,
    s = b.schedule
  return JSON.stringify([
    { ...d.resource, variants: Object.entries(d.resource.variants).sort() },
    b.intent,
    b.admissionOperation,
    { ...s, window: s.window ? { ...s.window, weekdays: [...s.window.weekdays].sort() } : null },
    b.runLifetimeSeconds,
  ])
}
export function createSoftwarePolicyDemo(
  devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts'>,
  scopes: Pick<ReturnType<typeof createScopeDemo>, 'resolve' | 'snapshot'>,
  resources: Pick<ReturnType<typeof createResourceDemo>, 'read'>,
  admission: Pick<ReturnType<typeof createAdmissionDemo>, 'isAdmitted'>,
) {
  const policies = new Map<string, SoftwarePolicy>(),
    receipts = createReceipts()
  const managedPolicies = new Set<string>()
  let now = Math.floor(Date.now() / 1000)
  function admissionFailure(d: Definition) {
    const r = resources.read(d.resource.id),
      v = r?.versions.find((v) => v.id === d.resource.version)
    if (
      r?.kind !== 'software' ||
      v?.state !== 'active' ||
      !admission.isAdmitted(r.id, v.id, d.behavior.admissionOperation)
    )
      return error('operation_conflict')
    for (const [target, key] of Object.entries(d.resource.variants)) {
      const variant = v.variants.find(
        (v) => `${v.platform}_${v.architecture}` === target && v.key === key,
      )
      if (variant?.declaration.kind !== 'software') return error('operation_conflict')
      if (
        d.behavior.intent === 'explicit_uninstall' &&
        variant.declaration.definition.uninstall === null
      )
        return error('action_not_supported', 501)
    }
    return undefined
  }
  function members(d: Definition, index: number) {
    const root = scopes.resolve(d.scope)?.members ?? [],
      prior = new Set(
        d.behavior.rollout.stages
          .slice(0, index)
          .flatMap((s) => scopes.resolve(s.scope)?.members ?? []),
      )
    return (scopes.resolve(d.behavior.rollout.stages[index]!.scope)?.members ?? []).filter(
      (v) => root.includes(v) && !prior.has(v),
    )
  }
  const runs = createSoftwareRuns((r) => {
    const p = policies.get(r.policy.id),
      device = devices.facts().find((d) => d.summary.id === r.value.device)
    return (
      !!p &&
      p.versionId === r.policy.versionId &&
      management(p.definition, p.enabled, p.versionId, r.value.device).state === 'eligible' &&
      softwareProfiles(device).some(
        (b) => b.registration === r.value.registrationId && b.generation === r.value.generation,
      )
    )
  })
  function counts(d: Definition, version: string, index: number) {
    const target = members(d, index),
      rows = target.flatMap((device) => {
        const run = runs
          .rows()
          .filter(
            (r) =>
              r.policy.versionId === version &&
              r.stageScope === d.behavior.rollout.stages[index]!.scope &&
              r.value.device === device,
          )
          .at(-1)
        return run ? [run] : []
      })
    return {
      totalTargets: target.length,
      reported: rows.filter((r) => r.value.result !== null).length,
      unknown: rows.filter(
        (r) => r.value.effect === 'unknown' || r.value.state.execution === 'unknown',
      ).length,
      waitingUser: rows.filter((r) => runs.userAction(r, now) !== null).length,
      waitingReboot: rows.filter((r) => r.value.effect === 'waiting_reboot').length,
      failed: rows.filter((r) => r.value.effect === 'failed').length,
      verifiedSuccess: rows.filter((r) => r.value.effect === 'verified').length,
      unsupportedCapability: target.filter(
        (id) =>
          !softwareProfiles(devices.facts().find((d) => d.summary.id === id)).some((p) =>
            p.capabilities.includes('software.execute.v3'),
          ),
      ).length,
    }
  }
  function open(d: Definition, version: string, stage: number) {
    const s = d.behavior.rollout.stages[stage]!
    if (now < s.opensAt) return false
    if (s.minimumVerifiedPercent === null) return true
    const prior = counts(d, version, stage - 1)
    return (
      prior.totalTargets > 0 &&
      prior.verifiedSuccess * 100 >= prior.totalTargets * s.minimumVerifiedPercent
    )
  }
  function management(
    d: Definition,
    enabled: boolean,
    version: string,
    device: string,
  ): ReturnType<typeof taskAdmission> {
    if (!enabled) return { state: 'paused' }
    if (now < d.behavior.schedule.notBefore || now >= (d.behavior.schedule.until ?? Infinity))
      return { state: 'outside_window' }
    const root = scopes.resolve(d.scope)
    if (!root?.members.includes(device)) return { state: 'outside_scope' }
    let stage = -1
    for (const [index, s] of d.behavior.rollout.stages.entries()) {
      const scope = scopes.resolve(s.scope)
      if (!scope) return { state: 'scope_pending', stage: index }
      if (scope.members.includes(device)) {
        stage = index
        break
      }
    }
    if (stage < 0) return { state: 'outside_stage' }
    if (now < d.behavior.rollout.stages[stage]!.opensAt) return { state: 'scheduled', stage }
    if (!open(d, version, stage)) return { state: 'success_gate', stage }
    const profiles = softwareProfiles(devices.facts().find((d) => d.summary.id === device))
    if (!profiles.length) return { state: 'missing_registration', stage }
    if (profiles.length !== 1) return { state: 'ambiguous_registration', stage }
    const p = profiles[0]!
    if (!p.capabilities.includes('software.execute.v3'))
      return { state: 'unsupported_capability', stage }
    if (!d.resource.variants[`${p.platform}_${p.architecture}`])
      return { state: 'missing_variant', stage }
    if (admissionFailure(d)) return { state: 'approval_withdrawn', stage }
    return { state: 'eligible', stage }
  }
  function page<T>(items: T[], after: string | null, key: (v: T) => string, size = 64) {
    const sorted = items
      .filter((v) => !after || key(v) > after)
      .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
    return {
      items: sorted.slice(0, size),
      nextCursor: sorted.length > size ? key(sorted[size - 1]!) : null,
    }
  }
  const handle: DomainHandler = (request, scenario) => {
    if (!/^\/api\/v1\/policies(?:\/|$)/.test(request.path)) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      if (request.path === '/api/v1/policies/previews' && request.method === 'POST') {
        const input = closed(request.body, ['definition'], ['after', 'scopeResult']),
          d = softwarePolicyDefinition(input['definition'])
        const failure = admissionFailure(d)
        if (failure) return failure
        const snapshot = scopes.snapshot(d.scope)
        if (!snapshot || ('scopeResult' in input && uuid(input['scopeResult']) !== snapshot.result))
          return error('operation_conflict')
        const result = page(
          scenario === 'empty' ? [] : snapshot.devices,
          'after' in input ? identifier(input['after']) : null,
          (d) => d,
        )
        return ok({
          resource: d.resource,
          scopeResult: snapshot.result,
          nextCursor: result.nextCursor,
          items: result.items.map((device) => ({
            device,
            eligibility:
              scopes.resolve(d.scope) === null
                ? { state: 'pending' }
                : scopes.resolve(d.scope)?.members.includes(device)
                  ? { state: 'eligible', entry: 1 }
                  : { state: 'excluded' },
            taskAdmission: management(d, true, '', device),
          })),
        })
      }
      if (request.path === '/api/v1/policies' && request.method === 'GET') {
        const after = request.query.get('after')
        if (after) uuid(after)
        return ok(page(scenario === 'empty' ? [] : [...policies.values()], after, (p) => p.id))
      }
      const match =
        /^\/api\/v1\/policies\/([^/]+)(?:\/(devices|software\/rollout|runs|reruns)(?:\/([^/]+))?)?$/.exec(
          request.path,
        )
      if (!match) return
      const id = uuid(match[1]),
        p = policies.get(id),
        suffix = match[2]
      if (suffix === 'reruns') return error('malformed_request', 400)
      if (suffix === 'runs' && request.method === 'GET') {
        const all = runs.rows().filter((r) => r.policy.id === id)
        if (match[3]) {
          const r = all.find((r) => r.value.taskId === uuid(match[3]))
          return r ? ok(runs.wire(r, now, true)) : error('task_not_found', 404)
        }
        const at = request.query.get('afterAt'),
          after = request.query.get('afterId')
        if (
          (at === null) !== (after === null) ||
          (at !== null && (!Number.isSafeInteger(Number(at)) || Number(at) < 0))
        )
          throw new Error('Invalid cursor')
        if (after) uuid(after)
        const items = all
          .filter(
            (r) =>
              at === null ||
              r.value.availableAt < Number(at) ||
              (r.value.availableAt === Number(at) && r.value.taskId < after!),
          )
          .sort(
            (a, b) =>
              b.value.availableAt - a.value.availableAt ||
              (a.value.taskId < b.value.taskId ? 1 : -1),
          )
        const last = items[19]
        return ok({
          items: (scenario === 'empty' ? [] : items.slice(0, 20)).map((r) => runs.wire(r, now)),
          nextCursor:
            scenario !== 'empty' && items.length > 20 && last
              ? { availableAt: last.value.availableAt, taskId: last.value.taskId }
              : null,
        })
      }
      if (request.method === 'GET') {
        if (!p) return error('policy_not_found', 404)
        if (suffix === 'software/rollout')
          return ok({
            policyId: p.id,
            versionId: p.versionId,
            paused: !p.enabled,
            asOf: now,
            stages: p.definition.behavior.rollout.stages.map((s, i) => ({
              ...s,
              open: p.enabled && open(p.definition, p.versionId, i),
              ...counts(p.definition, p.versionId, i),
            })),
          })
        if (suffix === 'devices') {
          const snapshot = scopes.snapshot(p.definition.scope)
          const result = page(
            scenario === 'empty' ? [] : (snapshot?.devices ?? []),
            request.query.get('after'),
            (d) => d,
          )
          return ok({
            ...result,
            items: result.items.map((device) => {
              const state = management(p.definition, p.enabled, p.versionId, device)
              return {
                device,
                assignment:
                  state.state === 'eligible'
                    ? 'eligible'
                    : state.state === 'outside_scope' && scopes.resolve(p.definition.scope) !== null
                      ? 'excluded'
                      : 'pending',
                taskAdmission: state,
                operationId: null,
                diagnosis: null,
              }
            }),
          })
        }
        return ok(structuredClone(p))
      }
      if (request.method !== 'POST' || suffix) return
      if (managedPolicies.has(id)) return error('permission_denied', 403)
      const op = operation(request.body)
      return receipts.write(request, op.operationId, () => {
        if (op.expectedRevision !== (p?.revision ?? 0)) return error('operation_conflict')
        const input = closed(op.input, ['action'], ['definition', 'enabled']),
          action = enumeration(input['action'], ['put', 'enable', 'disable'] as const)
        let next: SoftwarePolicy
        if (action === 'put') {
          closed(input, ['action', 'definition', 'enabled'])
          const definition = softwarePolicyDefinition(input['definition'])
          const failure = admissionFailure(definition)
          if (failure) return failure
          if (
            !scopes.resolve(definition.scope) ||
            definition.behavior.rollout.stages.some((s) => !scopes.resolve(s.scope))
          )
            return error('operation_conflict')
          next = {
            id,
            revision: op.expectedRevision + 1,
            version:
              p && semantic(p.definition) === semantic(definition)
                ? p.version
                : (p?.version ?? 0) + 1,
            versionId:
              p && semantic(p.definition) === semantic(definition) ? p.versionId : randomUUID(),
            enabled: boolean(input['enabled']),
            definition,
          }
        } else {
          closed(input, ['action'])
          if (!p) return error('policy_not_found', 404)
          const failure = action === 'enable' ? admissionFailure(p.definition) : undefined
          if (failure) return failure
          next = { ...p, revision: p.revision + 1, enabled: action === 'enable' }
        }
        policies.set(id, next)
        runs.recover()
        return ok(structuredClone(next))
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    now: () => now,
    runs,
    createManagedPolicy(input: SoftwarePolicyDefinition) {
      const definition = softwarePolicyDefinition(input)
      if (admissionFailure(definition) || !scopes.resolve(definition.scope))
        throw new Error('Request assignment unavailable')
      const p: SoftwarePolicy = {
        id: randomUUID(),
        revision: 1,
        version: 1,
        versionId: randomUUID(),
        enabled: true,
        definition,
      }
      policies.set(p.id, p)
      managedPolicies.add(p.id)
      return { id: p.id, versionId: p.versionId }
    },
    cancelManagedPolicy(id: string) {
      const p = policies.get(id)
      if (!p || !managedPolicies.has(id)) throw new Error('Wrong request assignment')
      p.enabled = false
      p.revision++
      runs.recover()
    },
    references: (id: string, version: string) =>
      [...policies.values()].some(
        (p) => p.definition.resource.id === id && p.definition.resource.version === version,
      ),
    tick(event: DemoEvent, scenario: Scenario) {
      if (event.at < now) return
      now = event.at
      runs.recover()
      runs.advance(event, scenario)
      if (event.kind !== 'check_in' || !event.device) return
      const d = devices.facts().find((d) => d.summary.id === event.device)
      if (!d) return
      for (const p of policies.values()) {
        const state = management(p.definition, p.enabled, p.versionId, d.summary.id)
        if (state.state === 'eligible' && scenario !== 'unsupported') {
          const profile = softwareProfiles(d)[0]!,
            binding = p.definition.resource
          const selected = resources
            .read(binding.id)
            ?.versions.find((v) => v.id === binding.version)
            ?.variants.find(
              (v) =>
                v.key === binding.variants[`${profile.platform}_${profile.architecture}`] &&
                v.platform === profile.platform &&
                v.architecture === profile.architecture,
            )
          if (selected?.declaration.kind === 'software')
            runs.admit(p, state.stage!, d, now, {
              version: selected.declaration.definition.version,
              digest: [
                ...createHash('sha256')
                  .update(JSON.stringify(selected.declaration.definition))
                  .digest(),
              ],
            })
        }
      }
      runs.offer(d.summary.id, now)
    },
    reset() {
      policies.clear()
      receipts.reset()
      runs.reset()
      managedPolicies.clear()
      now = Math.floor(Date.now() / 1000)
    },
  }
}
