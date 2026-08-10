export const RUNTIME_DOMAINS = [
  'identity',
  'settings',
  'audit',
  'contractreg',
  'syshealth',
] as const
export const RUNTIME_LISTENER_KINDS = ['primary', 'internal', 'health', 'admin'] as const
export const RUNTIME_AUTH_SCHEMES = [
  'noAuth',
  'rssAccessToken',
  'federatedAccessToken',
  'mtls',
  'serviceToken',
] as const
export const PROVIDER_POSTURE_STATES = ['unobserved', 'ready', 'degraded', 'unavailable'] as const
export const PROJECTION_ACTIVATIONS = ['capture-only', 'shadow', 'active'] as const
export const WORKFLOW_ACTIVATIONS = {
  projection: PROJECTION_ACTIVATIONS,
  saga: ['active'] as const,
} as const
export const PLACEMENT_MODES = ['local', 'remote'] as const
export const PLACEMENT_READINESS = ['ready', 'mtls-source-unavailable'] as const

export type RuntimeDomain = (typeof RUNTIME_DOMAINS)[number]
export type RuntimeListenerKind = (typeof RUNTIME_LISTENER_KINDS)[number]
export type RuntimeAuthScheme = (typeof RUNTIME_AUTH_SCHEMES)[number]
export type ProviderPostureState = (typeof PROVIDER_POSTURE_STATES)[number]

export interface RuntimeBuildMetadata {
  readonly sourceRevision: string
  readonly imageDigest: string
}

export interface RuntimeListener {
  readonly id: string
  readonly kind: RuntimeListenerKind
  readonly authScheme: RuntimeAuthScheme
}

export interface RuntimeProviderPosture {
  readonly id: string
  readonly state: ProviderPostureState
}

interface ActivatedWorkflowBase {
  readonly id: string
  readonly definitionVersion: string
  readonly definitionSchemaDigest: string
}

export interface ActivatedProjection extends ActivatedWorkflowBase {
  readonly mode: 'projection'
  readonly activation: (typeof WORKFLOW_ACTIVATIONS.projection)[number]
}

export interface ActivatedSaga extends ActivatedWorkflowBase {
  readonly mode: 'saga'
  readonly activation: (typeof WORKFLOW_ACTIVATIONS.saga)[number]
}

export type ActivatedWorkflow = ActivatedProjection | ActivatedSaga

export interface RuntimePlacement {
  readonly domain: RuntimeDomain
  readonly workload: string
  readonly mode: (typeof PLACEMENT_MODES)[number]
  readonly readiness: (typeof PLACEMENT_READINESS)[number]
}

export interface RuntimeInventoryFacts {
  readonly schemaVersion: 1
  readonly assemblyFingerprint: string
  readonly buildMetadata?: RuntimeBuildMetadata
  readonly runtimePlanFingerprint: string
  readonly activatedWorkflows: readonly ActivatedWorkflow[]
  readonly domains: readonly RuntimeDomain[]
  readonly listeners: readonly RuntimeListener[]
  readonly providerPosture: readonly RuntimeProviderPosture[]
  readonly placements: readonly RuntimePlacement[]
}

export interface RuntimeInventoryResponse {
  readonly data: RuntimeInventoryFacts
}

export interface RuntimeCallOptions {
  readonly signal?: AbortSignal
}
