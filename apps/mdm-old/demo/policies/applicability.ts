import type { DemoDevice } from '../devices/fixtures'
import type { ResourceRead, Platform } from '../../src/features/policies/clients/resources'
export type Applicability =
  | 'applicable'
  | 'authorization'
  | 'unsupported'
  | 'conflict'
  | 'resource_unavailable'
export interface ConfigurationEffects {
  id: string
  platform: Platform
  settings: { key: string; value: string | number | boolean }[]
}
export function resourceApplicability(
  resource: ResourceRead,
  version: string,
  device: DemoDevice | undefined,
): Applicability {
  const v = resource.versions.find((v) => v.id === version && v.state === 'active')
  if (!v) return 'resource_unavailable'
  const native = resource.kind === 'configuration',
    channel = native ? 'mdm' : 'agent'
  if (
    !device ||
    !device.registrations.some(
      (r) =>
        r.status === 'active' &&
        (native ? r.source.startsWith('mdm.') : r.source === 'agent.builtin'),
    )
  )
    return 'authorization'
  if (!device.summary.channels.includes(channel)) return 'unsupported'
  return v.variants.filter(
    (v) =>
      v.platform === device.summary.platform &&
      v.architecture === device.architecture &&
      v.declaration.kind === resource.kind,
  ).length === 1
    ? 'applicable'
    : 'unsupported'
}
