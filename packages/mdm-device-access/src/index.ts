import type { DirectoryQuery, Page } from '@rss/mdm-devices'
import { freeze, uuid } from '@rss/mdm-inventory'
export interface Binding {
  readonly instance: string
  readonly principal: string
  readonly account: Account | null
  readonly accountIntent: AccountIntent
  readonly disposition: 'keep' | 'disable' | 'standard'

  readonly id: string
  readonly operationId: string
  readonly device: string
  readonly registration: string
  readonly registrationGeneration: number
  readonly bindingGeneration: number
  readonly factorGeneration: number
  readonly revision: number
  readonly serverState: 'pending' | 'active' | 'revoked'
  readonly policy: string
  readonly policyVersion: string
  readonly receivedRevision: number | null
  readonly appliedRevision: number | null
  readonly effect: 'applied' | 'whfb_retired' | 'unbound' | 'unknown' | 'failed' | null
}
export interface EnterpriseRecord {
  readonly id: string
  readonly kind: 'relying_party' | 'subject' | 'windows_key'
  readonly revision: number
  readonly enabled: boolean | null
  readonly reference: string
}
export interface DeviceAccessPort {
  beginBinding(
    device: string,
    id: string,
    input: BindingChange,
    signal: AbortSignal,
  ): Promise<AuthorizationChallenge>
  changeBinding(device: string, id: string, input: BindingChange): Promise<Binding>
  enterpriseDetail(id: string): Promise<EnterpriseDetail>
  beginEnterprise(input: EnterpriseChange, signal: AbortSignal): Promise<AuthorizationChallenge>
  changeEnterprise(input: EnterpriseChange): Promise<EnterpriseDetail>
  platformSso(device: string): Promise<PlatformSsoConfiguration>

  bindings(device: string, query: DirectoryQuery): Promise<Page<Binding>>
  binding(device: string, id: string): Promise<Binding>
  operation(device: string, id: string): Promise<Binding>
  enterprise(query: DirectoryQuery): Promise<Page<EnterpriseRecord>>
}
function device(value: string) {
  if (!value || new TextEncoder().encode(value).length > 256 || /\p{Cc}/u.test(value))
    throw new Error('Invalid device')
  return value
}
export function createDeviceAccess(port: DeviceAccessPort) {
  return Object.freeze({
    beginBinding: (target: string, id: string, input: BindingChange, signal: AbortSignal) => {
      validateBindingChange(input)
      return port.beginBinding(device(target), uuid(id), freeze(input), signal)
    },
    async changeBinding(target: string, id: string, input: BindingChange) {
      validateBindingChange(input)
      const value = await port.changeBinding(device(target), uuid(id), freeze(input))
      if (
        value.id !== id ||
        value.device !== target ||
        value.operationId !== input.operationId ||
        value.revision !== input.expectedRevision + 1
      )
        throw new Error('Wrong binding change receipt')
      if (
        input.action.kind === 'put' &&
        (value.instance !== input.action.instance ||
          value.principal !== input.action.principal ||
          value.policy !== input.action.policy)
      )
        throw new Error('Wrong binding subject receipt')
      return value
    },
    enterpriseDetail: (id: string) => port.enterpriseDetail(id),
    beginEnterprise: (input: EnterpriseChange, signal: AbortSignal) => {
      validateEnterpriseChange(input)
      return port.beginEnterprise(freeze(input), signal)
    },
    async changeEnterprise(input: EnterpriseChange) {
      validateEnterpriseChange(input)
      const value = await port.changeEnterprise(freeze(input))
      if (
        value.id !== enterpriseId(input.configuration) ||
        value.revision !== input.expectedRevision + 1
      )
        throw new Error('Wrong enterprise configuration receipt')
      return value
    },
    platformSso: (target: string) => port.platformSso(device(target)),
    bindings: (id: string, query: DirectoryQuery = {}) => port.bindings(device(id), query),
    async binding(target: string, id: string) {
      const value = await port.binding(device(target), uuid(id))
      if (value.device !== target || value.id !== id) throw new Error('Wrong binding')
      return value
    },
    async operation(target: string, id: string) {
      const value = await port.operation(device(target), uuid(id))
      if (value.device !== target || value.operationId !== id)
        throw new Error('Wrong binding operation')
      return value
    },
    enterprise: (query: DirectoryQuery = {}) => port.enterprise(query),
  })
}

export type Account =
  | { readonly platform: 'macos'; readonly generatedUid: string }
  | {
      readonly platform: 'windows'
      readonly sid: string
      readonly authority:
        | { readonly kind: 'local' }
        | { readonly kind: 'active_directory'; readonly domainSid: string }
        | { readonly kind: 'entra'; readonly tenantId: string; readonly objectId: string }
    }
export type AccountIntent =
  | { readonly kind: 'create'; readonly platform: 'windows' | 'macos'; readonly name: string }
  | { readonly kind: 'existing'; readonly account: Account }
export type BindingAction =
  | {
      readonly kind: 'put'
      readonly instance: string
      readonly principal: string
      readonly policy: string
      readonly account: AccountIntent
    }
  | { readonly kind: 'reset_factors' }
  | { readonly kind: 'unbind'; readonly disposition: 'keep' | 'disable' | 'standard' }
export interface BindingChange {
  readonly operationId: string
  readonly expectedRevision: number
  readonly action: BindingAction
}
export type EnterpriseConfiguration =
  | {
      readonly kind: 'relying_party'
      readonly id: string
      readonly enabled: boolean
      readonly callback: string
      readonly capabilities: readonly ('native_key' | 'password')[]
    }
  | {
      readonly kind: 'subject'
      readonly provider: string
      readonly person: { readonly instance: string; readonly principal: string }
      readonly enabled: boolean
      readonly subject: string
      readonly username: string
    }
export interface EnterpriseChange {
  readonly operationId: string
  readonly expectedRevision: number
  readonly configuration: EnterpriseConfiguration
}
export interface EnterpriseDetail {
  readonly id: string
  readonly revision: number
  readonly configuration: EnterpriseConfiguration | null
  readonly targetFingerprint: string | null
}
export interface AuthorizationChallenge {
  readonly id: string
  readonly publicKey: Readonly<Record<string, unknown>>
}
export interface PlatformSsoConfiguration {
  readonly teamId: string
  readonly extensionId: string
  readonly applicationId: string
  readonly applicationVersion: string
  readonly clientId: string
  readonly issuer: string
  readonly base: string
  readonly profileId: string
  readonly profileUuid: string
  readonly deploymentOrder: readonly string[]
  readonly registrationTrust: string
  readonly hardwareAttested: boolean
}

export function enterpriseId(value: EnterpriseConfiguration) {
  return value.kind === 'relying_party'
    ? `rp:${value.id}`
    : `subject:${value.provider}:${value.person.principal}`
}
function revision(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid revision')
}
export function validateBindingChange(value: BindingChange) {
  uuid(value.operationId)
  revision(value.expectedRevision)
  if (value.action.kind === 'put') {
    uuid(value.action.instance)
    uuid(value.action.principal)
    uuid(value.action.policy)
    if (
      value.action.account.kind === 'create' &&
      (!value.action.account.name ||
        new TextEncoder().encode(value.action.account.name).length > 256)
    )
      throw new Error('Invalid local account name')
  } else if (!['reset_factors', 'unbind'].includes(value.action.kind))
    throw new Error('Unsupported binding action')
}
export function validateEnterpriseChange(value: EnterpriseChange) {
  uuid(value.operationId)
  revision(value.expectedRevision)
  const config = value.configuration
  if (config.kind === 'relying_party') {
    const url = new URL(config.callback)
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(config.id) ||
      url.protocol !== 'https:' ||
      url.href !== config.callback ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !config.capabilities.length ||
      new Set(config.capabilities).size !== config.capabilities.length
    )
      throw new Error('Invalid relying party configuration')
  } else {
    uuid(config.provider)
    uuid(config.person.instance)
    uuid(config.person.principal)
    if (!config.subject || !config.username) throw new Error('Enterprise subject required')
  }
}
