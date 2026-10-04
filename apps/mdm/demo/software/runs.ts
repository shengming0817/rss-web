import { createHash, randomUUID } from 'node:crypto'
import type { DemoDevice } from '../devices/fixtures'
import type { DemoEvent } from '../policies/schedule'
import type { Scenario } from '../scenario'
import type { SoftwarePolicy } from '../../src/features/software/clients/assignment-model'
import type { SoftwareRun } from '../../src/features/software/clients/runs'
import { nativeDue } from './schedule'
export function softwareProfiles(device: DemoDevice | undefined) {
  return (device?.agentBindings ?? []).filter(
    (binding) =>
      binding.wireVersion === 3 &&
      device?.registrations.some(
        (r) =>
          r.source === 'agent.builtin' &&
          r.status === 'active' &&
          r.registrationId === binding.registration &&
          r.generation === binding.generation,
      ),
  )
}
export interface RunRecord {
  policy: SoftwarePolicy
  packageVersion: string
  definitionDigest: number[]
  stageScope: string
  createdAt: number
  occurrence: string
  value: SoftwareRun
}
export function createSoftwareRuns(allowed: (run: RunRecord) => boolean) {
  const rows: RunRecord[] = []
  function userAction(r: RunRecord, now: number) {
    const s = r.value.state
    return r.policy.definition.action.intent === 'available_install' &&
      r.value.result === null &&
      s.execution === 'not_started' &&
      s.cancellation === 'none' &&
      s.delivery.kind !== 'queued' &&
      s.delivery.leaseUntil! > now
      ? ('waiting_user' as const)
      : null
  }
  function wire(r: RunRecord, now: number, detail = false) {
    const value = structuredClone(r.value)
    const result = value.result
      ? Object.fromEntries(
          Object.entries(value.result).filter(
            ([key]) => key !== 'kind' && (detail || key !== 'output'),
          ),
        )
      : null
    if (result && !detail && value.result)
      result['diagnostics'] = {
        durationMs: value.result.diagnostics.durationMs,
        executedAt: value.result.diagnostics.executedAt,
        failure: value.result.diagnostics.failure,
      }
    return {
      ...(value.state.delivery.kind !== 'queued'
        ? { attemptId: value.state.delivery.attempt }
        : {}),
      ...(value.authorization ? { authorization: value.authorization } : {}),
      taskId: value.taskId,
      device: value.device,
      registrationId: value.registrationId,
      generation: value.generation,
      availableAt: value.availableAt,
      deadline: value.deadline,
      state: value.state,
      effect: value.effect,
      result,
      userAction: userAction(r, now),
      ...(detail ? { policyId: r.policy.id } : { occurrence: r.occurrence }),
    }
  }
  function cancel(r: RunRecord) {
    const s = r.value.state
    if (s.execution === 'not_started') s.cancellation = 'confirmed'
    else if (s.execution === 'running' || s.execution === 'unknown') s.cancellation = 'requested'
  }
  function complete(
    r: RunRecord,
    now: number,
    effect: 'verified' | 'unknown' | 'waiting_reboot' | 'failed',
  ) {
    const uninstall = r.policy.definition.action.intent === 'explicit_uninstall'
    r.value.result = {
      kind: 'software',
      intent: uninstall ? 'uninstall' : 'install',
      installerExitCode: effect === 'failed' ? 1603 : 0,
      detection:
        effect === 'unknown'
          ? 'unknown'
          : effect === 'failed'
            ? uninstall
              ? 'present'
              : 'absent'
            : uninstall
              ? 'absent'
              : 'present',
      definitionDigest: r.definitionDigest,
      observedVersion: uninstall || effect === 'failed' ? null : r.packageVersion,
      evidenceDigest: [
        ...createHash('sha256').update(`synthetic:${r.value.taskId}:${now}`).digest(),
      ],
      rebootRequired: effect === 'waiting_reboot',
      effect,
      diagnostics: {
        stdout: 'Synthetic Agent evidence; no installer executed.',
        stderr: '',
        durationMs: 1000,
        executedAt: now,
        failure: effect === 'failed' ? 'non_zero_exit' : null,
      },
    }
    r.value.effect = effect
    r.value.state.execution = effect === 'verified' ? 'succeeded' : effect
  }
  return {
    rows: () => rows,
    wire,
    userAction,
    recover() {
      for (const r of rows) if (!allowed(r)) cancel(r)
    },
    advance(event: DemoEvent, scenario: Scenario) {
      for (const r of rows) {
        const s = r.value.state
        if (s.execution === 'running' && r.value.deadline <= event.at) s.execution = 'unknown'
        if (s.execution === 'not_started' && r.value.deadline <= event.at)
          s.cancellation = 'confirmed'
        if (event.device !== r.value.device) continue
        // The synthetic server resolves the original attempt, registration and digest from this task.
        // A check-in alone never resolves an unknown effect. Cancellation stays unknown.
        if (
          event.kind === 'software_detect' &&
          event.task === r.value.taskId &&
          s.execution === 'unknown' &&
          s.cancellation === 'none' &&
          allowed(r)
        ) {
          complete(
            r,
            event.at,
            scenario === 'unknown' ? 'unknown' : scenario === 'partial' ? 'failed' : 'verified',
          )
          continue
        }
        if (event.kind === 'software_reboot' && s.execution === 'waiting_reboot') {
          complete(r, event.at, allowed(r) ? 'verified' : 'unknown')
          continue
        }
        if (event.kind !== 'check_in' && event.kind !== 'software_start') continue
        if (s.cancellation === 'requested') {
          s.cancellation = 'confirmed'
          s.execution = 'unknown'
          continue
        }
        if (!allowed(r) || s.cancellation !== 'none') continue
        if (s.execution === 'running' && event.kind === 'check_in') {
          const effect =
            scenario === 'unknown'
              ? 'unknown'
              : scenario === 'partial'
                ? (['waiting_reboot', 'failed', 'unknown', 'verified'] as const)[
                    Math.floor(Number(r.value.device.slice(-2)) / 2) % 4
                  ]!
                : 'verified'
          complete(r, event.at, effect)
        } else if (
          s.execution === 'not_started' &&
          s.delivery.kind !== 'queued' &&
          s.delivery.leaseUntil! > event.at &&
          (r.policy.definition.action.intent !== 'available_install' ||
            event.kind === 'software_start')
        ) {
          s.execution = 'running'
          s.startedAt = event.at
        }
      }
    },
    admit(
      policy: SoftwarePolicy,
      stage: number,
      device: DemoDevice,
      now: number,
      material: { version: string; digest: number[] },
    ) {
      const profile = softwareProfiles(device)[0]!
      const relevant = rows.filter(
        (r) =>
          r.policy.definition.action.resource.id === policy.definition.action.resource.id &&
          r.value.device === device.summary.id,
      )
      const current = relevant.filter((r) => r.policy.versionId === policy.versionId)
      const failures = current.filter(
        (r) => r.value.result?.kind === 'software' && r.value.result.effect === 'failed',
      ).length
      if (
        relevant.some(
          (r) =>
            r.value.state.execution === 'unknown' ||
            r.value.state.execution === 'waiting_reboot' ||
            ((r.value.state.execution === 'running' ||
              (r.value.state.execution === 'not_started' && r.value.deadline > now)) &&
              r.value.state.cancellation !== 'confirmed'),
        ) ||
        current.some((r) => r.value.effect === 'verified') ||
        failures >= 3
      )
        return
      const schedule = policy.definition.action.schedule
      const stageScope = policy.definition.action.rollout.stages[stage]!.scope
      const last = current.filter((r) => r.stageScope === stageScope).at(-1)
      if (
        schedule.trigger.kind === 'check_in' &&
        last &&
        now - last.createdAt < schedule.trigger.minimumSeconds * 2 ** failures
      )
        return
      const due = nativeDue(schedule, now, device.summary.id)
      if (!due) return
      const availableAt = Math.max(due.availableAt, now),
        deadline = Math.min(
          availableAt + policy.definition.action.runLifetimeSeconds,
          schedule.until ?? Infinity,
          due.windowEnd ?? Infinity,
        )
      if (deadline <= availableAt) return
      rows.push({
        policy: structuredClone(policy),
        packageVersion: material.version,
        definitionDigest: material.digest,
        stageScope,
        createdAt: now,
        occurrence: `software:stage:${stageScope}:desired:${profile.registration}:${current.filter((r) => r.stageScope === stageScope).length}`,
        value: {
          taskId: randomUUID(),
          policyId: policy.id,
          device: device.summary.id,
          registrationId: profile.registration,
          generation: profile.generation,
          availableAt,
          deadline,
          state: {
            delivery: { kind: 'queued' },
            execution: 'not_started',
            cancellation: 'none',
            deadline,
            startedAt: null,
          },
          effect: 'unverified',
          userAction: null,
          result: null,
        },
      })
    },
    offer(device: string, now: number) {
      for (const r of rows)
        if (
          r.value.device === device &&
          allowed(r) &&
          r.value.availableAt <= now &&
          r.value.deadline > now &&
          r.value.state.execution === 'not_started' &&
          r.value.state.cancellation === 'none' &&
          (r.value.state.delivery.kind === 'queued' || r.value.state.delivery.leaseUntil! <= now)
        ) {
          r.value.state.delivery = {
            kind: 'received',
            attempt: randomUUID(),
            leaseUntil: Math.min(now + 120, r.value.deadline),
          }
        }
    },
    reset() {
      rows.length = 0
    },
  }
}
