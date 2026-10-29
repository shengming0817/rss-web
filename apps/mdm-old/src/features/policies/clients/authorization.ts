import * as wireSchemas from '@rss/api/mdm-schemas'

/** Current server decisions; neither a read nor this summary grants a later write. */
export function authorization(value: unknown) {
  if (!wireSchemas.getApiV1OperationsResponse.validateAuthorization(value))
    throw new Error('Invalid contract value')

  const state = value['state']
  if (state === 'blocked') {
    const v = value
    return {
      state,
      reason: v['reason'],
    }
  }

  return { state }
}
export function reauthorizationEligibility(value: unknown) {
  if (!wireSchemas.getApiV1OperationsResponse.validateReauthorization(value))
    throw new Error('Invalid contract value')

  const state = value['state']
  if (state === 'available') {
    const v = value
    return { state, confirmationRequired: v['confirmationRequired'] }
  }
  if (state === 'unavailable') {
    const v = value
    return {
      state,
      reason: v['reason'],
    }
  }

  return { state }
}
export type Authorization = ReturnType<typeof authorization>
export type ReauthorizationEligibility = ReturnType<typeof reauthorizationEligibility>
