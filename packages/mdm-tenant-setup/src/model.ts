export const channels = ['agent', 'windows_mdm', 'macos_mdm'] as const
export const capabilities = [
  'agent_package',
  'task_signing',
  'windows_push',
  'apple_ade',
  'apple_account',
  'oidc',
  'smtp',
  's3',
  'webhook',
  'recovery_credentials',
] as const
export const stepIds = [
  ...channels,
  'agent_registration',
  'apple_materials',
  ...capabilities,
] as const
export const stepStatuses = [
  'ready',
  'unconfigured',
  'pending',
  'unknown',
  'unavailable',
  'forbidden',
  'skipped',
] as const
export type Channel = (typeof channels)[number]
export type Capability = (typeof capabilities)[number]
export type Decision =
  | { readonly kind: 'configure' }
  | { readonly kind: 'skip'; readonly reason: string }
export interface Intent {
  readonly channels: readonly Channel[]
  readonly capabilities: Readonly<Partial<Record<Capability, Decision>>>
  readonly completionRequested: boolean
}
export interface Saved {
  readonly revision: number
  readonly intent: Intent
}
export interface Entry {
  readonly id: string
  readonly scope: 'deployment' | 'platform' | 'tenant' | 'device'
  readonly owner: string
  readonly custody: string
  readonly lifecycle: string
  readonly status: 'unknown' | 'unconfigured' | 'configured' | 'loaded' | 'pending' | 'unavailable'
  readonly revision: number | null
  readonly desiredRevision: number | null
  readonly appliedRevision: number | null
  readonly configuredCount: number | null
  readonly reason: string | null
}
export interface Catalog {
  readonly items: readonly Entry[]
  readonly domains: readonly { readonly id: string; readonly href: string }[]
}
export interface Progress {
  readonly tenantId: string
  readonly saved: Saved
  readonly steps: readonly {
    readonly id: (typeof stepIds)[number]
    readonly status: (typeof stepStatuses)[number]
    readonly reason: string | null
    readonly evidence: readonly Entry[]
  }[]
  readonly canComplete: boolean
  readonly complete: boolean
}
export interface Command {
  readonly operationId: string
  readonly expectedRevision: number
  readonly intent: Intent
}
export interface Receipt {
  readonly operationId: string
  readonly saved: Saved
}
export interface SetupPort {
  read(): Promise<Progress>
  update(command: Command): Promise<Receipt>
  operation(id: string): Promise<Receipt>
  catalog(): Promise<Catalog>
}
