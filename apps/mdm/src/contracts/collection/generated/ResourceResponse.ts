/* Generated from Collection.json. Do not edit. */

export type ResourceResponse = ResourceRead | ResourceReceipt
export type Architecture = 'x86_64' | 'aarch64'
export type Declaration =
  | {
      definition: SoftwareDefinition
      kind: 'software'
    }
  | {
      artifact: Artifact
      definition: ScriptDefinition
      kind: 'script'
    }
  | {
      artifact: Artifact
      definition: AgentCollectionDefinition
      kind: 'agent_collection'
    }
  | {
      artifact: Artifact
      definition: TelemetryProfile
      kind: 'telemetry_profile'
    }
  | {
      artifact: Artifact
      definition: NativeCollectionDefinition
      kind: 'native_collection'
    }
  | {
      artifact: Artifact
      kind: 'configuration'
    }
/**
 * Single source of native dispatch and format-specific fields.
 */
export type SoftwareBehavior =
  | {
      /**
       * Independent observation of effect.
       */
      detect:
        | {
            kind: 'msi_product'
            /**
             * Canonical braced product GUID.
             */
            productCode: string
            /**
             * Exact observed version.
             */
            version: string
          }
        | {
            kind: 'pkg_receipt'
            /**
             * Receipt identifier.
             */
            receipt: string
            /**
             * Exact receipt version.
             */
            version: string
          }
        | {
            /**
             * Relative registry key, never an uninstall command.
             */
            key: string
            kind: 'registry'
            /**
             * Native hive scope.
             */
            scope: 'system' | 'user'
            /**
             * Exact value name.
             */
            value: string
            /**
             * Expected ecosystem version.
             */
            version: string
          }
        | {
            kind: 'file'
            /**
             * Exact target path under the controlled install scope.
             */
            path: string
            /**
             * Scope of the protected target.
             */
            scope: 'system' | 'user'
            /**
             * Expected complete file digest.
             *
             * @minItems 32
             * @maxItems 32
             */
            sha256: number[]
            /**
             * Expected version.
             */
            version: string
          }
        | {
            command: SoftwareScript
            kind: 'script'
          }
      install: NativeInvocation1
      /**
       * Installer artifact key.
       */
      installer: string
      kind: 'msi'
      /**
       * Actual installation scope.
       */
      scope: 'system' | 'user'
      /**
       * Absent means removal is unsupported, never guessed.
       */
      uninstall: NativeRemoval | null
      /**
       * Explicit upgrade policy.
       */
      upgrade: 'in_place' | 'uninstall_then_install' | 'deny'
      upgradeInvocation: NativeInvocation3
    }
  | {
      /**
       * Independent observation of effect.
       */
      detect:
        | {
            kind: 'msi_product'
            /**
             * Canonical braced product GUID.
             */
            productCode: string
            /**
             * Exact observed version.
             */
            version: string
          }
        | {
            kind: 'pkg_receipt'
            /**
             * Receipt identifier.
             */
            receipt: string
            /**
             * Exact receipt version.
             */
            version: string
          }
        | {
            /**
             * Relative registry key, never an uninstall command.
             */
            key: string
            kind: 'registry'
            /**
             * Native hive scope.
             */
            scope: 'system' | 'user'
            /**
             * Exact value name.
             */
            value: string
            /**
             * Expected ecosystem version.
             */
            version: string
          }
        | {
            kind: 'file'
            /**
             * Exact target path under the controlled install scope.
             */
            path: string
            /**
             * Scope of the protected target.
             */
            scope: 'system' | 'user'
            /**
             * Expected complete file digest.
             *
             * @minItems 32
             * @maxItems 32
             */
            sha256: number[]
            /**
             * Expected version.
             */
            version: string
          }
        | {
            command: SoftwareScript
            kind: 'script'
          }
      install: NativeInvocation4
      /**
       * Installer artifact key.
       */
      installer: string
      kind: 'pkg'
      /**
       * Actual installation scope.
       */
      scope: 'system' | 'user'
      /**
       * Absent means removal is unsupported, never guessed.
       */
      uninstall: NativeRemoval | null
      /**
       * Explicit upgrade policy.
       */
      upgrade: 'in_place' | 'uninstall_then_install' | 'deny'
      upgradeInvocation: NativeInvocation5
    }
  | {
      /**
       * ZIP artifact key.
       */
      archive: string
      /**
       * Independent effect observation.
       */
      detect:
        | {
            kind: 'msi_product'
            /**
             * Canonical braced product GUID.
             */
            productCode: string
            /**
             * Exact observed version.
             */
            version: string
          }
        | {
            kind: 'pkg_receipt'
            /**
             * Receipt identifier.
             */
            receipt: string
            /**
             * Exact receipt version.
             */
            version: string
          }
        | {
            /**
             * Relative registry key, never an uninstall command.
             */
            key: string
            kind: 'registry'
            /**
             * Native hive scope.
             */
            scope: 'system' | 'user'
            /**
             * Exact value name.
             */
            value: string
            /**
             * Expected ecosystem version.
             */
            version: string
          }
        | {
            kind: 'file'
            /**
             * Exact target path under the controlled install scope.
             */
            path: string
            /**
             * Scope of the protected target.
             */
            scope: 'system' | 'user'
            /**
             * Expected complete file digest.
             *
             * @minItems 32
             * @maxItems 32
             */
            sha256: number[]
            /**
             * Expected version.
             */
            version: string
          }
        | {
            command: SoftwareScript
            kind: 'script'
          }
      install: SoftwareScript1
      kind: 'bundle'
      manifest: BundleManifest
      /**
       * Frozen removal entry, when supported.
       */
      uninstall: SoftwareScript2 | null
    }
  | {
      /**
       * Independent observation of effect.
       */
      detect:
        | {
            kind: 'msi_product'
            /**
             * Canonical braced product GUID.
             */
            productCode: string
            /**
             * Exact observed version.
             */
            version: string
          }
        | {
            kind: 'pkg_receipt'
            /**
             * Receipt identifier.
             */
            receipt: string
            /**
             * Exact receipt version.
             */
            version: string
          }
        | {
            /**
             * Relative registry key, never an uninstall command.
             */
            key: string
            kind: 'registry'
            /**
             * Native hive scope.
             */
            scope: 'system' | 'user'
            /**
             * Exact value name.
             */
            value: string
            /**
             * Expected ecosystem version.
             */
            version: string
          }
        | {
            kind: 'file'
            /**
             * Exact target path under the controlled install scope.
             */
            path: string
            /**
             * Scope of the protected target.
             */
            scope: 'system' | 'user'
            /**
             * Expected complete file digest.
             *
             * @minItems 32
             * @maxItems 32
             */
            sha256: number[]
            /**
             * Expected version.
             */
            version: string
          }
        | {
            command: SoftwareScript
            kind: 'script'
          }
      install: NativeInvocation6
      /**
       * Installer artifact key.
       */
      installer: string
      kind: 'winget'
      /**
       * Actual installation scope.
       */
      scope: 'system' | 'user'
      /**
       * Absent means removal is unsupported, never guessed.
       */
      uninstall: NativeRemoval | null
      /**
       * Explicit upgrade policy.
       */
      upgrade: 'in_place' | 'uninstall_then_install' | 'deny'
      upgradeInvocation: NativeInvocation7
    }
  | {
      /**
       * Independent observation of effect.
       */
      detect:
        | {
            kind: 'msi_product'
            /**
             * Canonical braced product GUID.
             */
            productCode: string
            /**
             * Exact observed version.
             */
            version: string
          }
        | {
            kind: 'pkg_receipt'
            /**
             * Receipt identifier.
             */
            receipt: string
            /**
             * Exact receipt version.
             */
            version: string
          }
        | {
            /**
             * Relative registry key, never an uninstall command.
             */
            key: string
            kind: 'registry'
            /**
             * Native hive scope.
             */
            scope: 'system' | 'user'
            /**
             * Exact value name.
             */
            value: string
            /**
             * Expected ecosystem version.
             */
            version: string
          }
        | {
            kind: 'file'
            /**
             * Exact target path under the controlled install scope.
             */
            path: string
            /**
             * Scope of the protected target.
             */
            scope: 'system' | 'user'
            /**
             * Expected complete file digest.
             *
             * @minItems 32
             * @maxItems 32
             */
            sha256: number[]
            /**
             * Expected version.
             */
            version: string
          }
        | {
            command: SoftwareScript
            kind: 'script'
          }
      install: NativeInvocation8
      /**
       * Installer artifact key.
       */
      installer: string
      kind: 'brew'
      /**
       * Actual installation scope.
       */
      scope: 'system' | 'user'
      /**
       * Absent means removal is unsupported, never guessed.
       */
      uninstall: NativeRemoval | null
      /**
       * Explicit upgrade policy.
       */
      upgrade: 'in_place' | 'uninstall_then_install' | 'deny'
      upgradeInvocation: NativeInvocation9
    }
  | {
      /**
       * Independent identity/version detector.
       */
      detect:
        | {
            kind: 'msi_product'
            /**
             * Canonical braced product GUID.
             */
            productCode: string
            /**
             * Exact observed version.
             */
            version: string
          }
        | {
            kind: 'pkg_receipt'
            /**
             * Receipt identifier.
             */
            receipt: string
            /**
             * Exact receipt version.
             */
            version: string
          }
        | {
            /**
             * Relative registry key, never an uninstall command.
             */
            key: string
            kind: 'registry'
            /**
             * Native hive scope.
             */
            scope: 'system' | 'user'
            /**
             * Exact value name.
             */
            value: string
            /**
             * Expected ecosystem version.
             */
            version: string
          }
        | {
            kind: 'file'
            /**
             * Exact target path under the controlled install scope.
             */
            path: string
            /**
             * Scope of the protected target.
             */
            scope: 'system' | 'user'
            /**
             * Expected complete file digest.
             *
             * @minItems 32
             * @maxItems 32
             */
            sha256: number[]
            /**
             * Expected version.
             */
            version: string
          }
        | {
            command: SoftwareScript
            kind: 'script'
          }
      install: NativeInvocation10
      /**
       * Approved EXE installer key.
       */
      installer: string
      kind: 'exe'
      /**
       * Staging relative path to artifact key; no runtime downloads are authorized.
       */
      layout: {
        [k: string]: string
      }
      /**
       * Explicit system/user installation scope.
       */
      scope: 'system' | 'user'
      /**
       * Explicit removal installer and invocation.
       */
      uninstall: NativeRemoval | null
      /**
       * Approved replacement sequence.
       */
      upgrade: 'in_place' | 'uninstall_then_install' | 'deny'
      upgradeInvocation: NativeInvocation11
    }
  | {
      /**
       * Image artifact key.
       */
      image: string
      invocation: NativeInvocation12
      kind: 'dmg'
      /**
       * Exact selected payload.
       */
      payload:
        | {
            application: MacApplication
            kind: 'app_copy'
            /**
             * Whether an authorized task may remove the declared exact target.
             */
            uninstall: boolean
          }
        | {
            kind: 'contained_pkg'
            /**
             * Full inner PKG byte length.
             */
            length: number
            /**
             * Exact image-relative PKG path.
             */
            path: string
            /**
             * Exact receipt identity.
             */
            receipt: string
            /**
             * Inner PKG content digest.
             *
             * @minItems 32
             * @maxItems 32
             */
            sha256: number[]
            /**
             * Explicit bounded removal PKG artifact, never receipt-forget.
             */
            uninstall: NativeRemoval | null
          }
      /**
       * System or target user's Applications directory.
       */
      scope: 'system' | 'user'
      /**
       * Explicit replacement policy.
       */
      upgrade: 'in_place' | 'uninstall_then_install' | 'deny'
      /**
       * Exact selected volume label; ambiguous multi-volume images are unsupported.
       */
      volume: string
    }
  | {
      /**
       * Hash-only content still needs explicit native unsigned API support if unsigned.
       */
      allowUnsigned: boolean
      /**
       * Frozen package/container bytes.
       */
      container:
        | {
            /**
             * Artifact key.
             */
            installer: string
            kind: 'package'
          }
        | {
            /**
             * Bundle artifact key.
             */
            installer: string
            kind: 'bundle'
            /**
             * Precisely selected members, including one application.
             */
            members: MsixMember[]
          }
      /**
       * Exact installed/provisioned dependency identities; matched to catalog dependencies.
       */
      dependencies: MsixIdentity1[]
      /**
       * Windows package target effect.
       */
      deployment:
        | {
            kind: 'target_user_registration'
            /**
             * Approved user selection.
             */
            target:
              | {
                  kind: 'active_interactive'
                }
              | {
                  /**
                   * Platform-local stable identity.
                   */
                  identity: string
                  kind: 'exact'
                }
          }
        | {
            kind: 'device_provisioning'
          }
      identity: MsixIdentity2
      invocation: NativeInvocation13
      kind: 'msix'
      /**
       * Minimum Windows OS version.
       *
       * @minItems 4
       * @maxItems 4
       */
      minimumOs: number[]
      /**
       * Sideloading must already be permitted; tasks do not enable it.
       */
      requireSideload: boolean
      /**
       * Whether exact removal/deprovisioning is supported.
       */
      uninstall: boolean
      /**
       * Approved update sequence.
       */
      upgrade: 'in_place' | 'uninstall_then_install' | 'deny'
    }
/**
 * An argument destination; values must never be interpolated into source text.
 */
export type ParameterBinding =
  | {
      kind: 'named'
      /**
       * ASCII identifier without a prefix or expression.
       */
      name: string
    }
  | {
      /**
       * Zero-based position, contiguous across the definition.
       */
      index: number
      kind: 'positional'
    }
  | {
      kind: 'environment'
      /**
       * Must begin with `RSS_PARAM_` to exclude interpreter startup variables.
       */
      name: string
    }
/**
 * A bounded single-table SELECT against the product's audited osquery surface.
 */
export type SqlTemplate = string
/**
 * Closed Agent-owned normalization of native cumulative observations.
 */
export type NativeCounterNormalization = 'local_cumulative_v1'
/**
 * Only permissions needed by the explicitly selected application, never a TCC dump.
 */
export type ApplicationPermission = 'full_disk_access' | 'accessibility' | 'screen_capture'
/**
 * Bounded structural filter; property names are never query expressions.
 */
export type WmiFilter =
  | {
      kind: 'compare'
      /**
       * Operator.
       */
      operator: 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge'
      /**
       * Selected property.
       */
      property: string
      /**
       * Literal interpreted by the property's CIM type.
       */
      value: unknown
    }
  | {
      kind: 'and'
      /**
       * Nonempty bounded operands.
       */
      terms: WmiFilter[]
    }
  | {
      kind: 'or'
      /**
       * Nonempty bounded operands.
       */
      terms: WmiFilter[]
    }
export type Platform = 'windows' | 'macos'

export interface ResourceRead {
  id: string
  kind: string
  origin: BlueprintOrigin | null
  presentation: {
    [k: string]: unknown
  }
  revision: number
  versions: ResourceVersion[]
}
export interface BlueprintOrigin {
  blueprint: string
  /**
   * @minItems 32
   * @maxItems 32
   */
  digest: number[]
  version: string
}
export interface ResourceVersion {
  /**
   * @minItems 32
   * @maxItems 32
   */
  digest: number[]
  id: string
  state: string
  variants: Variant[]
}
export interface Variant {
  architecture: Architecture
  declaration: Declaration
  key: string
  platform: Platform
}
/**
 * Validated immutable software. Construction does not grant authority or prove execution.
 */
export interface SoftwareDefinition {
  /**
   * Complete immutable runtime artifact closure.
   */
  artifacts: {
    [k: string]: SoftwareArtifact
  }
  /**
   * Optional complete execution plan; publication does not require one.
   */
  behavior: SoftwareBehavior | null
  /**
   * Exact tenant-local resource prerequisites.
   */
  dependencies: SoftwareDependency[]
  /**
   * Explicit downgrade permission.
   */
  downgrade: 'deny' | 'allow'
  /**
   * Immutable publication metadata; absence of native export is explicit.
   */
  export:
    | {
        kind: 'disabled'
      }
    | {
        /**
         * Short description.
         */
        description: string
        kind: 'winget'
        /**
         * License text/identifier.
         */
        license: string
        /**
         * Default package locale.
         */
        locale: string
        /**
         * Display name.
         */
        name: string
        /**
         * Display publisher, distinct from signature policy.
         */
        publisher: string
      }
    | {
        /**
         * Description.
         */
        description: string
        /**
         * Approved homepage.
         */
        homepage: string
        kind: 'brew'
        /**
         * Display name.
         */
        name: string
        /**
         * Precisely declared native view details.
         */
        payload:
          | {
              kind: 'cask'
              /**
               * Selected image/archive-relative payload.
               */
              path: string
              /**
               * Exact receipt identities for PKG; empty for AppCopy.
               */
              receipts: string[]
            }
          | {
              /**
               * Runtime bottle artifact key.
               */
              artifact: string
              /**
               * Original bottle cellar policy.
               */
              cellar: string
              /**
               * Exact prebuilt executable name.
               */
              executable: string
              kind: 'bottle'
              /**
               * Bottle rebuild.
               */
              rebuild: number
              /**
               * Formula revision.
               */
              revision: number
              /**
               * Original source archive key, retained as material but never built.
               */
              source: string
              /**
               * Exact Homebrew platform tag.
               */
              tag: string
            }
      }
  material: SoftwareMaterial
  /**
   * Exact ecosystem package identity.
   */
  package: string
  /**
   * Raw source materials and converter identity, without a second resource owner.
   */
  provenance:
    | {
        kind: 'private'
      }
    | {
        /**
         * Exact converter identity/version.
         */
        converter: string
        /**
         * Full original selected manifest file set.
         */
        files: SoftwareSourceFile[]
        kind: 'imported'
        /**
         * Fixed commit or digest-qualified REST snapshot.
         */
        snapshot: string
      }
  /**
   * Independently authorized reboot handling.
   */
  reboot: 'forbid' | 'report'
  /**
   * Explicit requirements; an empty list permits unsigned content.
   */
  signatures: SoftwareSignature[]
  source: SoftwareSource
  /**
   * Exact ecosystem version, never a range.
   */
  version: string
}
/**
 * A member of the complete immutable artifact set.
 */
export interface SoftwareArtifact {
  /**
   * Exact positive byte length.
   */
  length: number
  /**
   * Optional immutable import URL; host origin policy must independently authorize it.
   */
  origin: string | null
  /**
   * Opaque content reference, not a download URL.
   */
  reference: string
  /**
   * SHA-256 of the complete bytes.
   *
   * @minItems 32
   * @maxItems 32
   */
  sha256: number[]
}
/**
 * Frozen script and artifact reference.
 */
export interface SoftwareScript {
  /**
   * Artifact key or Bundle member.
   */
  entry: string
  /**
   * Finite interpreter.
   */
  interpreter: 'power_shell7' | 'posix_sh' | 'bash'
  invocation: NativeInvocation
}
/**
 * Literal bounded invocation.
 */
export interface NativeInvocation {
  /**
   * Literal arguments; no shell or mutable registry command.
   */
  arguments: string[]
  /**
   * Product-prefixed environment values.
   */
  environment: {
    [k: string]: string
  }
  exitCodes: ExitCodePolicy
  /**
   * Combined output ceiling.
   */
  outputBytes: number
  /**
   * Process identity, never inferred from installation scope.
   */
  runAs: 'system' | 'logged_in_user'
  /**
   * Wall-time ceiling.
   */
  timeoutSeconds: number
}
/**
 * Explicit return-code classification.
 */
export interface ExitCodePolicy {
  /**
   * Successful process completion requiring reboot.
   */
  reboot: number[]
  /**
   * Process success, still requiring independent effect detection.
   */
  success: number[]
}
/**
 * Unattended installation invocation.
 */
export interface NativeInvocation1 {
  /**
   * Literal arguments; no shell or mutable registry command.
   */
  arguments: string[]
  /**
   * Product-prefixed environment values.
   */
  environment: {
    [k: string]: string
  }
  exitCodes: ExitCodePolicy
  /**
   * Combined output ceiling.
   */
  outputBytes: number
  /**
   * Process identity, never inferred from installation scope.
   */
  runAs: 'system' | 'logged_in_user'
  /**
   * Wall-time ceiling.
   */
  timeoutSeconds: number
}
/**
 * Native removal executes an explicitly approved artifact, never a discovered path.
 */
export interface NativeRemoval {
  /**
   * Artifact key of the approved removal installer.
   */
  installer: string
  invocation: NativeInvocation2
}
/**
 * Removal-specific literal parameters and return codes.
 */
export interface NativeInvocation2 {
  /**
   * Literal arguments; no shell or mutable registry command.
   */
  arguments: string[]
  /**
   * Product-prefixed environment values.
   */
  environment: {
    [k: string]: string
  }
  exitCodes: ExitCodePolicy
  /**
   * Combined output ceiling.
   */
  outputBytes: number
  /**
   * Process identity, never inferred from installation scope.
   */
  runAs: 'system' | 'logged_in_user'
  /**
   * Wall-time ceiling.
   */
  timeoutSeconds: number
}
/**
 * Separately approved upgrade invocation and return-code policy.
 */
export interface NativeInvocation3 {
  /**
   * Literal arguments; no shell or mutable registry command.
   */
  arguments: string[]
  /**
   * Product-prefixed environment values.
   */
  environment: {
    [k: string]: string
  }
  exitCodes: ExitCodePolicy
  /**
   * Combined output ceiling.
   */
  outputBytes: number
  /**
   * Process identity, never inferred from installation scope.
   */
  runAs: 'system' | 'logged_in_user'
  /**
   * Wall-time ceiling.
   */
  timeoutSeconds: number
}
/**
 * Unattended installation invocation.
 */
export interface NativeInvocation4 {
  /**
   * Literal arguments; no shell or mutable registry command.
   */
  arguments: string[]
  /**
   * Product-prefixed environment values.
   */
  environment: {
    [k: string]: string
  }
  exitCodes: ExitCodePolicy
  /**
   * Combined output ceiling.
   */
  outputBytes: number
  /**
   * Process identity, never inferred from installation scope.
   */
  runAs: 'system' | 'logged_in_user'
  /**
   * Wall-time ceiling.
   */
  timeoutSeconds: number
}
/**
 * Separately approved upgrade invocation and return-code policy.
 */
export interface NativeInvocation5 {
  /**
   * Literal arguments; no shell or mutable registry command.
   */
  arguments: string[]
  /**
   * Product-prefixed environment values.
   */
  environment: {
    [k: string]: string
  }
  exitCodes: ExitCodePolicy
  /**
   * Combined output ceiling.
   */
  outputBytes: number
  /**
   * Process identity, never inferred from installation scope.
   */
  runAs: 'system' | 'logged_in_user'
  /**
   * Wall-time ceiling.
   */
  timeoutSeconds: number
}
/**
 * Frozen install entry.
 */
export interface SoftwareScript1 {
  /**
   * Artifact key or Bundle member.
   */
  entry: string
  /**
   * Finite interpreter.
   */
  interpreter: 'power_shell7' | 'posix_sh' | 'bash'
  invocation: NativeInvocation
}
/**
 * Exact complete manifest.
 */
export interface BundleManifest {
  /**
   * Exact target architecture.
   */
  architecture: 'x86_64' | 'aarch64'
  /**
   * Relative slash-separated regular-file members, excluding manifest.json.
   */
  entries: {
    [k: string]: BundleEntry
  }
  /**
   * Exact target platform.
   */
  platform: 'windows' | 'macos'
  /**
   * Must be 1. Unknown versions are rejected.
   */
  schema: number
}
/**
 * Every ZIP member other than manifest.json is declared here.
 */
export interface BundleEntry {
  /**
   * Exact uncompressed length; empty payload files are allowed.
   */
  length: number
  /**
   * SHA-256 of uncompressed bytes.
   *
   * @minItems 32
   * @maxItems 32
   */
  sha256: number[]
}
/**
 * Approved bounded script, with a declared immutable entry.
 */
export interface SoftwareScript2 {
  /**
   * Artifact key or Bundle member.
   */
  entry: string
  /**
   * Finite interpreter.
   */
  interpreter: 'power_shell7' | 'posix_sh' | 'bash'
  invocation: NativeInvocation
}
/**
 * Unattended installation invocation.
 */
export interface NativeInvocation6 {
  /**
   * Literal arguments; no shell or mutable registry command.
   */
  arguments: string[]
  /**
   * Product-prefixed environment values.
   */
  environment: {
    [k: string]: string
  }
  exitCodes: ExitCodePolicy
  /**
   * Combined output ceiling.
   */
  outputBytes: number
  /**
   * Process identity, never inferred from installation scope.
   */
  runAs: 'system' | 'logged_in_user'
  /**
   * Wall-time ceiling.
   */
  timeoutSeconds: number
}
/**
 * Separately approved upgrade invocation and return-code policy.
 */
export interface NativeInvocation7 {
  /**
   * Literal arguments; no shell or mutable registry command.
   */
  arguments: string[]
  /**
   * Product-prefixed environment values.
   */
  environment: {
    [k: string]: string
  }
  exitCodes: ExitCodePolicy
  /**
   * Combined output ceiling.
   */
  outputBytes: number
  /**
   * Process identity, never inferred from installation scope.
   */
  runAs: 'system' | 'logged_in_user'
  /**
   * Wall-time ceiling.
   */
  timeoutSeconds: number
}
/**
 * Unattended installation invocation.
 */
export interface NativeInvocation8 {
  /**
   * Literal arguments; no shell or mutable registry command.
   */
  arguments: string[]
  /**
   * Product-prefixed environment values.
   */
  environment: {
    [k: string]: string
  }
  exitCodes: ExitCodePolicy
  /**
   * Combined output ceiling.
   */
  outputBytes: number
  /**
   * Process identity, never inferred from installation scope.
   */
  runAs: 'system' | 'logged_in_user'
  /**
   * Wall-time ceiling.
   */
  timeoutSeconds: number
}
/**
 * Separately approved upgrade invocation and return-code policy.
 */
export interface NativeInvocation9 {
  /**
   * Literal arguments; no shell or mutable registry command.
   */
  arguments: string[]
  /**
   * Product-prefixed environment values.
   */
  environment: {
    [k: string]: string
  }
  exitCodes: ExitCodePolicy
  /**
   * Combined output ceiling.
   */
  outputBytes: number
  /**
   * Process identity, never inferred from installation scope.
   */
  runAs: 'system' | 'logged_in_user'
  /**
   * Wall-time ceiling.
   */
  timeoutSeconds: number
}
/**
 * Unattended installation; no default /S or /silent.
 */
export interface NativeInvocation10 {
  /**
   * Literal arguments; no shell or mutable registry command.
   */
  arguments: string[]
  /**
   * Product-prefixed environment values.
   */
  environment: {
    [k: string]: string
  }
  exitCodes: ExitCodePolicy
  /**
   * Combined output ceiling.
   */
  outputBytes: number
  /**
   * Process identity, never inferred from installation scope.
   */
  runAs: 'system' | 'logged_in_user'
  /**
   * Wall-time ceiling.
   */
  timeoutSeconds: number
}
/**
 * Separately approved upgrade invocation and return-code policy.
 */
export interface NativeInvocation11 {
  /**
   * Literal arguments; no shell or mutable registry command.
   */
  arguments: string[]
  /**
   * Product-prefixed environment values.
   */
  environment: {
    [k: string]: string
  }
  exitCodes: ExitCodePolicy
  /**
   * Combined output ceiling.
   */
  outputBytes: number
  /**
   * Process identity, never inferred from installation scope.
   */
  runAs: 'system' | 'logged_in_user'
  /**
   * Wall-time ceiling.
   */
  timeoutSeconds: number
}
/**
 * Approved operation identity and budgets.
 */
export interface NativeInvocation12 {
  /**
   * Literal arguments; no shell or mutable registry command.
   */
  arguments: string[]
  /**
   * Product-prefixed environment values.
   */
  environment: {
    [k: string]: string
  }
  exitCodes: ExitCodePolicy
  /**
   * Combined output ceiling.
   */
  outputBytes: number
  /**
   * Process identity, never inferred from installation scope.
   */
  runAs: 'system' | 'logged_in_user'
  /**
   * Wall-time ceiling.
   */
  timeoutSeconds: number
}
/**
 * Full declared app material.
 */
export interface MacApplication {
  /**
   * Bundle identifier.
   */
  bundleId: string
  /**
   * Exact payload relative path within the selected image volume.
   */
  path: string
  /**
   * Exact .app basename in the selected Applications directory.
   */
  targetName: string
  /**
   * Exact bundle version.
   */
  version: string
}
/**
 * Frozen .msixbundle member and its complete bytes.
 */
export interface MsixMember {
  identity: MsixIdentity
  /**
   * Member byte length.
   */
  length: number
  /**
   * Exact relative container member path.
   */
  path: string
  /**
   * Member digest.
   *
   * @minItems 32
   * @maxItems 32
   */
  sha256: number[]
}
/**
 * Exact package identity.
 */
export interface MsixIdentity {
  /**
   * Selected processor architecture.
   */
  architecture: 'x86_64' | 'aarch64' | 'neutral'
  /**
   * Manifest Name.
   */
  name: string
  /**
   * Exact manifest Publisher DN; not a generic display publisher.
   */
  publisher: string
  /**
   * Exact resource identity; empty denotes the application package.
   */
  resourceId: string
  /**
   * Exact four-part package version.
   *
   * @minItems 4
   * @maxItems 4
   */
  version: number[]
}
/**
 * MSIX identity uses Windows' own version and Publisher semantics.
 */
export interface MsixIdentity1 {
  /**
   * Selected processor architecture.
   */
  architecture: 'x86_64' | 'aarch64' | 'neutral'
  /**
   * Manifest Name.
   */
  name: string
  /**
   * Exact manifest Publisher DN; not a generic display publisher.
   */
  publisher: string
  /**
   * Exact resource identity; empty denotes the application package.
   */
  resourceId: string
  /**
   * Exact four-part package version.
   *
   * @minItems 4
   * @maxItems 4
   */
  version: number[]
}
/**
 * MSIX identity uses Windows' own version and Publisher semantics.
 */
export interface MsixIdentity2 {
  /**
   * Selected processor architecture.
   */
  architecture: 'x86_64' | 'aarch64' | 'neutral'
  /**
   * Manifest Name.
   */
  name: string
  /**
   * Exact manifest Publisher DN; not a generic display publisher.
   */
  publisher: string
  /**
   * Exact resource identity; empty denotes the application package.
   */
  resourceId: string
  /**
   * Exact four-part package version.
   *
   * @minItems 4
   * @maxItems 4
   */
  version: number[]
}
/**
 * Frozen runtime identity and budgets; deployment does not accept arbitrary switches.
 */
export interface NativeInvocation13 {
  /**
   * Literal arguments; no shell or mutable registry command.
   */
  arguments: string[]
  /**
   * Product-prefixed environment values.
   */
  environment: {
    [k: string]: string
  }
  exitCodes: ExitCodePolicy
  /**
   * Combined output ceiling.
   */
  outputBytes: number
  /**
   * Process identity, never inferred from installation scope.
   */
  runAs: 'system' | 'logged_in_user'
  /**
   * Wall-time ceiling.
   */
  timeoutSeconds: number
}
/**
 * Exact same-tenant dependency; graph validation occurs under product resource locks.
 */
export interface SoftwareDependency {
  /**
   * Resource identity in this version's tenant.
   */
  resource: string
  /**
   * Expected complete resource digest.
   *
   * @minItems 32
   * @maxItems 32
   */
  sha256: number[]
  /**
   * Exact immutable resource version.
   */
  version: string
}
/**
 * Required installation material.
 */
export interface SoftwareMaterial {
  /**
   * Observed application bundle identity for native PKG deployment, when available.
   */
  bundle_id: string | null
  /**
   * Native/source format; does not assert that installation is permitted by the OS.
   */
  format: 'exe' | 'msi' | 'msix' | 'pkg' | 'bundle' | 'winget' | 'brew' | 'dmg'
  /**
   * Primary artifact key.
   */
  installer: string
}
/**
 * Raw material retained by the existing content owner.
 */
export interface SoftwareSourceFile {
  content: SoftwareArtifact1
  /**
   * Exact source-relative path.
   */
  path: string
}
/**
 * A member of the complete immutable artifact set.
 */
export interface SoftwareArtifact1 {
  /**
   * Exact positive byte length.
   */
  length: number
  /**
   * Optional immutable import URL; host origin policy must independently authorize it.
   */
  origin: string | null
  /**
   * Opaque content reference, not a download URL.
   */
  reference: string
  /**
   * SHA-256 of the complete bytes.
   *
   * @minItems 32
   * @maxItems 32
   */
  sha256: number[]
}
/**
 * Signature checks are opt-in and bound to complete approved material.
 */
export interface SoftwareSignature {
  /**
   * Runtime artifact key to which the check applies.
   */
  artifact: string
  /**
   * Immutable reviewed platform verification report, bound to these exact installer bytes.
   */
  evidence: SoftwareArtifact | null
  /**
   * Required platform trust mechanism.
   */
  mechanism: 'authenticode' | 'apple_developer_id' | 'msix'
  /**
   * Exact Publisher/Team ID policy value.
   */
  publisher: string
}
/**
 * Exact approved source revision.
 */
export interface SoftwareSource {
  /**
   * Tenant-local source identity.
   */
  id: string
  /**
   * Exact source revision, never latest.
   */
  revision: string
  /**
   * Digest of the credential-free source snapshot.
   *
   * @minItems 32
   * @maxItems 32
   */
  sha256: number[]
}
export interface Artifact {
  length: number
  reference: string
  /**
   * @minItems 32
   * @maxItems 32
   */
  sha256: number[]
}
/**
 * Validated immutable execution interface; deserialization uses the same constructor.
 */
export interface ScriptDefinition {
  /**
   * Exactly one destination for every declared parameter.
   */
  bindings: {
    [k: string]: ParameterBinding
  }
  /**
   * Exact artifact/output encoding.
   */
  encoding: 'utf8'
  /**
   * Output row limit, from 1 to 1000.
   */
  maxRows: number
  /**
   * Self-contained JSON Schema draft 2020-12 for successful output.
   */
  output: unknown
  /**
   * Combined output budget, from 1 to 1 MiB.
   */
  outputBytes: number
  /**
   * Self-contained JSON Schema draft 2020-12 for the argument object.
   */
  parameters: unknown
  /**
   * Selected executor profile.
   */
  profile: 'power_shell7' | 'posix_sh' | 'bash' | 'osquery'
  /**
   * Purpose and optional collection field mapping.
   */
  purpose:
    | {
        kind: 'action'
      }
    | {
        applicability: Applicability
        kind: 'collection'
        /**
         * JSON pointers into the validated output, keyed by published inventory field identities.
         */
        mappings: {
          [k: string]: ValueMapping
        }
        /**
         * Exact immutable collection namespace.
         */
        scope:
          | {
              kind: 'device'
            }
          | {
              /**
               * Stable account identity.
               */
              identity: string
              kind: 'user'
            }
          | {
              /**
               * Stable provider identity.
               */
              identity: string
              kind: 'source'
            }
          | {
              /**
               * Stable volume identity.
               */
              identity: string
              kind: 'volume'
            }
          | {
              kind: 'prefix'
              /**
               * Exact path prefix.
               */
              path: string
            }
      }
  /**
   * Required execution identity.
   */
  runAs: 'system' | 'logged_in_user'
  /**
   * SQL template only for the osquery profile; literal parameters remain separate.
   */
  sql: SqlTemplate | null
  /**
   * Execution wall-time limit, from 1 to 3600 seconds.
   */
  timeoutSeconds: number
}
/**
 * Exact additional endpoint prerequisites.
 */
export interface Applicability {
  /**
   * Required current executor capabilities.
   */
  capabilities: string[]
  /**
   * Exact admitted edition identifiers; empty means unconstrained.
   */
  editions: string[]
  /**
   * Exact enrollment modes; empty means unconstrained.
   */
  enrollments: string[]
  /**
   * Inclusive minimum OS build.
   */
  minimumBuild: number | null
  /**
   * Inclusive minimum numeric OS version.
   */
  minimumOsVersion: string | null
  /**
   * Required minimum tool versions, e.g. osquery 5.23.1.
   */
  tools: {
    [k: string]: string
  }
}
/**
 * Extraction relative to a response or list item. Empty pointer selects the whole value.
 */
export interface ValueMapping {
  /**
   * Exact output properties for each array item. No undeclared attributes are copied.
   */
  columns: {
    [k: string]: ValueMapping
  }
  /**
   * Conversion of a direct scalar; structured projections require identity.
   */
  conversion:
    | {
        kind: 'identity'
      }
    | {
        kind: 'cim_time'
      }
    | {
        kind: 'integer'
      }
    | {
        kind: 'number'
      }
    | {
        kind: 'enum'
        /**
         * Finite exact source tokens. Unknown tokens are invalid.
         */
        values: {
          [k: string]: unknown
        }
      }
    | {
        /**
         * Value when absent from the complete set.
         */
        absent: unknown
        kind: 'array_member'
        /**
         * Exact native enum member.
         */
        member: number
        /**
         * Value when present in the complete set.
         */
        present: unknown
      }
    | {
        /**
         * Nonzero denominator; fractional output is rejected.
         */
        denominator: number
        kind: 'scale'
        /**
         * Numerator.
         */
        numerator: number
      }
    | {
        /**
         * Keys are decimal single-bit masks. Undeclared set bits are invalid.
         */
        flags: {
          [k: string]: string
        }
        kind: 'bitmask'
      }
  /**
   * RFC 6901 pointer, never an expression.
   */
  pointer: string
}
/**
 * Validated declaration with an immutable canonical artifact.
 */
export interface AgentCollectionDefinition {
  applicability: Applicability1
  /**
   * Unique field bindings, resolved against Inventory at publication.
   */
  mappings: {
    [k: string]: AgentCollectionMapping
  }
  plan: NativeCollectionPlan
}
/**
 * Frozen platform prerequisites, checked by the same preview/Offer/Start admission.
 */
export interface Applicability1 {
  /**
   * Required current executor capabilities.
   */
  capabilities: string[]
  /**
   * Exact admitted edition identifiers; empty means unconstrained.
   */
  editions: string[]
  /**
   * Exact enrollment modes; empty means unconstrained.
   */
  enrollments: string[]
  /**
   * Inclusive minimum OS build.
   */
  minimumBuild: number | null
  /**
   * Inclusive minimum numeric OS version.
   */
  minimumOsVersion: string | null
  /**
   * Required minimum tool versions, e.g. osquery 5.23.1.
   */
  tools: {
    [k: string]: string
  }
}
/**
 * One field binds to one reusable query.
 */
export interface AgentCollectionMapping {
  /**
   * Explicit telemetry-only durable counter normalization.
   */
  counterNormalization?: NativeCounterNormalization | null
  mapping: ValueMapping1
  /**
   * Explicit handling of complete absence.
   */
  missing: 'missing' | 'null' | 'delete'
  /**
   * Stable query identity.
   */
  query: string
}
/**
 * Existing pointer and conversion semantics.
 */
export interface ValueMapping1 {
  /**
   * Exact output properties for each array item. No undeclared attributes are copied.
   */
  columns: {
    [k: string]: ValueMapping
  }
  /**
   * Conversion of a direct scalar; structured projections require identity.
   */
  conversion:
    | {
        kind: 'identity'
      }
    | {
        kind: 'cim_time'
      }
    | {
        kind: 'integer'
      }
    | {
        kind: 'number'
      }
    | {
        kind: 'enum'
        /**
         * Finite exact source tokens. Unknown tokens are invalid.
         */
        values: {
          [k: string]: unknown
        }
      }
    | {
        /**
         * Value when absent from the complete set.
         */
        absent: unknown
        kind: 'array_member'
        /**
         * Exact native enum member.
         */
        member: number
        /**
         * Value when present in the complete set.
         */
        present: unknown
      }
    | {
        /**
         * Nonzero denominator; fractional output is rejected.
         */
        denominator: number
        kind: 'scale'
        /**
         * Numerator.
         */
        numerator: number
      }
    | {
        /**
         * Keys are decimal single-bit masks. Undeclared set bits are invalid.
         */
        flags: {
          [k: string]: string
        }
        kind: 'bitmask'
      }
  /**
   * RFC 6901 pointer, never an expression.
   */
  pointer: string
}
/**
 * Immutable native execution plan.
 */
export interface NativeCollectionPlan {
  budget: NativeBudget
  /**
   * Stable query IDs, executed once each.
   */
  queries: {
    [k: string]: NativeQuery
  }
  /**
   * Namespace of facts, independent of Policy target scope.
   */
  scope:
    | {
        kind: 'device'
      }
    | {
        /**
         * Stable account identity.
         */
        identity: string
        kind: 'user'
      }
    | {
        /**
         * Stable provider identity.
         */
        identity: string
        kind: 'source'
      }
    | {
        /**
         * Stable volume identity.
         */
        identity: string
        kind: 'volume'
      }
    | {
        kind: 'prefix'
        /**
         * Exact path prefix.
         */
        path: string
      }
  /**
   * Exact native plan format.
   */
  version: number
}
/**
 * Cumulative execution bounds.
 */
export interface NativeBudget {
  /**
   * Maximum rows.
   */
  maxRows: number
  /**
   * Canonical result byte bound.
   */
  outputBytes: number
  /**
   * Wall-clock bound.
   */
  timeoutSeconds: number
}
/**
 * One frozen query, reusable by several server-side field mappings.
 */
export interface NativeQuery {
  budget: NativeBudget1
  /**
   * Row semantics.
   */
  cardinality: 'exactly_one' | 'list'
  /**
   * Read recipe.
   */
  definition:
    | {
        kind: 'windows_performance'
        /**
         * Closed section and canonical output shape.
         */
        section: 'cpu' | 'memory' | 'file_systems' | 'network'
      }
    | {
        kind: 'macos_performance'
        /**
         * Closed section and canonical output shape.
         */
        section: 'cpu' | 'memory' | 'file_systems' | 'network'
      }
    | {
        kind: 'system'
        /**
         * Closed read recipe.
         */
        query:
          | {
              kind: 'windows_bitlocker'
            }
          | {
              kind: 'windows_firewall'
            }
          | {
              kind: 'windows_defender'
            }
          | {
              kind: 'windows_secure_boot'
            }
          | {
              kind: 'windows_join'
            }
          | {
              kind: 'windows_accounts'
              /**
               * Closed evidence section.
               */
              section: 'accounts' | 'administrators' | 'sessions'
              /**
               * Approved account universe.
               */
              selection:
                | {
                    kind: 'local'
                  }
                | {
                    /**
                     * Nonempty bounded stable account identities.
                     */
                    identities: string[]
                    kind: 'selected'
                  }
            }
          | {
              kind: 'windows_certificates'
              /**
               * Exact approved store.
               */
              store: 'my' | 'root' | 'ca' | 'trusted_publisher'
              /**
               * True requires the current signed user session.
               */
              user: boolean
            }
          | {
              kind: 'windows_updates'
              /**
               * Explicit read mode; never a deployment action.
               */
              mode: 'local' | 'online'
              /**
               * Closed evidence section.
               */
              section: 'scan' | 'available' | 'installed' | 'history' | 'reboot'
            }
          | {
              kind: 'macos_security'
              /**
               * Closed evidence section.
               */
              section:
                | 'gatekeeper'
                | 'xprotect'
                | 'system_extensions'
                | 'filevault'
                | 'firewall'
                | 'sip'
                | 'hardware_encryption'
                | 'secure_token'
                | 'bootstrap_token'
            }
          | {
              kind: 'macos_accounts'
              /**
               * Closed evidence section.
               */
              section: 'accounts' | 'administrators' | 'sessions'
              /**
               * Approved account universe.
               */
              selection:
                | {
                    kind: 'local'
                  }
                | {
                    /**
                     * Nonempty bounded stable account identities.
                     */
                    identities: string[]
                    kind: 'selected'
                  }
            }
          | {
              kind: 'macos_certificates'
              /**
               * Exact approved store.
               */
              store: 'system' | 'system_roots' | 'login'
            }
          | {
              kind: 'macos_updates'
              /**
               * Explicit read mode; never a deployment action.
               */
              mode: 'local' | 'online'
              /**
               * Closed evidence section.
               */
              section: 'scan' | 'available' | 'installed' | 'history' | 'reboot'
            }
          | {
              kind: 'windows_application'
              /**
               * Approved application identity.
               */
              target:
                | {
                    kind: 'agent'
                  }
                | {
                    kind: 'signed'
                    /**
                     * Approved signer.
                     */
                    publisher: string
                    /**
                     * Exact approved service.
                     */
                    service: string
                  }
            }
          | {
              kind: 'macos_application'
              /**
               * Exact required permission probes, never global privacy inventory.
               */
              permissions: ApplicationPermission[]
              /**
               * Approved application identity.
               */
              target:
                | {
                    kind: 'agent'
                  }
                | {
                    /**
                     * Exact bundle identifier.
                     */
                    bundle_id: string
                    kind: 'signed'
                    /**
                     * Approved signing team.
                     */
                    team_id: string
                  }
            }
      }
    | {
        /**
         * Existing class, never created by collection.
         */
        class: string
        /**
         * Optional structured predicate.
         */
        filter: WmiFilter | null
        kind: 'windows_wmi'
        /**
         * Local namespace, for example root\\cimv2.
         */
        namespace: string
        /**
         * Explicit properties; SELECT * is impossible.
         */
        properties: {
          [k: string]: WmiProperty
        }
      }
    | {
        /**
         * True enumerates only immediate subkeys; row key is `key`.
         */
        enumerateSubkeys: boolean
        /**
         * Local hive identity.
         */
        hive:
          | {
              kind: 'local_machine'
            }
          | {
              kind: 'users'
              /**
               * Canonical Windows SID.
               */
              sid: string
            }
        kind: 'windows_registry'
        /**
         * Fixed relative key path.
         */
        path: string
        /**
         * Output property to exact value read.
         */
        values: {
          [k: string]: RegistryValue
        }
        /**
         * Explicit registry view.
         */
        view: 'registry32' | 'registry64'
      }
    | {
        kind: 'windows_cpu'
      }
    | {
        kind: 'windows_software'
      }
    | {
        kind: 'windows_network'
      }
    | {
        kind: 'windows_battery'
      }
    | {
        kind: 'macos_hardware'
        /**
         * Closed section and its canonical output shape.
         */
        section:
          | 'identity'
          | 'os'
          | 'cpu'
          | 'memory'
          | 'firmware'
          | 'disks'
          | 'apfs_containers'
          | 'volumes'
          | 'network'
          | 'battery'
      }
    | {
        kind: 'macos_applications'
        /**
         * Maximum directory descent (1 through 8); reaching the bound is Truncated.
         */
        maxDepth: number
        /**
         * Fixed root selector, resolved by the trusted Agent.
         */
        root: 'local_applications' | 'system_applications' | 'user_applications'
      }
    | {
        kind: 'macos_pkg_receipts'
      }
    | {
        kind: 'macos_brew'
        /**
         * Distinct package evidence kind.
         */
        package: 'formula' | 'cask'
        /**
         * Approved absolute data prefix, not a command or executable path.
         */
        prefix: string
        /**
         * Exact lowercase owner/tap selectors; empty requests all taps in this prefix.
         */
        taps: string[]
      }
  /**
   * Stable row properties identifying instances.
   */
  instanceKeys: string[]
  /**
   * Exact engine contract version.
   */
  version: number
}
/**
 * Query-local bounds.
 */
export interface NativeBudget1 {
  /**
   * Maximum rows.
   */
  maxRows: number
  /**
   * Canonical result byte bound.
   */
  outputBytes: number
  /**
   * Wall-clock bound.
   */
  timeoutSeconds: number
}
/**
 * Selected property with explicit array shape.
 */
export interface WmiProperty {
  /**
   * Whether CIM_FLAG_ARRAY is required.
   */
  array: boolean
  /**
   * Exact CIM primitive.
   */
  cimType:
    | 'string'
    | 'boolean'
    | 'sint8'
    | 'sint16'
    | 'sint32'
    | 'sint64'
    | 'uint8'
    | 'uint16'
    | 'uint32'
    | 'uint64'
    | 'real32'
    | 'real64'
    | 'datetime'
}
/**
 * One registry value projected under a stable property identifier.
 */
export interface RegistryValue {
  /**
   * Literal value name; empty means the default value.
   */
  name: string
  /**
   * Exact expected registry type.
   */
  valueType: 'sz' | 'expand_sz' | 'dword' | 'qword' | 'multi_sz'
}
/**
 * Validated profile; deserialization uses the same constructor as publication.
 */
export interface TelemetryProfile {
  /**
   * Maximum historical upload age, measured against product receipt time.
   */
  backfillSeconds: number
  /**
   * Optional temporary override.
   */
  boost: TelemetryBoost | null
  budget: TelemetryBudget
  /**
   * Exact field versions, resolved by the publishing application.
   */
  fields: TelemetryFieldReference[]
  /**
   * Literal inputs validated by the exact script template; empty for native collection.
   */
  parameters: {
    [k: string]: unknown
  }
  /**
   * Current and/or historical effects.
   */
  projection: 'current' | 'history' | 'both'
  /**
   * Normal sampling cadence.
   */
  sampleMillis: number
  template: TelemetryTemplate
  /**
   * Maximum time between uploads.
   */
  uploadMillis: number
}
/**
 * Temporary sampling override; expiration uses absolute UTC, never a renewed lease.
 */
export interface TelemetryBoost {
  /**
   * Original UTC expiration in Unix seconds.
   */
  expiresAt: number
  /**
   * Faster sampling cadence.
   */
  sampleMillis: number
}
/**
 * Resource limits for this profile.
 */
export interface TelemetryBudget {
  /**
   * Maximum uncompressed complete JSON input bytes.
   */
  bytes: number
  /**
   * Maximum template execution duration.
   */
  executionMillis: number
  /**
   * Maximum output bytes produced by one execution.
   */
  outputBytes: number
  /**
   * Maximum points in an uploaded batch.
   */
  points: number
  /**
   * Maximum expanded resources across all fields in a sample.
   */
  resources: number
}
/**
 * Exact Inventory identity. The composition owner resolves and freezes its definition.
 */
export interface TelemetryFieldReference {
  /**
   * Stable key owned by the Inventory catalog.
   */
  key: string
  /**
   * Exact immutable definition version.
   */
  version: number
}
/**
 * Exact native/script/osquery template reference.
 */
export interface TelemetryTemplate {
  /**
   * Actual processor architecture.
   */
  architecture: 'x86_64' | 'aarch64'
  /**
   * Native operating system.
   */
  platform: 'windows' | 'macos'
  /**
   * Existing Resource identity.
   */
  resource: string
  /**
   * Exact platform-specific variant.
   */
  variant: string
  /**
   * Published immutable version.
   */
  version: string
}
/**
 * Validated, immutable native template; it carries neither actor authority nor approval state.
 */
export interface NativeCollectionDefinition {
  /**
   * Closed native read protocol.
   */
  adapter:
    | 'windows_read'
    | 'apple_device_information'
    | 'apple_installed_applications'
    | 'apple_security'
    | 'apple_profiles'
    | 'apple_certificates'
    | 'apple_users'
  applicability: Applicability2
  /**
   * Inventory field identities and response mappings, frozen at publication.
   */
  mappings: {
    [k: string]: NativeMapping
  }
  /**
   * Maximum accepted aggregate result bytes.
   */
  outputBytes: number
  /**
   * Exact immutable collection namespace.
   */
  scope:
    | {
        kind: 'device'
      }
    | {
        /**
         * Stable account identity.
         */
        identity: string
        kind: 'user'
      }
    | {
        /**
         * Stable provider identity.
         */
        identity: string
        kind: 'source'
      }
    | {
        /**
         * Stable volume identity.
         */
        identity: string
        kind: 'volume'
      }
    | {
        kind: 'prefix'
        /**
         * Exact path prefix.
         */
        path: string
      }
  /**
   * Current run deadline in seconds.
   */
  timeoutSeconds: number
}
/**
 * Exact additional endpoint prerequisites.
 */
export interface Applicability2 {
  /**
   * Required current executor capabilities.
   */
  capabilities: string[]
  /**
   * Exact admitted edition identifiers; empty means unconstrained.
   */
  editions: string[]
  /**
   * Exact enrollment modes; empty means unconstrained.
   */
  enrollments: string[]
  /**
   * Inclusive minimum OS build.
   */
  minimumBuild: number | null
  /**
   * Inclusive minimum numeric OS version.
   */
  minimumOsVersion: string | null
  /**
   * Required minimum tool versions, e.g. osquery 5.23.1.
   */
  tools: {
    [k: string]: string
  }
}
/**
 * One native response extraction; list columns map canonical properties to item JSON pointers.
 */
export interface NativeMapping {
  mapping: ValueMapping2
  /**
   * CSP URI or DeviceInformation query key; empty for InstalledApplicationList.
   */
  query:
    | (
        | {
            kind: 'scalar'
            /**
             * Exact readable leaf URI.
             */
            uri: string
          }
        | {
            kind: 'enrollment_id'
          }
        | {
            kind: 'enrollment_type'
          }
        | {
            /**
             * Exact native namespace to enumerate.
             */
            inventory:
              | 'win32'
              | 'store'
              | 'non_store'
              | 'system'
              | 'network'
              | 'installed_updates'
              | 'installable_updates'
              | 'failed_updates'
              | 'pending_reboot_updates'
            kind: 'inventory'
          }
      )
    | string
}
/**
 * Extraction relative to a response or list item. Empty pointer selects the whole value.
 */
export interface ValueMapping2 {
  /**
   * Exact output properties for each array item. No undeclared attributes are copied.
   */
  columns: {
    [k: string]: ValueMapping
  }
  /**
   * Conversion of a direct scalar; structured projections require identity.
   */
  conversion:
    | {
        kind: 'identity'
      }
    | {
        kind: 'cim_time'
      }
    | {
        kind: 'integer'
      }
    | {
        kind: 'number'
      }
    | {
        kind: 'enum'
        /**
         * Finite exact source tokens. Unknown tokens are invalid.
         */
        values: {
          [k: string]: unknown
        }
      }
    | {
        /**
         * Value when absent from the complete set.
         */
        absent: unknown
        kind: 'array_member'
        /**
         * Exact native enum member.
         */
        member: number
        /**
         * Value when present in the complete set.
         */
        present: unknown
      }
    | {
        /**
         * Nonzero denominator; fractional output is rejected.
         */
        denominator: number
        kind: 'scale'
        /**
         * Numerator.
         */
        numerator: number
      }
    | {
        /**
         * Keys are decimal single-bit masks. Undeclared set bits are invalid.
         */
        flags: {
          [k: string]: string
        }
        kind: 'bitmask'
      }
  /**
   * RFC 6901 pointer, never an expression.
   */
  pointer: string
}
export interface ResourceReceipt {
  request: string
  resource: string
  storageRevision: number
}
