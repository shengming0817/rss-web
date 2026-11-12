/** Device identity and observed facts. No client-side authorization or inventory resolution. */
export type DeviceRef = { readonly kind: 'endpoint' | 'association'; readonly id: string }
export type Channel = 'mdm' | 'agent'
export type Platform = 'windows' | 'macos'
export type Source = 'mdm.windows' | 'mdm.apple' | 'agent.builtin'
export type RegistrationState = 'active' | 'revoked'
export type EndpointState = RegistrationState | 'pending' | 'cancelled' | 'expired'
export type AssetState = 'active' | 'archived' | 'deleted'
export interface User {
  readonly tenantId: string
  readonly instanceId: string
  readonly principalId: string
}
export interface PersonDisplay {
  readonly login: string | null
  readonly profiles: readonly {
    readonly source:
      | { readonly kind: 'identity_local' }
      | { readonly kind: 'idp'; readonly provider: string }
    readonly status: 'available' | 'missing' | 'expired' | 'unavailable'
    readonly displayName: string | null
    readonly username: string | null
  }[]
}
export interface DeviceMember {
  readonly device: string
  readonly channel: Channel
}
export interface Endpoint {
  readonly id: string
  readonly registeredAt: number | null
  readonly status: EndpointState
  readonly channel: Channel | null
  readonly source: Source | null
  readonly platform: Platform | null
  readonly lastCommunicationReceivedAt: number | null
  readonly enrollment: {
    readonly enrollmentId: string
    readonly status: 'pending' | 'bound' | 'cancelled' | 'expired'
    readonly expiresAt: number
  } | null
  readonly inventoryAvailable?: boolean | null
}
export interface EndpointDetail extends Endpoint {
  readonly capabilities: readonly {
    readonly action: string
    readonly channel: string
    readonly productSupport: {
      readonly state: 'supported' | 'unsupported' | 'blocked' | 'unknown' | 'ready'
      readonly reason: string | null
    }
    readonly devicePrerequisite: {
      readonly state: 'supported' | 'unsupported' | 'blocked' | 'unknown' | 'ready'
      readonly reason: string | null
    }
    readonly permission: { readonly allowed: boolean; readonly reason: string | null }
  }[]
}
export type Scalar =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'integer' | 'number' | 'time'; readonly value: number }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'array'; readonly value: readonly Scalar[] }
  | { readonly kind: 'object'; readonly value: Readonly<Record<string, Scalar>> }
export type FieldState =
  | { readonly kind: 'known'; readonly value: Scalar }
  | {
      readonly kind: 'unknown'
      readonly value: {
        readonly reason: 'unordered_conflict' | 'incomplete' | 'native_status' | 'evidence_limit'
      }
    }
  | { readonly kind: 'null' | 'missing' | 'unsupported' | 'deleted' | 'conflict' }
export interface RegistrationUser {
  readonly revision: number
  readonly user: User | null
}
export interface ViewEndpoint extends Omit<Endpoint, 'platform'> {
  readonly assetState: AssetState
  readonly platform: {
    readonly state: 'known' | 'unknown' | 'conflict'
    readonly values: readonly Platform[]
  }
  readonly displayName?: FieldState
  readonly serialNumber?: FieldState
  readonly registrationUser?: RegistrationUser & { readonly display: PersonDisplay | null }
  readonly currentUser?: RegistrationUser & {
    readonly state: 'unbound' | 'active' | 'invalidated'
    readonly confirmedAt: number | null
    readonly display: PersonDisplay | null
  }
}
export interface Association {
  readonly id: string
  readonly version: number
  readonly state: 'confirmed' | 'needs_verification' | 'revoked'
  readonly members: readonly DeviceMember[]
  readonly evidence: string
  readonly confirmedBy: string
  readonly confirmedAt: number
  readonly revokedBy: string | null
  readonly revokedAt: number | null
  readonly reason: string | null
}
export interface DeviceView {
  readonly reference: DeviceRef
  readonly association: Association | null
  readonly endpoints: readonly ViewEndpoint[]
  /** Read-only server resolution. Asset authoring belongs to its own domain. */
  readonly fields: Readonly<Record<string, FieldState>>
}
export interface ViewRow {
  readonly key: string
  readonly reference?: DeviceRef
  readonly association?: Association | null
  readonly endpoints?: readonly ViewEndpoint[]
}
export interface EndpointRow extends Partial<Endpoint> {
  readonly id: string
}
export interface AssociationRow {
  readonly id: string
  readonly version?: number
  readonly confirmedAt?: number
  readonly association?: Association
}
export interface DirectoryQuery<F extends string = string> {
  readonly filter?: string | undefined
  readonly sort?: readonly string[] | undefined
  readonly fields?: readonly F[] | undefined
  readonly limit?: number | undefined
  readonly cursor?: string | undefined
}
export type WindowQuery = Pick<DirectoryQuery, 'limit' | 'cursor'>
export interface Page<T> {
  readonly items: readonly T[]
  readonly nextCursor: string | null
}
export interface AssociationChange {
  readonly association: Association
  readonly position: number
  readonly action:
    | 'device_association_confirm'
    | 'device_association_revoke'
    | 'device_association_automatic'
  readonly recordedAt: number
}
export interface ConfirmAssociation {
  readonly operationId: string
  readonly associationId: string | null
  readonly expectedVersion: number
  readonly mdm: DeviceMember
  readonly agent: DeviceMember
  readonly evidence: string
}
export interface RevokeAssociation {
  readonly operationId: string
  readonly expectedVersion: number
  readonly reason: string
}
export interface AssignUser {
  readonly operationId: string
  readonly expectedRevision: number
  readonly user: User | null
}
export interface Retirement {
  readonly id: string
  readonly origin: string
  readonly policy: string
  readonly version: string
  readonly target: {
    readonly object: DeviceRef
    readonly associationVersion: number | null
    readonly verified: boolean
    readonly members: readonly DeviceMember[]
  }
  readonly createdAt: number
  readonly forcedAt: number | null
  readonly channels: readonly {
    readonly device: string
    readonly channel: Channel
    readonly stage: 'cleanup' | 'unenroll' | 'revoke' | 'complete'
    readonly effect: 'pending' | 'confirmed' | 'unknown' | 'blocked'
    readonly execution: string | null
    readonly blockingExecution: string | null
    readonly reason: string | null
  }[]
}
export interface DevicesPort {
  endpoints(query: DirectoryQuery<keyof Endpoint>, signal?: AbortSignal): Promise<Page<EndpointRow>>
  endpoint(id: string, signal?: AbortSignal): Promise<EndpointDetail>
  endpointStatistics(
    filter?: string,
    signal?: AbortSignal,
  ): Promise<{
    readonly statistics: {
      readonly total: number
      readonly pending: number
      readonly active: number
      readonly revoked: number
    }
    readonly asOf: number
  }>
  views(query: DirectoryQuery<keyof ViewRow>, signal?: AbortSignal): Promise<Page<ViewRow>>
  view(reference: DeviceRef, signal?: AbortSignal): Promise<DeviceView>
  viewStatistics(
    filter?: string,
    signal?: AbortSignal,
  ): Promise<{
    readonly statistics: { readonly endpointCount: number; readonly deviceViewCount: number }
    readonly asOf: number
  }>
  associations(
    query: DirectoryQuery<keyof AssociationRow>,
    signal?: AbortSignal,
  ): Promise<Page<AssociationRow>>
  association(id: string, signal?: AbortSignal): Promise<Association>
  changes(query: WindowQuery, signal?: AbortSignal): Promise<Page<AssociationChange>>
  candidates(
    device: string,
    channel: Channel,
    query: WindowQuery,
    signal?: AbortSignal,
  ): Promise<Page<DeviceMember>>
  confirm(change: ConfirmAssociation): Promise<Association>
  revoke(id: string, change: RevokeAssociation): Promise<Association>
  registrationUser(device: string): Promise<RegistrationUser>
  assign(device: string, change: AssignUser): Promise<RegistrationUser>
  retirement(id: string): Promise<Retirement>
  forceRetirement(
    id: string,
    operationId: string,
    reason: string,
  ): Promise<{
    readonly operationId: string
    readonly retirementId: string
    readonly revocation: 'pending'
  }>
  assetState(
    reference: DeviceRef,
    operationId: string,
    state: AssetState,
  ): Promise<{
    readonly operationId: string
    readonly devices: readonly string[]
    readonly state: AssetState
  }>
}

/** Read-only capabilities projected from the producer's directory declaration. */
export interface DirectoryCapabilities {
  readonly fields: readonly {
    readonly name: string
    readonly kind: string | Readonly<Record<string, readonly string[]>>
    readonly filter: boolean
    readonly sort: boolean
    readonly output: boolean
    readonly nullable: boolean
    readonly operators: readonly string[]
    readonly limitation: string | null
  }[]
  readonly maximum: number
}
