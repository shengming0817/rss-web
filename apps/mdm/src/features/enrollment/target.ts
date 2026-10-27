import type { InjectionKey } from 'vue'

/** Optional composition-owned target evidence. The current production status API has no device binding. */
export type EnrollmentTargetResolver = (
  enrollmentId: string,
) => Promise<{ enrollmentId: string; deviceId: string }>

export const enrollmentTargetKey: InjectionKey<EnrollmentTargetResolver> =
  Symbol('enrollment-target')
