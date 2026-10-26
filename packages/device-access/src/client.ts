import type { Challenge } from './clients/security'
import type { HttpTransport } from '@rss/api/mdm'
import type {
  Application,
  ApplicationInput,
  Assignment,
  AuditEntry,
  Binding,
  Capabilities,
  Computer,
  Configuration,
  ConfigurationInput,
  Credential,
  Material,
  OriginalOperation,
  Page,
  PasskeyRecord,
  Person,
} from './model'
export interface BindingInput {
  operationId: string
  expectedRevision: number
  action:
    | {
        kind: 'put'
        instance: string
        principal: string
        policy: string
        account: { kind: 'create'; platform: 'windows' | 'macos'; name: string }
      }
    | { kind: 'reset_factors' }
}
export interface DeviceAccessClient {
  capabilities: Capabilities
  computers(cursor: string | null, signal: AbortSignal): Promise<Page<Computer>>
  computer(device: string, signal: AbortSignal): Promise<Computer>
  bindings(device: string, cursor: string | null, signal: AbortSignal): Promise<Page<Binding>>
  changeBinding(
    device: string,
    id: string,
    input: BindingInput,
    signal: AbortSignal,
  ): Promise<Binding>
  bindingOperation(device: string, id: string, signal: AbortSignal): Promise<Binding>
  assignment(device: string, signal: AbortSignal): Promise<Assignment>
  people(signal: AbortSignal): Promise<Person[]>
  assign(
    device: string,
    input: {
      operationId: string
      expectedRevision: number
      assignee: Person | null
      owner: Person | null
    },
    signal: AbortSignal,
  ): Promise<Assignment>
  passkeys(device: string, cursor: string | null, signal: AbortSignal): Promise<Page<PasskeyRecord>>
  materials(device: string, cursor: string | null, signal: AbortSignal): Promise<Page<Material>>
  materialChallenge(
    device: string,
    material: Material,
    operationId: string,
    signal: AbortSignal,
  ): Promise<Challenge>
  applicationChallenge(input: ApplicationInput, signal: AbortSignal): Promise<Challenge>
  bindingChallenge(
    device: string,
    id: string,
    input: BindingInput,
    signal: AbortSignal,
  ): Promise<Challenge>
  reveal(
    device: string,
    material: Material,
    operationId: string,
    signal: AbortSignal,
  ): Promise<string>
  rotate(
    device: string,
    material: Material,
    operationId: string,
    signal: AbortSignal,
  ): Promise<OriginalOperation>
  operation(
    device: string | null,
    id: string,
    signal: AbortSignal,
  ): Promise<OriginalOperation | null>
  configurations(cursor: string | null, signal: AbortSignal): Promise<Page<Configuration>>
  configuration(input: ConfigurationInput, signal: AbortSignal): Promise<Configuration>
  scopes(signal: AbortSignal): Promise<Person[]>
  applications(cursor: string | null, signal: AbortSignal): Promise<Page<Application>>
  application(input: ApplicationInput, signal: AbortSignal): Promise<Application>
  audit(
    device: string | null,
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<Page<AuditEntry>>
}
export interface SecurityClient {
  list(signal: AbortSignal): Promise<Credential[]>
  register(label: string, signal: AbortSignal): Promise<Credential>
  remove(id: string, signal: AbortSignal): Promise<void>
  reauthenticate(signal: AbortSignal): Promise<void>
  prove(value: Challenge, signal: AbortSignal): Promise<void>
  cancel(): Promise<void>
}
export interface ClientFactoryInput {
  business: HttpTransport
  identity: HttpTransport
  tenant: string
}
export { createLiveClient } from './clients/live'
export { createSecurityClient } from './clients/security'

export type { Challenge } from './clients/security'
