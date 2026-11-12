import type { EndpointDetail } from './model'

export const controlActions = ['restart', 'lock', 'wipe'] as const
export type DeviceControlAction = (typeof controlActions)[number]

export function controlApplicability(
  detail: EndpointDetail | undefined,
  action: DeviceControlAction,
) {
  const fact = detail?.capabilities.find(
    (capability) => capability.channel === 'mdm' && capability.action === action,
  )
  return {
    fact,
    ready:
      detail?.channel === 'mdm' && detail.status === 'active' &&
      fact?.productSupport.state === 'supported' &&
      fact.devicePrerequisite.state === 'supported' &&
      fact.permission.allowed,
  }
}
