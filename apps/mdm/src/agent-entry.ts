import {
  entryNodes,
  entryUriBytes,
  unaddressableAliases,
  type EntryNamespace,
  type EntrySelector,
} from './agent-entry.generated'

export type EntryTarget = {
  readonly selector: Extract<
    EntrySelector,
    { kind: 'capability' | 'event' | 'batch' | 'task' | 'activity' | 'node' }
  >
  readonly version?: string
  readonly revision?: number
  readonly step?: string
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const name = /^[a-z0-9._-]{1,64}$/
export const addressableAlias = (alias: string) =>
  name.test(alias) && !(unaddressableAliases as readonly string[]).includes(alias)
const bytes = new TextEncoder()
const id = (value: string) =>
  typeof value === 'string' && uuid.test(value) && /[1-9a-f]/.test(value)
const bounded = (value: string) =>
  typeof value === 'string' &&
  value.length > 0 &&
  bytes.encode(value).length <= 256 &&
  !/\p{Cc}/u.test(value)
const positive = (value: number) => Number.isSafeInteger(value) && value > 0
function only(value: object, keys: readonly string[]) {
  if (!value || Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error('Invalid Agent view address')
}

/** Web only emits the view subset of ENTRY-04. Rust remains the receiver and authority. */
export function agentViewEntry(target: EntryTarget, ns: EntryNamespace) {
  only(target, ['selector', 'version', 'revision', 'step'])
  only(ns, ['instance', 'tenant', 'device', 'registration', 'generation'])
  if (
    !id(ns.instance) ||
    !id(ns.tenant) ||
    !id(ns.registration) ||
    !bounded(ns.device) ||
    !positive(ns.generation)
  )
    throw new Error('Invalid Agent namespace')
  const { selector, version, revision, step } = target
  const fields = new URLSearchParams({
    instance: ns.instance,
    tenant: ns.tenant,
    device: ns.device,
    registration: ns.registration,
    generation: String(ns.generation),
  })
  if (version !== undefined || revision !== undefined) {
    if (
      selector.kind !== 'capability' ||
      version === undefined ||
      !id(version) ||
      revision === undefined ||
      !positive(revision)
    )
      throw new Error('Invalid Agent policy version')
    fields.set('version', version)
    fields.set('revision', String(revision))
  }
  if (step !== undefined) {
    if (!['task', 'activity'].includes(selector.kind) || !bounded(step))
      throw new Error('Invalid Agent step')
    fields.set('step', step)
  }
  let kind: string = selector.kind,
    value: string
  switch (selector.kind) {
    case 'capability': {
      only(selector, ['kind', 'selector'])
      const address = selector.selector
      if (address.kind === 'id') {
        only(address, ['kind', 'id'])
        kind = 'id'
        value = address.id
        if (!id(value)) throw new Error('Invalid Agent policy ID')
      } else if (address.kind === 'tool_name') {
        only(address, ['kind', 'name'])
        kind = 'tool'
        value = address.name
        if (!/^policy_[a-f0-9]{32}$/.test(value) || !/[1-9a-f]/.test(value.slice(7)))
          throw new Error('Invalid Agent tool name')
      } else if (address.kind === 'alias') {
        only(address, ['kind', 'alias'])
        kind = 'alias'
        value = address.alias
        if (!addressableAlias(value)) throw new Error('Unaddressable Agent alias')
      } else throw new Error('Invalid Agent capability')
      break
    }
    case 'event':
      only(selector, ['kind', 'name'])
      value = selector.name
      if (!name.test(value)) throw new Error('Invalid Agent event')
      break
    case 'node':
      only(selector, ['kind', 'id'])
      value = selector.id
      if (value !== 'tasks.management' || !entryNodes.includes(value))
        throw new Error('Invalid enterprise page node')
      break
    case 'batch':
      only(selector, ['kind', 'id'])
      value = selector.id
      if (!id(value)) throw new Error('Invalid Agent batch')
      break
    case 'activity':
      only(selector, ['kind', 'id'])
      value = selector.id
      if (!bounded(value) || !/^[a-zA-Z0-9_.:-]+$/.test(value))
        throw new Error('Invalid Agent activity')
      break
    case 'task':
      only(selector, ['kind', 'task', 'attempt'])
      value = selector.task
      if (!id(value) || !id(selector.attempt)) throw new Error('Invalid Agent task attempt')
      fields.set('attempt', selector.attempt)
      break
    default:
      throw new Error('Unsupported Agent view selector')
  }
  fields.sort()
  const uri = `rssmdm://view/v1/${kind}/${value}?${fields.toString().replaceAll('+', '%20')}`
  if (bytes.encode(uri).length > entryUriBytes) throw new Error('Agent view address too long')
  // The path is restricted above, and query serialization encodes shell characters.
  return { uri, command: `rssmdm open '${uri}'` }
}
