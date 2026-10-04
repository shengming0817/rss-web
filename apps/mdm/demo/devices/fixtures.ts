import { randomUUID } from 'node:crypto'
import type { DeviceSummary } from '../../src/features/devices/clients/directory'
import type {
  FieldDefinition,
  Inventory,
  ResolvedField,
  Scalar,
} from '../../src/features/devices/clients/asset-model'
import type { registration } from '../../src/features/devices/clients/enrollment'
export interface DemoDevice {
  securityBindings?: { registration: string; generation: number; capabilities: string[] }[]
  bootstrapBindings?: {
    registration: string
    generation: number
    capability: 'agent.bootstrap.v1' | 'mdm.enroll.v1'
  }[]
  updateBindings?: { registration: string; generation: number; capabilities: string[] }[]
  agentBindings?: {
    registration: string
    generation: number
    wireVersion: number
    platform: 'windows' | 'macos'
    architecture: 'x86_64' | 'aarch64'
    capabilities: string[]
  }[]
  architecture?: 'x86_64' | 'aarch64'
  summary: DeviceSummary
  inventory: Inventory
  registrations: ReturnType<typeof registration>[]
  enrollments: string[]
  nativeWindows?: { osVersion: string; edition: number }
  history: { id: string; at: number; event: string; operation: string | null }[]
}
const definitions: [string, Scalar['kind'], boolean][] = [
  ['device.model', 'string', false],
  ['device.os.version', 'string', false],
  ['custom.corporate_agent.version', 'string', false],
  ['custom.corporate_agent.healthy', 'boolean', false],
  ['custom.osquery.version', 'string', false],
  ['custom.asset_tag', 'string', true],
  ['custom.office_floor', 'integer', true],
  ['custom.is_loaner', 'boolean', true],
  ['custom.purchase_date', 'time', true],
]
export const catalog: FieldDefinition[] = definitions.map(([key, kind, manual]) => ({
  key,
  kind,
  nullable: manual,
  manual,
  sources: manual
    ? ['manual']
    : key === 'custom.osquery.version'
      ? ['agent.osquery']
      : key.startsWith('custom.')
        ? ['agent.script']
        : ['mdm.windows', 'mdm.apple', 'agent.builtin'],
  operations: [
    'eq',
    'ne',
    'in',
    'not_in',
    ...(kind === 'string'
      ? (['contains', 'not_contains'] as const)
      : kind === 'boolean'
        ? []
        : (['lt', 'le', 'gt', 'ge'] as const)),
    ...(manual ? (['is_null', 'is_not_null'] as const) : []),
  ],
}))
export function fact(
  field: string,
  value: Scalar,
  source: ResolvedField['sources'][number]['evidence']['source'] = 'manual',
): ResolvedField {
  const evidence = {
    source,
    registration: null,
    registrationGeneration: null,
    epoch: null,
    snapshotId: randomUUID(),
    observedAt: 1780000000,
    receivedAt: 1780000001,
    actor: source === 'manual' ? 'demo-operator' : null,
  }
  return {
    field,
    state: { kind: 'known', value },
    sources: [{ state: { kind: 'known', value }, lastKnown: { value, evidence }, evidence }],
  }
}
export function makeDevices(): Map<string, DemoDevice> {
  return new Map(
    Array.from({ length: 24 }, (_, index) => {
      const id = `device-${String(index + 1).padStart(2, '0')}`
      const platform = index % 2 ? 'macos' : 'windows'
      const pending = index === 2
      const channels: ('mdm' | 'agent')[] = pending
        ? []
        : index % 3 === 0
          ? ['mdm', 'agent']
          : index % 3 === 1
            ? ['mdm']
            : ['agent']
      const fields = Object.fromEntries(
        catalog.map((f) => [
          f.key,
          { field: f.key, state: { kind: 'missing' }, sources: [] } as ResolvedField,
        ]),
      )
      const revisions: Record<string, number> = {}
      if (!pending) {
        fields['device.model'] = fact(
          'device.model',
          { kind: 'string', value: platform === 'macos' ? 'MacBook Pro' : 'ThinkPad T14' },
          platform === 'macos' ? 'mdm.apple' : 'mdm.windows',
        )
        fields['device.os.version'] = fact(
          'device.os.version',
          { kind: 'string', value: platform === 'macos' ? '15.6' : '11.24H2' },
          'agent.builtin',
        )
        fields['custom.is_loaner'] = fact('custom.is_loaner', { kind: 'boolean', value: false })
        revisions['custom.is_loaner'] = 1
        fields['custom.office_floor'] = fact('custom.office_floor', { kind: 'integer', value: 0 })
        revisions['custom.office_floor'] = 1
        const kind = (['known', 'null', 'missing', 'unsupported', 'deleted', 'conflict'] as const)[
          index % 6
        ]!
        const sample =
          kind === 'conflict' || kind === 'unsupported'
            ? fields['device.os.version']!
            : fields['custom.is_loaner']!
        if (kind !== 'known') {
          sample.state = { kind }
          sample.sources[0]!.state = { kind }
          if (kind === 'conflict') {
            sample.sources[0]!.state = { kind: 'known', value: { kind: 'string', value: '15.6' } }
            sample.sources.push(
              fact('device.os.version', { kind: 'string', value: '15.5' }, 'mdm.apple').sources[0]!,
            )
          }
        }
      }
      const registrations = channels.map((channel) => ({
        registrationId: randomUUID(),
        enrollmentId: randomUUID(),
        agentGrantId: null,
        userContextId: null,
        source:
          channel === 'agent'
            ? ('agent.builtin' as const)
            : platform === 'macos'
              ? ('mdm.apple' as const)
              : ('mdm.windows' as const),
        generation: 1,
        status: 'active' as const,
      }))
      const summary: DeviceSummary = {
        id,
        name: `${platform === 'macos' ? 'Mac' : 'Windows'} ${index + 1}`,
        platform,
        status: pending ? 'pending' : 'registered',
        inventoryAvailable: !pending,
        revision: 1,
        channels,
        owner: pending ? null : `employee-${index + 1}`,
        department: pending ? null : 'Engineering',
      }
      return [
        id,
        {
          summary,
          architecture: platform === 'windows' ? 'x86_64' : 'aarch64',
          inventory: { device: id, channels, fields, quality: [], revisions },
          registrations,
          securityBindings: registrations.map((r) => ({
            registration: r.registrationId,
            generation: r.generation,
            capabilities:
              index === 5
                ? []
                : r.source === 'agent.builtin'
                  ? [
                      'security.remediate.v1',
                      'material.laps.rotate.v1',
                      'support.experience.v1',
                      'support.elevation.v1',
                      'support.diagnostics.v1',
                      'support.remote.view.v1',
                      'support.remote.control.v1',
                    ]
                  : r.source === 'mdm.windows'
                    ? ['material.bitlocker.rotate.v1', 'certificate.deploy.v1']
                    : [
                        'certificate.deploy.v1',
                        'material.filevault.rotate.v1',
                        'material.bootstrap_token.reescrow.v1',
                        'material.recovery_lock.rotate.v1',
                      ],
          })),
          bootstrapBindings: registrations.map((r) => ({
            registration: r.registrationId,
            generation: r.generation,
            capability: r.source === 'agent.builtin' ? 'mdm.enroll.v1' : 'agent.bootstrap.v1',
          })),
          updateBindings: registrations
            .filter((r) => r.source !== 'agent.builtin')
            .map((r) => ({
              registration: r.registrationId,
              generation: r.generation,
              capabilities: index === 4 ? [] : ['os.update.v1'],
            })),
          agentBindings: registrations
            .filter((r) => r.source === 'agent.builtin')
            .map((r) => ({
              registration: r.registrationId,
              generation: r.generation,
              wireVersion: 3,
              platform,
              architecture: platform === 'windows' ? 'x86_64' : 'aarch64',
              capabilities: index === 5 ? [] : ['software.execute.v3'],
            })),
          ...(platform === 'windows' && channels.includes('mdm')
            ? { nativeWindows: { osVersion: '10.0.26100', edition: 48 } }
            : {}),
          enrollments: registrations.map((r) => r.enrollmentId),
          history: [
            {
              id: randomUUID(),
              at: 1780000000,
              event: pending ? 'enrollment_requested' : 'registration_bound',
              operation: null,
            },
          ],
        },
      ]
    }),
  )
}
