export type RuntimeDomain = 'identity' | 'settings' | 'audit' | 'contractreg' | 'syshealth'
export type RuntimeListenerKind = 'primary' | 'internal' | 'health' | 'admin'
export type RuntimeAuthScheme =
  | 'noAuth'
  | 'rssAccessToken'
  | 'federatedAccessToken'
  | 'mtls'
  | 'serviceToken'
export type ProviderPostureState = 'unobserved' | 'ready' | 'degraded' | 'unavailable'

export interface RuntimeEndpoint {
  readonly scheme: 'http' | 'https'
  readonly host: string
  readonly port: number
}

export interface RuntimeBuildMetadata {
  readonly sourceRevision: string
  readonly imageDigest: string
}

export interface RuntimeListener {
  readonly id: string
  readonly kind: RuntimeListenerKind
  readonly endpoint: RuntimeEndpoint
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
  readonly activation: 'capture-only' | 'shadow' | 'active'
}

export interface ActivatedSaga extends ActivatedWorkflowBase {
  readonly mode: 'saga'
  readonly activation: 'active'
}

export type ActivatedWorkflow = ActivatedProjection | ActivatedSaga

export interface RuntimePlacement {
  readonly domain: RuntimeDomain
  readonly workload: string
  readonly mode: 'local' | 'remote'
  readonly endpoint?: RuntimeEndpoint
  readonly spiffeIdentity?: string
  readonly readiness: 'ready' | 'mtls-source-unavailable'
}

export interface RuntimeInventoryData {
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
  readonly data: RuntimeInventoryData
}

export interface RuntimeCallOptions {
  readonly signal?: AbortSignal
}
