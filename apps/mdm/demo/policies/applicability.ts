import type { DemoDevice } from '../devices/fixtures'
import type { Configuration } from '../../src/features/policies/clients/configurations'
import type { ResourceRead } from '../../src/features/policies/clients/resources'
export type Applicability =
  | 'applicable'
  | 'authorization'
  | 'unsupported'
  | 'conflict'
  | 'resource_unavailable'
export function configurationConflicts(
  configuration: Configuration,
  version: number,
  assigned: Configuration[],
): string[] {
  const selected = configuration.versions.find(
    (v) => v.version === version && v.status === 'published',
  )
  if (!selected) return []
  return [
    ...new Set(
      assigned
        .filter(
          (c) =>
            c.platform === configuration.platform &&
            c.versions.some(
              (other) =>
                other.status === 'published' &&
                other.settings.some((s) =>
                  selected.settings.some((next) => next.key === s.key && next.value !== s.value),
                ),
            ),
        )
        .map((c) => c.id),
    ),
  ]
}
export function configurationApplicability(
  configuration: Configuration,
  version: number,
  device: DemoDevice | undefined,
  assigned: Configuration[],
): Applicability {
  const v = configuration.versions.find((v) => v.version === version && v.status === 'published')
  if (!v) return 'resource_unavailable'
  if (
    !device ||
    !device.registrations.some((r) => r.status === 'active' && r.source.startsWith('mdm.'))
  )
    return 'authorization'
  if (
    device.summary.platform !== configuration.platform ||
    !device.summary.channels.includes('mdm')
  )
    return 'unsupported'
  if (configurationConflicts(configuration, version, assigned).length) return 'conflict'
  return 'applicable'
}
export function resourceApplicability(
  resource: ResourceRead,
  version: string,
  device: DemoDevice | undefined,
): Applicability {
  const v = resource.versions.find((v) => v.id === version && v.state === 'active')
  if (!v) return 'resource_unavailable'
  const native = v.configuration !== null,
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
  if (native)
    return device.summary.platform === 'windows' && device.nativeWindows
      ? 'applicable'
      : 'unsupported'
  return v.variants.filter(
    (v) =>
      v.platform === device.summary.platform &&
      v.architecture === device.architecture &&
      v.declaration.kind === resource.kind,
  ).length === 1
    ? 'applicable'
    : 'unsupported'
}
