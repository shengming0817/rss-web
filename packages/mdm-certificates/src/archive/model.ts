import type { DirectoryQuery, Page, WindowQuery } from '@rss/mdm-devices'
export const formats = ['certificate', 'chain', 'csr', 'pkcs12', 'private_key', 'opaque'] as const
export const profiles = ['ca', 'https', 'csr', 'apns_csr', 'scep_template'] as const
export const algorithms = ['rsa2048', 'rsa3072', 'p256'] as const
export type Format = (typeof formats)[number]
export type Profile = (typeof profiles)[number]
export type Algorithm = (typeof algorithms)[number]
export interface Metadata {
  readonly [key: string]: unknown
  readonly name: string
  readonly category: string
  readonly owner: string
  readonly notes: string
  readonly labels: readonly string[]
  readonly usages: readonly string[]
}
export interface Reference {
  readonly entryId: string
  readonly version: number
}
export interface CertificateFacts {
  readonly subject: string
  readonly issuer: string
  readonly sans: readonly string[]
  readonly serial: string
  readonly fingerprint: string
  readonly algorithm: string
  readonly notBefore: number
  readonly notAfter: number
  readonly publicKey: string
}
export interface MaterialFacts {
  readonly name: string
  readonly format: Format
  readonly certificates: readonly CertificateFacts[]
  readonly publicKeys: readonly string[]
  readonly containsPrivateKey: boolean
}
/** Facts only. Version history never contains material bytes or passwords. */
export interface Version extends Reference {
  readonly actor: string
  readonly instance: string
  readonly operationId: string
  readonly createdAt: number
  readonly metadata: Metadata
  readonly facts: readonly MaterialFacts[]
  readonly requestVersion: Reference | null
  readonly source: string
}
export interface Entry {
  readonly id: string
  readonly revision: number
  readonly retired: boolean
  readonly recommendedVersion: number | null
  readonly latest: Version
}
export interface EntryRow extends Partial<Omit<Entry, 'id'>> {
  readonly id: string
}
export interface Directory extends Page<EntryRow> {
  readonly tenantId: string
  readonly asOf: number
  readonly reminderDays: number
  readonly alerts: {
    readonly expired: number
    readonly expiring: number
    readonly notYetValid: number
  }
}
export interface Vault {
  readonly initialized: boolean
  readonly generation: number
  readonly unlockedUntil: number | null
}
export interface Settings {
  readonly reminderDays: number
  readonly categories: readonly string[]
}
export interface SettingsView {
  readonly revision: number
  readonly value: Settings
}
export const actions = [
  'initialize',
  'password_change',
  'import',
  'generate',
  'export',
  'settings',
  'manage',
  'metadata',
] as const
export type Action = (typeof actions)[number]
export interface Receipt {
  readonly operationId: string
  readonly action: Action
  readonly entryId: string | null
  readonly version: number | null
  readonly revision: number
}
/** Non-secret receipt coordinates survive an unknown response; they never authorize a write. */
export interface OriginalOperation {
  readonly operationId: string
  readonly action: Action
  readonly entryId: string | null
  readonly version: number | null
  readonly expectedRevision: number | null
}
export interface ImportIntent {
  readonly operationId: string
  readonly entryId: string
  readonly expectedRevision: number
  readonly metadata: Metadata
  readonly files: readonly { readonly name: string; readonly format: Format }[]
  readonly requestVersion: Reference | null
}
/** Borrowed only for submission. The caller clears buffers in its finally block. */
export interface ImportMaterial {
  readonly name: string
  readonly bytes: ArrayBuffer
  readonly password: string | null
}
export interface GenerateIntent {
  readonly operationId: string
  readonly entryId: string
  readonly expectedRevision: number
  readonly metadata: Metadata
  readonly profile: Profile
  readonly algorithm: Algorithm
  readonly commonName: string
  readonly organization: string
  readonly sans: readonly string[]
  readonly days: number
  readonly issuer: Reference | null
  readonly scepUrl: string | null
}
export interface MetadataIntent {
  readonly operationId: string
  readonly entryId: string
  readonly expectedRevision: number
  readonly metadata: Metadata
}
export interface ManageIntent {
  readonly operationId: string
  readonly entryId: string
  readonly expectedRevision: number
  readonly retired: boolean
  readonly recommendedVersion: number | null
}
export interface SettingsIntent {
  readonly operationId: string
  readonly expectedRevision: number
  readonly value: Settings
}
export interface ExportIntent extends Reference {
  readonly operationId: string
}
export interface ExportFile {
  readonly name: string
  readonly bytes: ArrayBuffer
}
export interface ArchivePort {
  vault(): Promise<Vault>
  initialize(operationId: string, password: string): Promise<Receipt>
  unlock(password: string): Promise<Vault>
  lock(): Promise<void>
  changePassword(operationId: string, oldPassword: string, newPassword: string): Promise<Receipt>
  list(query: DirectoryQuery<keyof Entry>): Promise<Directory>
  entry(id: string): Promise<Entry>
  history(entry: string, query: WindowQuery): Promise<Page<Version>>
  import(input: ImportIntent, materials: readonly ImportMaterial[]): Promise<Receipt>
  generate(input: GenerateIntent): Promise<Receipt>
  metadata(input: MetadataIntent): Promise<Receipt>
  manage(input: ManageIntent): Promise<Receipt>
  export(input: ExportIntent, signal?: AbortSignal): Promise<readonly ExportFile[]>
  operation(id: string): Promise<Receipt>
  settings(): Promise<SettingsView>
  saveSettings(input: SettingsIntent): Promise<Receipt>
}
