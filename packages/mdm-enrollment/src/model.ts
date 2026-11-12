export type Channel = 'agent' | 'windows_mdm' | 'macos_mdm'
export type NativeSource = 'mdm.windows' | 'mdm.apple'
export type Source = NativeSource | 'agent.builtin'
export type Platform = 'windows' | 'macos'
export interface Target {
  readonly platform: Platform
  readonly architecture: 'x86_64' | 'aarch64'
}
export interface User {
  readonly tenantId: string
  readonly instanceId: string
  readonly principalId: string
}
export interface Query<F extends string = string> {
  readonly filter?: string | undefined
  readonly sort?: readonly string[] | undefined
  readonly fields?: readonly F[] | undefined
  readonly limit?: number | undefined
  readonly cursor?: string | undefined
}
export interface Page<T> {
  readonly items: readonly T[]
  readonly nextCursor: string | null
}
export interface Download {
  readonly bytes: ArrayBuffer
  readonly contentType: string
  readonly filename: string
}
export interface ChannelSetting {
  readonly channel: Channel
  readonly revision: number
  readonly admission: 'allowed' | 'paused'
}
export interface ChannelStatus extends ChannelSetting {
  readonly availability: 'unconfigured' | 'ready' | 'fault'
  readonly reason:
    | 'not_configured'
    | 'certificate_unavailable'
    | 'push_unavailable'
    | 'clock_unavailable'
    | null
}
export interface Channels {
  readonly tenantId: string
  readonly instanceId: string
  readonly channels: readonly ChannelStatus[]
  readonly publicEndpoints: {
    readonly console: string
    readonly agent: readonly string[]
    readonly windowsEnrollment: string | null
    readonly windowsManagement: readonly string[]
    readonly appleManagement: string | null
  }
}
export type Limits = Readonly<Record<Channel, number | null>>
export interface QuotaConfiguration {
  readonly revision: number
  readonly limits: Limits
}
export interface Usage extends User {
  readonly channels: readonly {
    readonly channel: Channel
    readonly limit: number
    readonly active: number
    readonly reserved: number
    readonly used: number
    readonly overLimit: number
  }[]
  readonly asOf: number
}
export interface SelfOptions {
  readonly channels: readonly {
    readonly source: NativeSource
    readonly requiresLocalAdministrator: boolean
  }[]
  readonly quotas: Usage
}
export type NativeInstructions =
  | {
      readonly platform: 'windows'
      readonly server: string
      readonly discoveryUrl: string
      readonly username: string
      readonly windowsProfile: 'Full' | 'Device'
      readonly requiresLocalAdministrator: boolean
    }
  | {
      readonly platform: 'windows_entra'
      readonly discoveryUrl: string
      readonly windowsProfile: 'Full'
      readonly enrollmentMethod: 'entra_user_credential'
    }
  | {
      readonly platform: 'macos'
      readonly profileUrl: string
      readonly enrollmentMethod: 'profile_based_device_enrollment'
    }
  | {
      readonly platform: 'macos_account'
      readonly managedAccount: string
      readonly enrollmentMethod: 'account_driven_device_enrollment'
    }
  | { readonly platform: 'macos_ade'; readonly enrollmentMethod: 'automated_device_enrollment' }
  | { readonly platform: 'unavailable' }
export interface EnrollmentStatus {
  readonly enrollmentId: string
  readonly status: 'pending' | 'bound' | 'cancelled' | 'expired'
  readonly expiresAt: number
  readonly deviceId: string
  readonly source: NativeSource
}
export interface Enrollment extends EnrollmentStatus {
  readonly instructions: NativeInstructions
  readonly progress: {
    readonly profilePrepared: 'observed' | 'unknown' | 'not_applicable'
    readonly certificateIssued: boolean
    readonly firstAuthenticatedCheckIn: boolean
    readonly systemConfirmation: 'observed' | 'unknown' | 'not_applicable'
    readonly managementReady: boolean
    readonly diagnostic:
      | 'awaiting_system_confirmation'
      | 'awaiting_certificate'
      | 'awaiting_first_check_in'
      | 'awaiting_device_token'
      | 'reauthentication_required'
      | 'expired'
      | 'cancelled'
      | 'revoked'
      | 'superseded'
      | 'credential_unavailable'
      | 'channel_unavailable'
      | 'ready'
  }
}
export interface EnrollmentReceipt extends EnrollmentStatus {
  readonly operationId: string
}
/** Contains no password. The caller supplies it only to the submission closure. */
export interface NativeIntent {
  readonly operationId: string
  readonly source: NativeSource
  readonly windowsProfile: 'Full' | 'Device'
}
export interface Registration {
  readonly deviceId: string
  readonly enrollmentId: string | null
  readonly certificateGrantId: string | null
  readonly enrolledUser: boolean
  readonly source: Source | null
  readonly status: 'pending' | 'active' | 'revoked' | 'cancelled' | 'expired'
  readonly windowsDeclared: { readonly requestId: string; readonly ready: boolean } | null
}

export type Quantity =
  | { readonly kind: 'finite'; readonly count: number }
  | { readonly kind: 'unlimited' }
export interface ConfigurationIntent {
  readonly operationId: string
  readonly lifetimeSeconds: number | null
  readonly quantity: Quantity
  readonly targets: readonly Target[]
}
/** Installation metadata only. Connections owns the complete signed connection document. */
export interface Configuration {
  readonly configurationId: string
  readonly tenantId: string
  readonly serviceId: string
  readonly connectionRevision: number
  readonly preferredOrigin: string
  readonly origins: readonly string[]
  readonly targets: readonly Target[]
  readonly expiresAt: number
  readonly quantity: Quantity
  readonly keyId: string
}
export interface ConfigurationDetail {
  readonly configuration: Configuration
  readonly state: 'available' | 'expired' | 'revoked'
  readonly createdBy: string
  readonly responsibleUser: User | null
  readonly reserved: number
  readonly consumed: number
  readonly remaining: number | null
}
export interface ConfigurationRow {
  readonly configurationId: string
  readonly state?: ConfigurationDetail['state']
  readonly createdAt?: number
  readonly expiresAt?: number
  readonly createdBy?: string
  readonly targets?: readonly Target[]
  readonly quantity?: Quantity
  readonly reserved?: number
  readonly consumed?: number
  readonly remaining?: number | null
}
export interface AgentSettingsValues {
  readonly grantSeconds: number
  readonly configurationDefaultSeconds: number
  readonly platforms: readonly Platform[]
}
export interface AgentSettings {
  readonly revision: number
  readonly values: AgentSettingsValues
  readonly grantMaxSeconds: number
  readonly configurationMaxSeconds: number
  readonly configurationFilename: string
}
export interface Installer {
  readonly releaseId: string
  readonly tenantId: string
  readonly target: Target
  readonly version: string
  readonly format: 'windows_exe' | 'windows_msi' | 'windows_msix' | 'macos_pkg'
  readonly filename: string
  readonly length: number
  readonly installerSha256: readonly number[]
}
export interface Terms {
  readonly termsText: string
  readonly termsVersion: string
  readonly mode: 'azureadjoin' | null
  readonly canDecline: boolean
  readonly csrfToken: string
  readonly expiresAt: number
}
export interface EntraPolicy {
  readonly enabled: boolean
  readonly allUsers: boolean
  readonly users: readonly string[]
  readonly termsVersion: string
  readonly termsText: string
  readonly allowBackground: boolean
}
export interface EntraDetail {
  readonly revision: number
  readonly policy: EntraPolicy
}
export interface AccountEnrollment {
  readonly domain: string
  readonly serverUuid: string
  readonly signingKey: string
  readonly enabled: boolean
  readonly revision: number
  readonly signingKeyConfigured: boolean
  readonly externalOrganizationVerification: 'not_observed'
}
export interface AccountOrganizationInput {
  readonly expectedRevision: number
  readonly domain: string
  readonly serverUuid: string
  readonly signingKey: string
  readonly enabled: boolean
}
export interface AccountMappingInput {
  readonly expectedRevision: number
  readonly principalId: string
  readonly instanceId: string
  readonly enabled: boolean
}
export interface AccountMapping {
  readonly account: string
  readonly principalId: string
  readonly instanceId: string
  readonly enabled: boolean
  readonly revision: number
}
export interface AdeStatus {
  readonly organizationId: string
  readonly revision: number
  readonly enabled: boolean
  readonly serverUuid: string
  readonly orgId: string
  readonly keyId: string
  readonly tokenRevision: number
  readonly tokenExpiresAt: number | null
  readonly tokenState: 'missing' | 'expired' | 'invalid' | 'verified' | 'unverified'
  readonly syncedAt: number | null
  readonly externalDeviceVerification: 'not_observed'
}
export interface OrganizationRow {
  readonly id: string
  readonly accountEnrollment?: AccountEnrollment | null
  readonly ade?: AdeStatus | null
}
export interface AdeConfiguration {
  readonly expectedRevision: number
  readonly enabled: boolean
  readonly serverUuid: string
  readonly orgId: string
  readonly rotateKey: boolean
}
export const setupPanes = [
  'AppleID',
  'Appearance',
  'AppStore',
  'Biometric',
  'Diagnostics',
  'FileVault',
  'EnableLockdownMode',
  'iCloudDiagnostics',
  'iCloudStorage',
  'Location',
  'Payment',
  'Passcode',
  'Privacy',
  'Restore',
  'ScreenTime',
  'Siri',
  'TOS',
  'Welcome',
  'TermsOfAddress',
  'UnlockWithWatch',
  'Accessibility',
  'Intelligence',
] as const
export interface AdeSetup {
  readonly name: string
  readonly mandatory: boolean
  readonly removable: boolean
  readonly skip: readonly (typeof setupPanes)[number][]
}
export interface AdeProfile {
  readonly id: string
  readonly revision?: number
  readonly configuration?: AdeSetup
  readonly remoteUuid?: string | null
}
export interface AdeDevice {
  readonly serial: string
  readonly deleted?: boolean
  readonly profileUuid?: string | null
  readonly observedAt?: number
  readonly registration?: 'not_implied'
}
export type AdeCommand =
  | { readonly kind: 'token'; readonly expectedRevision: number; readonly p7m: string }
  | { readonly kind: 'sync'; readonly full: boolean }
  | {
      readonly kind: 'profile'
      readonly id: string
      readonly expectedRevision: number
      readonly configuration: AdeSetup
    }
  | {
      readonly kind: 'assign'
      readonly profile: string
      readonly revision: number
      readonly devices: readonly string[]
    }
  | { readonly kind: 'clear'; readonly devices: readonly string[] }
  | { readonly kind: 'reconcile'; readonly operation: string }
  | { readonly kind: 'resolve'; readonly operation: string; readonly remoteProfile: string }
export interface AdeOperation {
  readonly operationId: string
  readonly kind: AdeCommand['kind'] | 'configuration'
  readonly state: 'pending' | 'running' | 'succeeded' | 'failed' | 'unknown' | 'superseded'
  readonly result: Readonly<Record<string, unknown>> | null
}
export interface PublicEnrollmentPort {
  packages(): Promise<readonly Installer[]>
  package(id: string): Promise<Installer>
  packageUrl(id: string): string
  terms(): Promise<Terms>
  termsFinishUrl(): string
  appleBridgeUrl(): string
}
export interface EnrollmentPort {
  channels(): Promise<Channels>
  admission(
    channel: Channel,
    operationId: string,
    expectedRevision: number,
    admission: ChannelSetting['admission'],
  ): Promise<ChannelSetting>
  quota(target: User | null): Promise<QuotaConfiguration>
  usage(target: User | null): Promise<Usage>
  saveQuota(
    target: User | null,
    operationId: string,
    expectedRevision: number,
    limits: Limits,
  ): Promise<QuotaConfiguration>
  selfOptions(): Promise<SelfOptions>
  createNative(intent: NativeIntent, password: string): Promise<EnrollmentReceipt>
  enrollment(id: string): Promise<Enrollment>
  resume(id: string, operationId: string, password: string): Promise<EnrollmentReceipt>
  cancel(id: string, operationId: string): Promise<EnrollmentReceipt>
  profile(id: string, password: string): Promise<Download>
  registration(device: string, signal?: AbortSignal): Promise<Registration>
  revokeRegistration(device: string, operationId: string): Promise<{ readonly operationId: string; readonly deviceId: string }>
  agentSettings(): Promise<AgentSettings>
  saveAgentSettings(
    operationId: string,
    expectedRevision: number,
    values: AgentSettingsValues,
  ): Promise<AgentSettings>
  configurations(query: Query<keyof ConfigurationRow>): Promise<Page<ConfigurationRow>>
  configuration(id: string): Promise<ConfigurationDetail>
  configurationOperation(operationId: string): Promise<ConfigurationDetail | null>
  issueConfiguration(
    intent: ConfigurationIntent,
    secret: string,
  ): Promise<{ readonly file: Download; readonly configuration: Configuration }>
  revokeConfiguration(id: string, operationId: string): Promise<void>
  entra(): Promise<EntraDetail>
  saveEntra(operationId: string, expectedRevision: number, policy: EntraPolicy): Promise<number>
}
export interface AppleEnrollmentPort {
  organizations(query: Query<keyof OrganizationRow>): Promise<Page<OrganizationRow>>
  accountOrganization(id: string): Promise<AccountEnrollment | null>
  saveAccountOrganization(
    id: string,
    operationId: string,
    input: AccountOrganizationInput,
  ): Promise<number>
  accounts(
    id: string,
    query: Query<'account' | 'principalId' | 'instanceId' | 'revision' | 'enabled'>,
  ): Promise<Page<Partial<AccountMapping> & { readonly account: string }>>
  account(id: string, account: string): Promise<Omit<AccountMapping, 'expectedRevision'>>
  saveAccount(
    id: string,
    account: string,
    operationId: string,
    input: AccountMappingInput,
  ): Promise<number>
  ade(id: string): Promise<AdeStatus>
  configureAde(
    id: string,
    operationId: string,
    input: AdeConfiguration,
  ): Promise<{
    readonly operationId: string
    readonly state: 'succeeded'
    readonly revision: number
  }>
  adePublicKey(id: string): Promise<Download>
  adeProfiles(id: string, query: Query<keyof AdeProfile>): Promise<Page<AdeProfile>>
  adeDevices(id: string, query: Query<keyof AdeDevice>): Promise<Page<AdeDevice>>
  adeCommand(
    id: string,
    operationId: string,
    command: AdeCommand,
  ): Promise<{ readonly operationId: string; readonly state: 'pending' | 'succeeded' }>
  adeOperation(id: string, operationId: string): Promise<AdeOperation>
}
