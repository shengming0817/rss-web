import type { AgentMapping, NativeMapping, ValueMapping } from './mapping'

/** Template declarations describe executable namespaces; observed CollectionScope is a separate type. */
export type TemplateScope =
  | { readonly kind: 'device' }
  | { readonly kind: 'user' | 'source' | 'volume'; readonly identity: string }
  | { readonly kind: 'prefix'; readonly path: string }
export interface Applicability {
  readonly minimumOsVersion: string | null
  readonly minimumBuild: number | null
  readonly editions: readonly string[]
  readonly enrollments: readonly string[]
  readonly tools: Readonly<Record<string, string>>
  readonly capabilities: readonly string[]
}
export interface CollectionBudget {
  readonly timeoutSeconds: number
  readonly outputBytes: number
  readonly maxRows: number
}
export type PhysicalPredicate =
  | {
      readonly kind: 'compare'
      readonly property: string
      readonly operator: 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge'
      readonly value: string | boolean | number
    }
  | { readonly kind: 'and' | 'or'; readonly terms: readonly PhysicalPredicate[] }
export type AccountSelection =
  | { readonly kind: 'local' }
  | { readonly kind: 'selected'; readonly identities: readonly string[] }
export type SystemRead =
  | {
      readonly kind:
        | 'windows_bitlocker'
        | 'windows_firewall'
        | 'windows_defender'
        | 'windows_secure_boot'
        | 'windows_join'
    }
  | {
      readonly kind: 'windows_accounts' | 'macos_accounts'
      readonly section: 'accounts' | 'administrators' | 'sessions'
      readonly selection: AccountSelection
    }
  | {
      readonly kind: 'windows_certificates'
      readonly store: 'my' | 'root' | 'ca' | 'trusted_publisher'
      readonly user: boolean
    }
  | { readonly kind: 'macos_certificates'; readonly store: 'system' | 'system_roots' | 'login' }
  | {
      readonly kind: 'windows_updates' | 'macos_updates'
      readonly section: 'scan' | 'available' | 'installed' | 'history' | 'reboot'
      readonly mode: 'local' | 'online'
    }
  | {
      readonly kind: 'macos_security'
      readonly section:
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
      readonly kind: 'windows_application'
      readonly target:
        | { readonly kind: 'agent' }
        | { readonly kind: 'signed'; readonly service: string; readonly publisher: string }
    }
  | {
      readonly kind: 'macos_application'
      readonly target:
        | { readonly kind: 'agent' }
        | { readonly kind: 'signed'; readonly bundle_id: string; readonly team_id: string }
      readonly permissions: readonly ('full_disk_access' | 'accessibility' | 'screen_capture')[]
    }
export type CimType =
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
export type PhysicalRead =
  | {
      readonly kind: 'windows_performance' | 'macos_performance'
      readonly section: 'cpu' | 'memory' | 'file_systems' | 'network'
    }
  | { readonly kind: 'system'; readonly query: SystemRead }
  | {
      readonly kind: 'windows_wmi'
      readonly namespace: string
      readonly class: string
      readonly properties: Readonly<
        Record<string, { readonly cimType: CimType; readonly array: boolean }>
      >
      readonly filter: PhysicalPredicate | null
    }
  | {
      readonly kind: 'windows_registry'
      readonly hive:
        | { readonly kind: 'local_machine' }
        | { readonly kind: 'users'; readonly sid: string }
      readonly view: 'registry32' | 'registry64'
      readonly path: string
      readonly enumerateSubkeys: boolean
      readonly values: Readonly<
        Record<
          string,
          {
            readonly name: string
            readonly valueType: 'sz' | 'expand_sz' | 'dword' | 'qword' | 'multi_sz'
          }
        >
      >
    }
  | {
      readonly kind:
        | 'windows_cpu'
        | 'windows_software'
        | 'windows_network'
        | 'windows_battery'
        | 'macos_pkg_receipts'
    }
  | {
      readonly kind: 'macos_hardware'
      readonly section:
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
      readonly kind: 'macos_applications'
      readonly root: 'local_applications' | 'system_applications' | 'user_applications'
      readonly maxDepth: number
    }
  | {
      readonly kind: 'macos_brew'
      readonly prefix: string
      readonly package: 'formula' | 'cask'
      readonly taps: readonly string[]
    }
export interface PhysicalQuery {
  readonly version: number
  readonly definition: PhysicalRead
  readonly cardinality: 'exactly_one' | 'list'
  readonly instanceKeys: readonly string[]
  readonly budget: CollectionBudget
}
export interface AgentPlan {
  readonly version: number
  readonly scope: TemplateScope
  readonly queries: Readonly<Record<string, PhysicalQuery>>
  readonly budget: CollectionBudget
}
export interface AgentDefinition {
  readonly applicability: Applicability
  readonly plan: AgentPlan
  readonly mappings: Readonly<Record<string, AgentMapping>>
}
export interface NativeDefinition {
  readonly scope: TemplateScope
  readonly applicability: Applicability
  readonly adapter:
    | 'windows_read'
    | 'apple_device_information'
    | 'apple_installed_applications'
    | 'apple_security'
    | 'apple_profiles'
    | 'apple_certificates'
    | 'apple_users'
  readonly mappings: Readonly<Record<string, NativeMapping>>
  readonly timeoutSeconds: number
  readonly outputBytes: number
}
export interface ScriptDefinition {
  readonly profile: 'power_shell7' | 'posix_sh' | 'bash' | 'osquery'
  readonly sql: string | null
  readonly runAs: 'system' | 'logged_in_user'
  readonly encoding: 'utf8'
  readonly parameters: Readonly<Record<string, unknown>>
  readonly bindings: Readonly<
    Record<
      string,
      | { readonly kind: 'named' | 'environment'; readonly name: string }
      | { readonly kind: 'positional'; readonly index: number }
    >
  >
  readonly output: Readonly<Record<string, unknown>>
  readonly purpose:
    | { readonly kind: 'action' }
    | {
        readonly kind: 'collection'
        readonly scope: TemplateScope
        readonly applicability: Applicability
        readonly mappings: Readonly<Record<string, ValueMapping>>
      }
  readonly timeoutSeconds: number
  readonly outputBytes: number
  readonly maxRows: number
}
