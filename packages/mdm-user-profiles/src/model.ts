export type ProfileSource =
  | { readonly kind: 'identity_local' }
  | { readonly kind: 'idp'; readonly provider: string }
export const valueTypes = ['string', 'boolean', 'number', 'integer', 'array', 'object'] as const
export type ValueType = (typeof valueTypes)[number]
export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json }
export interface DefinitionValue {
  readonly key: string
  readonly displayName: string
  readonly source: ProfileSource
  readonly pointer: string
  readonly valueType: ValueType
  readonly maxLength: number | null
  readonly maxItems: number | null
  readonly minimum: number | null
  readonly maximum: number | null
  readonly enabled: boolean
  readonly sensitive: boolean
  readonly required: boolean
  readonly visibility: 'self' | 'profiles_read' | 'both'
  readonly displayUse: 'profile' | 'summary' | 'hidden'
  readonly useExistingObservation: boolean
}
export interface Definition {
  readonly fieldId: string
  readonly revision: number
  readonly collectedAfterMicros: number
  readonly value: DefinitionValue | null
}
export interface SourceMetadata {
  readonly source: ProfileSource
  readonly providerConfigVersion: number | null
  readonly extensionsRoot: string | null
  readonly maxAgeSeconds: number
}
export type Attribute<T> =
  | { readonly status: 'available'; readonly value: T }
  | { readonly status: 'missing' | 'invalid' | 'not_configured' }
export interface FixedAttributes {
  readonly displayName: Attribute<string>
  readonly username: Attribute<string>
  readonly email: Attribute<string>
  readonly emailVerified: Attribute<boolean>
}
export interface ProfileObservation {
  readonly source: ProfileSource | null
  readonly status: 'available' | 'missing' | 'expired' | 'unavailable'
  readonly snapshotId: string | null
  readonly providerConfigVersion: number | null
  readonly sourceRevision: number | null
  readonly observedAt: number | null
  readonly collectedAtMicros: number | null
  readonly expiresAt: number | null
  readonly fixed: FixedAttributes | null
}
export type FieldStatus =
  | 'available'
  | 'missing'
  | 'expired'
  | 'unavailable'
  | 'pending_login'
  | 'invalid'
  | 'not_configured'
  | 'redacted'
export interface Field {
  readonly fieldId: string
  readonly revision: number
  readonly key: string
  readonly displayName: string
  readonly source: ProfileSource
  readonly valueType: ValueType
  readonly sensitive: boolean
  readonly displayUse: 'profile' | 'summary' | 'hidden'
  readonly required: boolean
  readonly status: FieldStatus
  readonly value: Json
}
export interface Profile {
  readonly principalId: string
  readonly view: 'current' | 'latest'
  readonly profiles: readonly ProfileObservation[]
  readonly fields: readonly Field[]
  readonly completeness: {
    readonly required: number
    readonly complete: number
    readonly missing: number
  }
}
export interface DefinitionRow extends Definition {
  readonly key: string
  readonly displayName: string
  readonly sourceKind: ProfileSource['kind']
  readonly provider: string | null
  readonly valueType: ValueType
  readonly enabled: boolean
  readonly sensitive: boolean
  readonly required: boolean
  readonly visibility: DefinitionValue['visibility']
  readonly displayUse: DefinitionValue['displayUse']
}
export interface DefinitionChange {
  readonly operationId: string
  readonly fieldId: string
  readonly expectedRevision: number
  readonly value: DefinitionValue | null
}
export interface DefinitionReceipt {
  readonly operationId: string
  readonly definition: Definition
}
export interface DirectoryQuery<F extends string> {
  readonly filter?: string
  readonly sort?: readonly string[]
  readonly fields?: readonly F[]
  readonly limit?: number
  readonly cursor?: string
}
export interface ProfilesPort {
  definitions<F extends keyof DefinitionRow = keyof DefinitionRow>(
    query?: DirectoryQuery<F>,
  ): Promise<{
    readonly items: readonly Pick<DefinitionRow, F>[]
    readonly nextCursor: string | null
    readonly sources: readonly SourceMetadata[]
  }>
  definition(id: string): Promise<Definition>
  save(change: DefinitionChange): Promise<DefinitionReceipt>
  operation(id: string): Promise<DefinitionReceipt>
  self(view: Profile['view'], preview: boolean): Promise<Profile>
  other(principal: string, preview: boolean): Promise<Profile>
}
