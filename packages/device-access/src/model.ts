/** Product view models. Native wire DTOs are decoded by each owning client. */
export type Platform = 'windows' | 'macos' | 'unknown'
export type Source = 'service' | 'demo'
export interface Page<T> {
  items: T[]
  nextCursor: string | null
}
export interface Computer {
  id: string
  name: string
  platform: Platform
  registration: string | null
  generation: number | null
  status: string
  lastObservedAt: number | null
}
export interface Person {
  id: string
  label: string
}
export interface Assignment {
  device: string
  revision: number
  assignee: Person | null
  owner: Person | null
}
export interface Observation {
  key: string
  state: 'known' | 'unknown' | 'pending' | 'failed'
  value: string | null
}
export interface Binding {
  id: string
  device: string
  revision: number
  principal: string
  instance: string
  bindingGeneration: number
  factorGeneration: number
  account: string
  targetRevision: number
  receivedRevision: number | null
  appliedRevision: number | null
  serverState: 'pending' | 'active' | 'revoked'
  observations: Observation[]
}
export interface PasskeyRecord {
  id: string
  device: string
  rp: string
  account: string
  label: string
  scope: 'enterprise'
  state: 'synced' | 'pending' | 'local_only' | 'unknown' | 'revoked'
  lastObservedAt: number | null
}
export interface Material {
  id: string
  device: string
  registration: string
  generation: number
  version: number
  subject: {
    kind: string
    binding: string | null
    bindingGeneration: number | null
    sid: string | null
  }
  escrowed: boolean
  validity: string
  current: boolean
}
export interface OriginalOperation {
  id: string
  device: string | null
  kind: string
  state: 'accepted' | 'completed' | 'pending' | 'unknown'
  observations: Observation[]
}
export interface Configuration {
  id: string
  revision: number
  name: string
  platform: Platform
  role: 'preserve' | 'standard' | 'administrator'
  selfEnrollment: boolean
  scope: Person
  exclusions: Person[]
  state: 'draft' | 'published' | 'pending'
  mode: string
}
export type ConfigurationInput = Omit<Configuration, 'revision' | 'state'> & {
  operationId: string
  expectedRevision: number
}
export interface Application {
  id: string
  revision: number
  enabled: boolean
  callback: string
  capabilities: ('native_key' | 'password')[]
}
export type ApplicationInput = Omit<Application, 'revision'> & {
  operationId: string
  expectedRevision: number
}
export interface AuditEntry {
  id: string
  recordedAt: number
  actor: string
  action: string
  device: string | null
  outcome: string
  phase: string
}
export interface Credential {
  id: string
  label: string
}
export interface Capability {
  available: boolean
  reason: string | null
  source: Source
}
export interface Capabilities {
  assignment: Capability
  passkeys: Capability
  configuration: Capability
  bindings: Capability
  recovery: Capability
  rotation: Capability
  applications: Capability
  security: Capability
  audit: Capability
}
export class CapabilityUnavailable extends Error {
  readonly capability: string
  constructor(capability: string) {
    super('capability_unavailable')
    this.capability = capability
    this.name = 'CapabilityUnavailable'
  }
}
export * as viewDecoders from './model/views'
