import { freeze, identifier, operation, revision, uuid, type Operation } from '@rss/mdm-inventory'
import {
  eventTypes,
  type MaterialInput,
  type MaterialIntent,
  type MaterialOperation,
  type MaterialTransition,
  type Settings,
  type SubscriptionChange,
} from './model'

export function reference(value: string): string {
  identifier(value, 128)
  if (value.trim() !== value) throw new Error('Invalid webhook reference')
  return value
}
export function endpoint(value: string): string {
  identifier(value, 2048)
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid webhook HTTPS endpoint')
  return value
}
export function fingerprint(value: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid webhook configuration digest')
  return value
}
/** Descriptive extensions are one bounded document, never an implicit merge. */
export function validatePresentation(value: Readonly<Record<string, unknown>>): void {
  let nodes = 0
  function visit(node: unknown, depth: number): void {
    if (++nodes > 4096 || depth > 16)
      throw new Error('Webhook presentation exceeds structural budget')
    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        identifier(key, 256)
        visit(child, depth + 1)
      }
    } else if (typeof node === 'number' && !Number.isFinite(node))
      throw new Error('Invalid presentation number')
    else if (typeof node === 'string' && node.includes('\0'))
      throw new Error('Invalid presentation text')
    else if (node !== null && !['string', 'number', 'boolean'].includes(typeof node))
      throw new Error('Invalid presentation value')
  }
  if (!value || Array.isArray(value) || typeof value !== 'object')
    throw new Error('Invalid webhook presentation')
  for (const [key, child] of Object.entries(value)) {
    identifier(key, 256)
    visit(child, 1)
  }
  if (new TextEncoder().encode(JSON.stringify(value)).length > 65536)
    throw new Error('Webhook presentation exceeds byte budget')
  reference(value['name'] as string)
}
export function validateSettings(value: Settings): void {
  validatePresentation(value.presentation)
  endpoint(value.endpoint)
  reference(value.keyReference)
  reference(value.networkReference)
  if (
    !value.eventTypes.length ||
    value.eventTypes.length > 5 ||
    new Set(value.eventTypes).size !== value.eventTypes.length ||
    value.eventTypes.some((kind) => !eventTypes.includes(kind))
  )
    throw new Error('Invalid webhook event selection')
  const selection = value.selection
  if (selection.kind === 'allDevices') return
  if (
    !['devices', 'groups'].includes(selection.kind) ||
    !selection.ids.length ||
    selection.ids.length > (selection.kind === 'groups' ? 16 : 256) ||
    new Set(selection.ids).size !== selection.ids.length
  )
    throw new Error('Invalid webhook target selection')
  selection.ids.forEach((id) => (selection.kind === 'groups' ? uuid(id) : identifier(id, 255)))
}
export function validateSubscriptionChange(change: Operation<SubscriptionChange>): void {
  operation(change)
  if (change.input.kind === 'put') validateSettings(change.input.value)
  else if (
    change.input.kind !== 'delete' &&
    !(change.input.kind === 'enabled' && typeof change.input.value === 'boolean')
  )
    throw new Error('Invalid subscription change')
  if (!change.expectedRevision && change.input.kind !== 'put')
    throw new Error('New subscription requires complete settings')
}
export function validateMaterialInput(value: MaterialInput): void {
  reference(value.reference)
  revision(value.expectedRevision)
  fingerprint(value.configurationSha256)
  endpoint(value.endpoint)
  reference(value.networkReference)
  if (value.source.kind === 'import') {
    const secret = value.source.secret
    // Same public input bounds as the pinned Standard Webhooks SigningKey constructor.
    if (secret.length > 94 || !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret))
      throw new Error('Invalid signing secret encoding')
    const encoded = secret.slice(6)
    let bytes: string
    try {
      bytes = atob(encoded)
    } catch {
      throw new Error('Invalid signing secret encoding')
    }
    if (bytes.length < 24 || bytes.length > 64 || btoa(bytes) !== encoded)
      throw new Error('Invalid signing secret length')
  } else if (value.source.kind !== 'generate') throw new Error('Invalid signing material source')
}
/** A pending operation can retain these public fields without retaining its imported secret. */
export function materialIntent(value: MaterialInput): MaterialIntent {
  validateMaterialInput(value)
  return freeze({
    reference: value.reference,
    expectedRevision: value.expectedRevision,
    configurationSha256: value.configurationSha256,
    endpoint: value.endpoint,
    networkReference: value.networkReference,
    source: value.source.kind,
  })
}
export function validateMaterialTransition(value: MaterialTransition): void {
  reference(value.reference)
  revision(value.expectedRevision)
  if (value.action.kind === 'activate' || value.action.kind === 'revoke') {
    if (!revision(value.action.materialRevision)) throw new Error('Invalid exact material revision')
  } else if (value.action.kind !== 'retire_previous') throw new Error('Invalid material transition')
}
/** Validate public receipt coordinates. A GET record cannot prove its missing action/source or full request fingerprint. */
export function matchMaterialOperation(
  id: string,
  original: MaterialIntent | MaterialTransition,
  value: MaterialOperation,
): void {
  uuid(id)
  if (
    value.operationId !== id ||
    value.reference !== original.reference ||
    value.revision !== original.expectedRevision + 1
  )
    throw new Error('Wrong material operation receipt')
  if ('source' in original) {
    if (
      !('configurationSha256' in value) ||
      value.configurationSha256 !== original.configurationSha256 ||
      value.endpoint !== original.endpoint ||
      value.networkReference !== original.networkReference
    )
      throw new Error('Wrong prepared material receipt')
  } else if (
    !('activeRevision' in value) ||
    (original.action.kind === 'activate' &&
      value.activeRevision !== original.action.materialRevision) ||
    (original.action.kind === 'retire_previous' && value.retiringRevision !== null)
  )
    throw new Error('Wrong material transition receipt')
}
