import type { DirectoryQuery, Page, Platform } from '@rss/mdm-devices'
import type { Operation } from '@rss/mdm-inventory'
import type { AgentDefinition, NativeDefinition, ScriptDefinition } from './collections'
import type { SoftwareDefinition } from './software'

export type Architecture = 'x86_64' | 'aarch64'
export const resourceKinds = [
  'software',
  'script',
  'configuration',
  'native_collection',
  'agent_collection',
  'telemetry_profile',
] as const
export type ResourceKind = (typeof resourceKinds)[number]
export interface Artifact {
  readonly reference: string
  readonly length: number
  readonly sha256: readonly number[]
}
export interface MaterialTarget {
  readonly resource: string
  readonly version: string
  readonly variant: string
  readonly platform: Platform
  readonly architecture: Architecture
  readonly artifact: Artifact
}
export interface TelemetryDefinition {
  readonly template: {
    readonly resource: string
    readonly version: string
    readonly variant: string
    readonly platform: Platform
    readonly architecture: Architecture
  }
  readonly parameters: Readonly<Record<string, unknown>>
  readonly fields: readonly { readonly key: string; readonly version: number }[]
  readonly projection: 'current' | 'history' | 'both'
  readonly sampleMillis: number
  readonly uploadMillis: number
  readonly budget: {
    readonly points: number
    readonly bytes: number
    readonly resources: number
    readonly executionMillis: number
    readonly outputBytes: number
  }
  readonly boost: { readonly sampleMillis: number; readonly expiresAt: number } | null
  readonly backfillSeconds: number
}
/** Configuration is an authored native document, separately validated by its platform owner. */
export interface ConfigurationDocument {
  readonly target: { readonly kind: 'device' }
  readonly apply: {
    readonly platform: 'macos'
    readonly request: Readonly<Record<string, unknown>>
  }
  readonly remove: {
    readonly platform: 'macos'
    readonly request: Readonly<Record<string, unknown>>
  }
}
export type Declaration =
  | { readonly kind: 'software'; readonly definition: SoftwareDefinition }
  | { readonly kind: 'script'; readonly artifact: Artifact; readonly definition: ScriptDefinition }
  | { readonly kind: 'configuration'; readonly artifact: Artifact }
  | {
      readonly kind: 'native_collection'
      readonly artifact: Artifact
      readonly definition: NativeDefinition
    }
  | {
      readonly kind: 'agent_collection'
      readonly artifact: Artifact
      readonly definition: AgentDefinition
    }
  | {
      readonly kind: 'telemetry_profile'
      readonly artifact: Artifact
      readonly definition: TelemetryDefinition
    }
export interface Variant {
  readonly key: string
  readonly platform: Platform
  readonly architecture: Architecture
  readonly declaration: Declaration
}
export interface ResourceVersion {
  readonly id: string
  readonly state: 'frozen' | 'active' | 'deprecated' | 'archived'
  readonly digest: readonly number[]
  readonly variants: readonly Variant[]
}
export interface Resource {
  readonly id: string
  readonly kind: ResourceKind
  readonly revision: number
  readonly presentation: Readonly<Record<string, unknown>>
  readonly origin: {
    readonly blueprint: string
    readonly version: string
    readonly digest: readonly number[]
  } | null
  readonly versions: readonly ResourceVersion[]
}
export interface ResourceRow {
  readonly id: string
  readonly kind?: ResourceKind
  readonly revision?: number
  readonly activeVersion?: string | null
  readonly presentation?: Readonly<Record<string, unknown>>
}
export interface Blueprint {
  readonly id: string
  readonly version: string
  readonly presentation: Readonly<Record<string, unknown>>
  readonly platform: Platform
  readonly definition:
    | { readonly kind: 'agent_collection'; readonly template: AgentDefinition }
    | { readonly kind: 'native_collection'; readonly template: NativeDefinition }
    | { readonly kind: 'configuration'; readonly content: ConfigurationDocument }
}
export interface BlueprintCatalog {
  readonly categories: readonly string[]
  readonly items: readonly Blueprint[]
}
export type ResourceChange =
  | { readonly action: 'create'; readonly kind: ResourceKind }
  | { readonly action: 'present'; readonly presentation: Readonly<Record<string, unknown>> }
  | { readonly action: 'instantiate'; readonly blueprint: string; readonly version: string }
  | {
      readonly action: 'version'
      readonly version: string
      readonly kind: ResourceKind
      readonly variants: readonly Variant[]
    }
  | { readonly action: 'activate' | 'deprecate' | 'archive'; readonly version: string }
export interface ResourceReceipt {
  readonly resource: string
  readonly request: string
  readonly storageRevision: number
}
export interface ResourcesPort {
  list(query: DirectoryQuery<keyof ResourceRow>, kind?: ResourceKind): Promise<Page<ResourceRow>>
  read(id: string): Promise<Resource>
  blueprints(): Promise<BlueprintCatalog>
  change(id: string, change: Operation<ResourceChange>): Promise<ResourceReceipt | Resource>
  prepareVersion(draft: ResourceVersionDraft): Promise<PreparedResourceVersion>
  reconstruct(target: MaterialTarget): Promise<PreparedMaterial>
}
/** Material exists independently of an upload session or its durable commit. */
export interface PreparedMaterial {
  readonly target: MaterialTarget
  readonly bytes: ArrayBuffer
}
/** Script/configuration bytes are explicit bounded author input. Structured families are encoded by the adapter. */
export interface ResourceVersionDraft {
  readonly resource: string
  readonly operationId: string
  readonly expectedRevision: number
  readonly version: string
  readonly kind: ResourceKind
  readonly variants: readonly Variant[]
  readonly contents: readonly {
    readonly variant: string
    readonly platform: Platform
    readonly architecture: Architecture
    readonly bytes: ArrayBuffer
  }[]
}
export interface PreparedResourceVersion {
  readonly resource: string
  readonly change: Operation<Extract<ResourceChange, { readonly action: 'version' }>>
  readonly materials: readonly PreparedMaterial[]
}
