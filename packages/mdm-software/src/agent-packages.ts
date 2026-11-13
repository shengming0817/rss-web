import type { SoftwareBehavior } from '@rss/mdm-resources'
import { freeze, uuid } from '@rss/mdm-inventory'
export interface Target {
  readonly platform: 'windows' | 'macos'
  readonly architecture: 'x86_64' | 'aarch64'
}
export interface ManagedPackage {
  readonly releaseId: string
  readonly tenantId: string
  readonly target: Target
  readonly version: string
  readonly format: 'windows_exe' | 'windows_msi' | 'windows_msix' | 'macos_pkg'
  readonly filename: string
  readonly length: number
  readonly installerSha256: readonly number[]
  readonly state: 'published' | 'withdrawn'
  readonly platform: Target['platform']
  readonly architecture: Target['architecture']
}
export interface Preparation {
  readonly operationId: string
  readonly filename: string
  readonly length: number
  readonly sha256: readonly number[]
}
export interface PreparedUpload {
  readonly packageId: string
  readonly resource: string
  readonly upload: string
  readonly offset: number
  readonly length: number
  readonly complete: boolean
  readonly href: string
}
export interface Inspection {
  readonly packageId: string
  readonly filename: string
  readonly length: number
  readonly sha256: readonly number[]
  readonly format: string
  readonly inspection:
    | {
        readonly status: 'parsed'
        readonly facts: {
          readonly format: string
          readonly version: string | null
          readonly architectures: readonly string[]
          readonly bundleId: string | null
        }
      }
    | { readonly status: 'not_requested' | 'skipped_size_limit' | 'rejected' }
}
export interface Save {
  readonly operationId: string
  readonly packageId: string
  readonly version: string | null
  readonly target: Target
  readonly behavior: SoftwareBehavior | null
}
export interface SavedPackage {
  readonly packageId: string
  readonly resource: string
  readonly version: string
  readonly variant: string
  readonly productVersion: string
  readonly filename: string
  readonly length: number
  readonly sha256: readonly number[]
  readonly href: string
  readonly storageRevision: number
  readonly material: {
    readonly format: string
    readonly version: string | null
    readonly architectures: readonly string[]
    readonly bundleId: string | null
  }
}
export type PackageReceipt =
  | SavedPackage
  | { readonly withdrawn: string }
  | Omit<ManagedPackage, 'state' | 'platform' | 'architecture'>
export interface AgentPackagesPort {
  list(
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<{ readonly items: readonly ManagedPackage[]; readonly nextCursor: string | null }>
  read(id: string, signal?: AbortSignal): Promise<ManagedPackage>
  prepare(input: Preparation): Promise<PreparedUpload>
  inspect(id: string, signal?: AbortSignal): Promise<Inspection>
  parse(id: string): Promise<Inspection>
  save(input: Save): Promise<SavedPackage>
  publish(operationId: string, packageId: string): Promise<PackageReceipt>
  withdraw(operationId: string, releaseId: string): Promise<void>
  operation(id: string): Promise<PackageReceipt | null>
}
export function createAgentPackages(port: AgentPackagesPort, tenant: string) {
  uuid(tenant)
  function owned(value: ManagedPackage): ManagedPackage {
    if (value.tenantId !== tenant) throw new Error('Wrong Agent package tenant')
    return freeze(value)
  }
  return Object.freeze({
    async list(cursor: string | null = null, signal?: AbortSignal) {
      const page = await port.list(cursor, signal)
      return { ...page, items: page.items.map(owned) }
    },
    async read(id: string, signal?: AbortSignal) {
      const value = owned(await port.read(uuid(id), signal))
      if (value.releaseId !== id) throw new Error('Wrong Agent release')
      return value
    },
    async prepare(input: Preparation) {
      uuid(input.operationId)
      if (
        !input.filename ||
        /[/\\\p{Cc}]/u.test(input.filename) ||
        !Number.isSafeInteger(input.length) ||
        input.length < 1 ||
        input.sha256.length !== 32 ||
        input.sha256.some((v) => !Number.isInteger(v) || v < 0 || v > 255)
      )
        throw new Error('Invalid Agent installer preparation')
      const value = await port.prepare(freeze(input))
      if (
        value.packageId !== input.operationId ||
        value.upload !== input.operationId ||
        value.resource !== value.packageId ||
        value.length !== input.length ||
        value.offset > value.length
      )
        throw new Error('Wrong prepared installer binding')
      return freeze(value)
    },
    inspect: (id: string, signal?: AbortSignal) => port.inspect(uuid(id), signal),
    parse: (id: string) => port.parse(uuid(id)),
    async save(input: Save) {
      uuid(input.operationId)
      uuid(input.packageId)
      const value = await port.save(freeze(input))
      if (value.packageId !== input.packageId) throw new Error('Wrong saved installer')
      return freeze(value)
    },
    publish: (operationId: string, packageId: string) =>
      port.publish(uuid(operationId), uuid(packageId)),
    withdraw: (operationId: string, releaseId: string) =>
      port.withdraw(uuid(operationId), uuid(releaseId)),
    operation: (id: string) => port.operation(uuid(id)),
  })
}
