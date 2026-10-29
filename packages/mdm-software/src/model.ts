import type { DirectoryQuery, Page, Platform } from '@rss/mdm-devices'
import type { Operation } from '@rss/mdm-inventory'
import type {
  Architecture,
  SoftwareArtifact,
  SoftwareBehavior,
  SoftwareSignature,
  SoftwareSource,
  ResourceVersion,
} from '@rss/mdm-resources'

export type SourceProtocol =
  | { readonly kind: 'private' }
  | { readonly kind: 'winget_rest'; readonly location: string; readonly identifier: string }
  | { readonly kind: 'winget_community'; readonly repository: string; readonly commit: string }
  | {
      readonly kind: 'brew_tap'
      readonly repository: string
      readonly tap: string
      readonly commit: string
    }
export interface SourceDefinition {
  readonly id: string
  readonly revision: string
  readonly protocol: SourceProtocol
}
export interface Lifecycle {
  readonly revision: number
  readonly state: 'enabled' | 'disabled' | 'withdrawn'
  readonly operation: string
  readonly actor: string
  readonly at: number
  readonly digest: readonly number[]
}
export interface SourceView {
  readonly source: SourceDefinition
  readonly snapshot: SoftwareSource
  readonly lifecycle: Lifecycle
}
export interface SourceRow {
  readonly id: string
  readonly revision: string
  readonly protocol?: SourceProtocol['kind']
  readonly state?: 'enabled' | 'disabled'
  readonly source?: SourceDefinition
  readonly snapshot?: SoftwareSource
  readonly lifecycle?: Lifecycle
}
export type SourceChange =
  | { readonly action: 'register'; readonly definition: SourceDefinition }
  | { readonly action: 'enable' | 'disable' }
export interface VersionDetail {
  readonly resource: string
  readonly version: string
  readonly resourceDigest: readonly number[]
  readonly resourceRevision: number
  readonly presentation: Readonly<Record<string, unknown>>
  readonly lifecycle: Lifecycle | null
}
export interface VersionRow {
  readonly resource?: string
  readonly version: string
  readonly state?: ResourceVersion['state']
}
export interface VersionReceipt {
  readonly resource: string
  readonly version: string
  readonly lifecycle: Lifecycle
}
export interface ImportDependency {
  readonly package: string
  readonly packageVersion: string
  readonly resource: string
  readonly version: string
  readonly sha256: readonly number[]
}
export type ImportSelection =
  | {
      readonly kind: 'winget'
      readonly installerType: string
      readonly scope: string
      readonly installerId: string | null
      readonly files: readonly string[]
    }
  | {
      readonly kind: 'brew'
      readonly path: string
      readonly bottleTag: string
      readonly sourceLength: number | null
    }
export interface ImportInput {
  readonly asOfUnixSeconds: number
  readonly source: SoftwareSource
  readonly resource: string
  readonly resourceVersion: string
  readonly package: string
  readonly packageVersion: string
  readonly platform: Platform
  readonly architecture: Architecture
  readonly variant: string
  readonly selection: ImportSelection
  readonly behavior: SoftwareBehavior
  readonly installerLength: number
  readonly additionalArtifacts: Readonly<Record<string, SoftwareArtifact>>
  readonly dependencies: readonly ImportDependency[]
  readonly signatures: readonly SoftwareSignature[]
  readonly reboot: 'forbid' | 'report'
  readonly downgrade: 'deny' | 'allow'
  readonly nativeExport: boolean
}
export interface ImportReceipt {
  readonly resource: string
  readonly version: string
  readonly resourceDigest: readonly number[]
  readonly storageRevision: number
}
export interface SoftwarePort {
  sources(query: DirectoryQuery<keyof SourceRow>): Promise<Page<SourceRow>>
  source(id: string, revision: string): Promise<SourceView>
  changeSource(id: string, revision: string, change: Operation<SourceChange>): Promise<SourceView>
  import(change: Operation<ImportInput>): Promise<ImportReceipt>
  versions(resource: string, query: DirectoryQuery<keyof VersionRow>): Promise<Page<VersionRow>>
  version(resource: string, version: string): Promise<VersionDetail>
  changeVersion(
    resource: string,
    version: string,
    change: Operation<{ readonly action: 'enable' | 'withdraw' }>,
  ): Promise<VersionReceipt>
}
