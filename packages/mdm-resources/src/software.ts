import type { Platform } from '@rss/mdm-devices'
import type { Architecture, Artifact } from './model'

/** Immutable software material; admission, publication and execution have separate owners. */
export interface SoftwareSource {
  readonly id: string
  readonly revision: string
  readonly sha256: readonly number[]
}
export interface SoftwareArtifact extends Artifact {
  readonly origin: string | null
}
export type SoftwareFormat = 'exe' | 'msi' | 'msix' | 'pkg' | 'bundle' | 'winget' | 'brew' | 'dmg'
export type SoftwareScope = 'system' | 'user'
export type SoftwareUpgrade = 'in_place' | 'uninstall_then_install' | 'deny'
export interface NativeInvocation {
  readonly runAs: 'system' | 'logged_in_user'
  readonly arguments: readonly string[]
  readonly environment: Readonly<Record<string, string>>
  readonly timeoutSeconds: number
  readonly outputBytes: number
  readonly exitCodes: { readonly success: readonly number[]; readonly reboot: readonly number[] }
}
export interface SoftwareScript {
  readonly interpreter: 'power_shell7' | 'posix_sh' | 'bash'
  readonly entry: string
  readonly invocation: NativeInvocation
}
export interface NativeRemoval {
  readonly installer: string
  readonly invocation: NativeInvocation
}
export type SoftwareDetection =
  | { readonly kind: 'msi_product'; readonly productCode: string; readonly version: string }
  | { readonly kind: 'pkg_receipt'; readonly receipt: string; readonly version: string }
  | {
      readonly kind: 'registry'
      readonly scope: SoftwareScope
      readonly key: string
      readonly value: string
      readonly version: string
    }
  | {
      readonly kind: 'file'
      readonly scope: SoftwareScope
      readonly path: string
      readonly version: string
      readonly sha256: readonly number[]
    }
  | { readonly kind: 'script'; readonly command: SoftwareScript }
export interface NativeSoftware {
  readonly installer: string
  readonly scope: SoftwareScope
  readonly install: NativeInvocation
  readonly upgradeInvocation: NativeInvocation
  readonly upgrade: SoftwareUpgrade
  readonly uninstall: NativeRemoval | null
  readonly detect: SoftwareDetection
}
export interface BundleManifest {
  readonly schema: 1
  readonly platform: Platform
  readonly architecture: Architecture
  readonly entries: Readonly<
    Record<string, { readonly length: number; readonly sha256: readonly number[] }>
  >
}
export interface MsixIdentity {
  readonly name: string
  readonly publisher: string
  readonly version: readonly [number, number, number, number]
  readonly architecture: Architecture | 'neutral'
  readonly resourceId: string
}
export interface MsixMember {
  readonly path: string
  readonly identity: MsixIdentity
  readonly length: number
  readonly sha256: readonly number[]
}
export type MsixContainer =
  | { readonly kind: 'package'; readonly installer: string }
  | { readonly kind: 'bundle'; readonly installer: string; readonly members: readonly MsixMember[] }
export type SoftwareUser =
  | { readonly kind: 'active_interactive' }
  | { readonly kind: 'exact'; readonly identity: string }
export type MsixDeployment =
  | { readonly kind: 'target_user_registration'; readonly target: SoftwareUser }
  | { readonly kind: 'device_provisioning' }
export type DmgPayload =
  | {
      readonly kind: 'app_copy'
      readonly application: {
        readonly path: string
        readonly bundleId: string
        readonly version: string
        readonly targetName: string
      }
      readonly uninstall: boolean
    }
  | {
      readonly kind: 'contained_pkg'
      readonly path: string
      readonly length: number
      readonly sha256: readonly number[]
      readonly receipt: string
      readonly uninstall: NativeRemoval | null
    }
export type SoftwareBehavior =
  | ({ readonly kind: 'msi' | 'pkg' | 'winget' | 'brew' } & NativeSoftware)
  | ({ readonly kind: 'exe'; readonly layout: Readonly<Record<string, string>> } & NativeSoftware)
  | {
      readonly kind: 'bundle'
      readonly archive: string
      readonly manifest: BundleManifest
      readonly install: SoftwareScript
      readonly uninstall: SoftwareScript | null
      readonly detect: SoftwareDetection
    }
  | {
      readonly kind: 'dmg'
      readonly image: string
      readonly volume: string
      readonly scope: SoftwareScope
      readonly invocation: NativeInvocation
      readonly upgrade: SoftwareUpgrade
      readonly payload: DmgPayload
    }
  | {
      readonly kind: 'msix'
      readonly container: MsixContainer
      readonly identity: MsixIdentity
      readonly dependencies: readonly MsixIdentity[]
      readonly deployment: MsixDeployment
      readonly minimumOs: readonly [number, number, number, number]
      readonly requireSideload: boolean
      readonly allowUnsigned: boolean
      readonly uninstall: boolean
      readonly invocation: NativeInvocation
      readonly upgrade: SoftwareUpgrade
    }
export type SoftwareProvenance =
  | { readonly kind: 'private' }
  | {
      readonly kind: 'imported'
      readonly snapshot: string
      readonly converter: string
      readonly files: readonly { readonly path: string; readonly content: SoftwareArtifact }[]
    }
export interface SoftwareSignature {
  readonly evidence: SoftwareArtifact | null
  readonly artifact: string
  readonly mechanism: 'authenticode' | 'apple_developer_id' | 'msix'
  readonly publisher: string
}
export type BrewExport =
  | { readonly kind: 'cask'; readonly path: string; readonly receipts: readonly string[] }
  | {
      readonly kind: 'bottle'
      readonly artifact: string
      readonly source: string
      readonly tag: string
      readonly cellar: string
      readonly revision: number
      readonly rebuild: number
      readonly executable: string
    }
export type SoftwareExport =
  | { readonly kind: 'disabled' }
  | {
      readonly kind: 'winget'
      readonly locale: string
      readonly name: string
      readonly publisher: string
      readonly description: string
      readonly license: string
    }
  | {
      readonly kind: 'brew'
      readonly name: string
      readonly description: string
      readonly homepage: string
      readonly payload: BrewExport
    }
export interface SoftwareDefinition {
  readonly source: SoftwareSource
  readonly package: string
  readonly version: string
  readonly provenance: SoftwareProvenance
  readonly artifacts: Readonly<Record<string, SoftwareArtifact>>
  readonly material: {
    readonly bundleId: string | null
    readonly format: SoftwareFormat
    readonly installer: string
  }
  readonly behavior: SoftwareBehavior | null
  readonly signatures: readonly SoftwareSignature[]
  readonly reboot: 'forbid' | 'report'
  readonly downgrade: 'deny' | 'allow'
  readonly dependencies: readonly {
    readonly resource: string
    readonly version: string
    readonly sha256: readonly number[]
  }[]
  readonly export: SoftwareExport
}
