import type {
  Application,
  Assignment,
  AuditEntry,
  Binding,
  Computer,
  Configuration,
  Credential,
  Material,
  Observation,
  OriginalOperation,
  PasskeyRecord,
  Person,
} from '../model'
import { closed, text, count, bool, nullable, list, choice, same, uuid } from './decode'
export const person = (value: unknown): Person => {
  const v = closed(value, ['id', 'label'])
  return { id: text(v['id']), label: text(v['label']) }
}
export const observation = (value: unknown): Observation => {
  const v = closed(value, ['key', 'state', 'value'])
  return {
    key: text(v['key']),
    state: choice(v['state'], ['known', 'unknown', 'pending', 'failed']),
    value: nullable(v['value'], text),
  }
}
export function computerView(value: unknown): Computer {
  const v = closed(value, [
    'id',
    'name',
    'platform',
    'registration',
    'generation',
    'status',
    'lastObservedAt',
  ])
  return {
    id: text(v['id']),
    name: text(v['name']),
    platform: choice(v['platform'], ['windows', 'macos', 'unknown']),
    registration: nullable(v['registration'], uuid),
    generation: nullable(v['generation'], count),
    status: text(v['status']),
    lastObservedAt: nullable(v['lastObservedAt'], count),
  }
}
export function assignmentView(value: unknown, device: string): Assignment {
  const v = closed(value, ['device', 'revision', 'assignee', 'owner'])
  same(v['device'], device)
  return {
    device,
    revision: count(v['revision']),
    assignee: nullable(v['assignee'], person),
    owner: nullable(v['owner'], person),
  }
}
export function bindingView(value: unknown, device: string): Binding {
  const v = closed(value, [
    'id',
    'device',
    'revision',
    'principal',
    'instance',
    'bindingGeneration',
    'factorGeneration',
    'account',
    'targetRevision',
    'receivedRevision',
    'appliedRevision',
    'serverState',
    'observations',
  ])
  same(v['device'], device)
  return {
    id: uuid(v['id']),
    device,
    revision: count(v['revision']),
    principal: uuid(v['principal']),
    instance: uuid(v['instance']),
    bindingGeneration: count(v['bindingGeneration']),
    factorGeneration: count(v['factorGeneration']),
    account: text(v['account']),
    targetRevision: count(v['targetRevision']),
    receivedRevision: nullable(v['receivedRevision'], count),
    appliedRevision: nullable(v['appliedRevision'], count),
    serverState: choice(v['serverState'], ['pending', 'active', 'revoked']),
    observations: list(v['observations'], observation),
  }
}
export function passkeyView(value: unknown, device: string): PasskeyRecord {
  const v = closed(value, [
    'id',
    'device',
    'rp',
    'account',
    'label',
    'scope',
    'state',
    'lastObservedAt',
  ])
  same(v['device'], device)
  same(v['scope'], 'enterprise')
  return {
    id: text(v['id']),
    device,
    rp: text(v['rp']),
    account: text(v['account']),
    label: text(v['label']),
    scope: 'enterprise',
    state: choice(v['state'], ['synced', 'pending', 'local_only', 'unknown', 'revoked']),
    lastObservedAt: nullable(v['lastObservedAt'], count),
  }
}
export function materialView(value: unknown, device: string): Material {
  const v = closed(value, [
      'id',
      'device',
      'registration',
      'generation',
      'version',
      'subject',
      'escrowed',
      'validity',
      'current',
    ]),
    s = closed(v['subject'], ['kind', 'binding', 'bindingGeneration', 'sid'])
  same(v['device'], device)
  return {
    id: uuid(v['id']),
    device,
    registration: uuid(v['registration']),
    generation: count(v['generation']),
    version: count(v['version']),
    subject: {
      kind: text(s['kind']),
      binding: nullable(s['binding'], uuid),
      bindingGeneration: nullable(s['bindingGeneration'], count),
      sid: nullable(s['sid'], text),
    },
    escrowed: bool(v['escrowed']),
    validity: text(v['validity']),
    current: bool(v['current']),
  }
}
export function operationView(
  value: unknown,
  device: string | null,
  id: string,
): OriginalOperation {
  const v = closed(value, ['id', 'device', 'kind', 'state', 'observations'])
  same(v['device'], device)
  same(v['id'], id)
  return {
    id: uuid(v['id']),
    device,
    kind: text(v['kind']),
    state: choice(v['state'], ['accepted', 'completed', 'pending', 'unknown']),
    observations: list(v['observations'], observation),
  }
}
export function configurationView(value: unknown): Configuration {
  const v = closed(value, [
    'id',
    'revision',
    'name',
    'platform',
    'role',
    'selfEnrollment',
    'scope',
    'exclusions',
    'state',
    'mode',
  ])
  return {
    id: uuid(v['id']),
    revision: count(v['revision']),
    name: text(v['name']),
    platform: choice(v['platform'], ['windows', 'macos', 'unknown']),
    role: choice(v['role'], ['preserve', 'standard', 'administrator']),
    selfEnrollment: bool(v['selfEnrollment']),
    scope: person(v['scope']),
    exclusions: list(v['exclusions'], person),
    state: choice(v['state'], ['draft', 'published', 'pending']),
    mode: text(v['mode']),
  }
}
export function applicationView(value: unknown): Application {
  const v = closed(value, ['id', 'revision', 'enabled', 'callback', 'capabilities'])
  return {
    id: text(v['id'], 64),
    revision: count(v['revision']),
    enabled: bool(v['enabled']),
    callback: text(v['callback']),
    capabilities: list(v['capabilities'], (v) => choice(v, ['native_key', 'password'])),
  }
}
export function auditView(value: unknown): AuditEntry {
  const v = closed(value, ['id', 'recordedAt', 'actor', 'action', 'device', 'outcome', 'phase'])
  return {
    id: text(v['id']),
    recordedAt: count(v['recordedAt']),
    actor: text(v['actor']),
    action: text(v['action']),
    device: nullable(v['device'], text),
    outcome: text(v['outcome']),
    phase: text(v['phase']),
  }
}
export function credentialView(value: unknown): Credential {
  const v = closed(value, ['id', 'label'])
  return { id: uuid(v['id']), label: text(v['label']) }
}
export { closed, text, count, bool, nullable, list, choice, same, uuid, page } from './decode'
