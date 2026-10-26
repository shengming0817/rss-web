import { boolean, closed, enumeration, record } from '../../../services/decode'

/** Current server decisions; neither a read nor this summary grants a later write. */
export function authorization(value: unknown) {
  const state = enumeration(record(value)['state'], [
    'authorized',
    'blocked',
    'not_applicable',
  ] as const)
  if (state === 'blocked') {
    const v = closed(value, ['state', 'reason'])
    return {
      state,
      reason: enumeration(v['reason'], [
        'lifecycle_blocked',
        'registration_changed',
        'input_mismatch',
        'source_invalid',
      ] as const),
    }
  }
  closed(value, ['state'])
  return { state }
}
export function reauthorizationEligibility(value: unknown) {
  const state = enumeration(record(value)['state'], [
    'available',
    'unavailable',
    'not_applicable',
  ] as const)
  if (state === 'available') {
    const v = closed(value, ['state', 'confirmationRequired'])
    return { state, confirmationRequired: boolean(v['confirmationRequired']) }
  }
  if (state === 'unavailable') {
    const v = closed(value, ['state', 'reason'])
    return {
      state,
      reason: enumeration(v['reason'], [
        'permission_denied',
        'terminal',
        'already_received',
        'expired',
        'registration_changed',
        'input_mismatch',
        'unsupported',
      ] as const),
    }
  }
  closed(value, ['state'])
  return { state }
}
export type Authorization = ReturnType<typeof authorization>
export type ReauthorizationEligibility = ReturnType<typeof reauthorizationEligibility>
