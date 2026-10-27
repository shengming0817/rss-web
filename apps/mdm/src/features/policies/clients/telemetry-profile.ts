import { checked } from '../../../contracts/collection/check'
import { validateTelemetryProfile } from '@rss/api/mdm-validators'
import type { TelemetryProfile as Profile } from '@rss/api/mdm-types'
export type TelemetryProfile = Profile
export function telemetryProfile(value: unknown): Profile {
  return checked(validateTelemetryProfile, value)
}
