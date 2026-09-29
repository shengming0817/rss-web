import type { ExecutionSummary } from '../../policies/clients/executions'
import type { SoftwareRun } from './runs'
/** A presentation projection; the native run remains the sole execution evidence owner. */
export function softwareExecution(
  policy: string,
  versionId: string,
  run: SoftwareRun,
): ExecutionSummary {
  const s = run.state,
    result = run.result
  return {
    id: run.taskId,
    batch: null,
    device: run.device,
    origin: { kind: 'software', policy, versionId, task: run.taskId },
    admission: 'accepted',
    dispatch: s.delivery.kind === 'queued' ? 'queued' : 'published',
    receipt: s.delivery.kind === 'received' ? 'received' : 'not_received',
    execution:
      s.execution === 'not_started' && s.cancellation === 'confirmed' ? 'cancelled' : s.execution,
    effect:
      run.effect === 'verified' && result?.kind === 'software'
        ? result.detection === 'present'
          ? 'verified_present'
          : result.detection === 'absent'
            ? 'verified_absent'
            : 'unknown'
        : run.effect === 'verified'
          ? 'unknown'
          : run.effect,
    compliance: 'unknown',
    attempt: s.delivery.kind === 'queued' ? null : s.delivery.attempt!,
    nativeCode: result?.kind === 'software' ? result.installerExitCode : (result?.exitCode ?? null),
    waitingReason:
      s.cancellation === 'requested'
        ? 'cancel_confirmation'
        : run.userAction === 'waiting_user'
          ? 'user_action'
          : s.execution === 'waiting_reboot'
            ? 'reboot'
            : s.execution === 'unknown' || run.effect === 'unknown'
              ? 'effect_verification'
              : s.execution === 'not_started' && s.cancellation !== 'confirmed'
                ? 'device_receipt'
                : null,
  }
}
