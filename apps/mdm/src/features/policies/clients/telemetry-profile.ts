import { checked } from '../../../contracts/collection/check'
import { validateTelemetryProfile } from '../../../contracts/collection/generated/validators'
import type { TelemetryProfile as Profile } from '../../../contracts/collection/generated/ResourceWrite'
export type TelemetryProfile = Profile
export function telemetryProfile(value: unknown): Profile {
  return checked(validateTelemetryProfile, value)
}
