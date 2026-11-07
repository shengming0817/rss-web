/** Authoring vocabulary only. The backend alone evaluates resource authorization. */
export const devicePermissions = [
  'inventory_read',
  'device_association_write',
  'compliance_read',
  'inventory_collect',
  'inventory_assign',
  'telemetry_delete',
  'telemetry_maintain',
  'enrollment',
  'credentials',
  'device_unmanage',
  'device_wipe',
  'configuration_write',
  'windows_mi_execute',
  'device_control',
  'device_update',
  'account_write',
  'security_operate',
  'device_diagnostics',
  'script_execute',
  'software_deploy',
  'operation_read',
  'operation_cancel',
] as const
export const tenantPermissions = [
  'user_attribute_definitions_read',
  'user_attribute_definitions_write',
  'user_profiles_read',
  'webhook_read',
  'webhook_write',
  'webhook_replay',
  'tenant_create',
  'tenant_read',
  'tenant_update',
  'tenant_delete',
  'tenant_administrator_create',
  'identity_accounts_manage',
  'identity_providers_manage',
  'enterprise_applications_read',
  'enterprise_applications_write',
  'storage_configuration_read',
  'storage_configuration_write',
  'registration_configuration_read',
  'registration_configuration_write',
  'audit_read',
  'runtime_diagnostics_read',
  'inventory_sensitive_read',
  'inventory_fields_write',
  'inventory_software_write',
  'certificate_archive_read',
  'certificate_archive_write',
  'certificate_archive_unlock',
  'certificate_archive_export',
  'compliance_rule_read',
  'compliance_write',
  'compliance_recompute',
  'agent_enrollment_read',
  'agent_enrollment_write',
  'authorization_read',
  'authorization_write',
  'user_group_read',
  'user_group_write',
  'department_read',
  'group_read',
  'group_write',
  'group_recompute',
  'scope_read',
  'scope_write',
  'policy_read',
  'policy_write',
  'resource_read',
  'resource_write',
  'software_read',
  'software_write',
  'software_withdraw',
  'release_read',
  'release_publish',
  'release_withdraw',
  'release_recover',
] as const
export const platformPermissions = [
  'tenant_create',
  'tenant_read',
  'tenant_update',
  'tenant_delete',
  'tenant_administrator_create',
  'authorization_read',
  'authorization_write',
  'identity_accounts_manage',
] as const
const keyForbidden: readonly string[] = [
  ...platformPermissions,
  'identity_providers_manage',
  'enterprise_applications_write',
  'user_group_read',
  'user_group_write',
  'department_read',
]
export const permissions = [...devicePermissions, ...tenantPermissions] as const
export type Permission = (typeof permissions)[number]
export const keyPermissions = permissions.filter((p) => !keyForbidden.includes(p))
export type Realm = 'tenant' | 'management'
export interface User {
  readonly instanceId: string
  readonly tenantId: string
  readonly principalId: string
}
export interface Source {
  readonly providerId: string
  readonly issuer: string
  readonly configurationVersion: number
}
export type Subject =
  | { readonly kind: 'user'; readonly user: User }
  | { readonly kind: 'user_group'; readonly id: string }
  | { readonly kind: 'idp_group'; readonly source: Source; readonly id: string }
  | {
      readonly kind: 'department'
      readonly source: Source
      readonly id: string
      readonly matching: 'exact' | 'subtree'
    }
export type Scope =
  | { readonly kind: 'tenant' | 'all_devices' }
  | { readonly kind: 'device'; readonly id: string }
export interface Grant {
  readonly operation: Permission
  readonly scope: Scope
}
export interface Rule {
  readonly subject: Subject
  readonly grants: readonly Grant[]
}
export interface UserGroup {
  readonly name: string
  readonly enabled: boolean
  readonly members: readonly User[]
}
export interface Revision<T> {
  readonly id: string
  readonly revision: number
  readonly value: T | null
}
export interface Change<T> {
  readonly operationId: string
  readonly expectedRevision: number
  readonly value: T | null
}
export interface Receipt {
  readonly id: string
  readonly revision: number
  readonly deleted: boolean
}
export interface Observation {
  readonly snapshotId: string
  readonly observedAt: number
  readonly expiresAt: number
  readonly sourceRevision: string | null
}
export interface EffectiveAuthorization extends User {
  readonly grants: readonly (Grant & {
    readonly ruleId: string
    readonly ruleRevision: number
    readonly subject: Subject
    readonly observation: Observation | null
  })[]
}
export type Departments =
  | { readonly status: 'expired' }
  | { readonly status: 'unavailable'; readonly reason: string }
  | {
      readonly status: 'available'
      readonly source: Source
      readonly snapshotId: string
      readonly observedAt: number
      readonly expiresAt: number
      readonly snapshot: {
        readonly version: 1
        readonly sourceRevision: string
        readonly nodes: readonly {
          readonly id: string
          readonly displayName: string
          readonly parentId: string | null
        }[]
        readonly memberships: readonly string[]
      }
    }
export interface KeyMetadata {
  readonly name: string
  readonly enabled: boolean
  readonly expiresAt: number | null
  readonly grants: readonly Grant[]
}
export interface ApiKey {
  readonly id: string
  readonly revision: number
  readonly authorityRevision: number
  readonly credentialRevision: number
  readonly metadata: KeyMetadata
  readonly createdBy: User
  readonly createdAt: number
  readonly revoked: boolean
}
export type KeyIntent =
  | {
      readonly kind: 'create' | 'update'
      readonly id: string
      readonly revision: number
      readonly metadata: KeyMetadata
    }
  | { readonly kind: 'rotate' | 'revoke'; readonly id: string; readonly revision: number }
/** A null secret on replay is final: the client cannot recover the original secret. */
export interface KeyResult {
  readonly receipt: Receipt
  readonly secret: string | null
}
export interface NetworkPolicy {
  readonly revision: number
  readonly networks: readonly string[]
}
export interface RuleRow {
  readonly id: string
  readonly revision: number
  readonly deleted: boolean
  readonly subjectKind: Subject['kind'] | null
  readonly value: Rule | null
}
export interface GroupRow {
  readonly id: string
  readonly revision: number
  readonly deleted: boolean
  readonly name: string | null
  readonly enabled: boolean | null
  readonly memberCount: number | null
  readonly value: {
    readonly name: string
    readonly enabled: boolean
    readonly memberCount: number
  } | null
}
export interface KeyRow extends ApiKey {
  readonly name: string
  readonly enabled: boolean
  readonly expiresAt: number | null
}
/** Projection stays distinct from a full detail used for CAS editing. */
export interface DirectoryQuery<F extends string> {
  readonly filter?: string
  readonly sort?: readonly string[]
  readonly fields?: readonly F[]
  readonly limit?: number
  readonly cursor?: string
}
export interface Page<T> {
  readonly items: readonly T[]
  readonly nextCursor: string | null
}
export interface AuthorizationPort {
  effective(): Promise<EffectiveAuthorization>
  rules<F extends keyof RuleRow = keyof RuleRow>(
    query?: DirectoryQuery<F>,
  ): Promise<Page<Pick<RuleRow, F>>>
  rule(id: string): Promise<Revision<Rule>>
  changeRule(id: string, change: Change<Rule>): Promise<Receipt>
  groups<F extends keyof GroupRow = keyof GroupRow>(
    query?: DirectoryQuery<F>,
  ): Promise<Page<Pick<GroupRow, F>>>
  group(id: string): Promise<Revision<UserGroup>>
  changeGroup(id: string, change: Change<UserGroup>): Promise<Receipt>
  members<F extends keyof User = keyof User>(
    id: string,
    query?: DirectoryQuery<F>,
  ): Promise<Page<Pick<User, F>> & { readonly id: string; readonly revision: number }>
  departments(): Promise<Departments>
  keys<F extends keyof KeyRow = keyof KeyRow>(
    query?: DirectoryQuery<F>,
  ): Promise<Page<Pick<KeyRow, F>>>
  key(id: string): Promise<ApiKey>
  changeKey(operationId: string, intent: KeyIntent): Promise<KeyResult>
  network(): Promise<NetworkPolicy>
  changeNetwork(
    operationId: string,
    expectedRevision: number,
    networks: readonly string[],
  ): Promise<NetworkPolicy>
}
