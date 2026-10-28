import * as wireSchemas from '@rss/api/mdm-schemas'
import type { Application, Binding, Computer, Material, Observation, Platform } from '../model'
import { text, count, uuid, nullable, list, choice, same } from '../model/decode'
/** Decode only requested/current public facts. No last-known value is promoted to current. */
export function nativeComputer(value: unknown): Computer {
  if (!wireSchemas.getApiV1DeviceViewsByKindByIdResponse.validateEndpoint(value))
    throw new Error('Invalid MDM contract')

  const v = value,
    id = text(v['id'], 256),
    p = v['platform']
  const state = p['state'],
    platforms = list(p['values'], (v) => v)
  if (
    (state === 'known' && platforms.length !== 1) ||
    (state === 'unknown' && platforms.length !== 0) ||
    (state === 'conflict' && platforms.length < 2)
  )
    throw new Error('Invalid platform')
  let name: string | null = null
  const display = v.displayName?.state
  if (display?.kind === 'known' && display.value.kind === 'string')
    name = text(display.value.value, 256)
  const channels = list(v['channels'], (raw) => {
    const c = raw
    return {
      id: uuid(c['registrationId']),
      generation: count(c['generation']),
      status: c['status'],
      at: nullable(c['lastCommunicationReceivedAt'], count),
      channel: c['channel'],
    }
  })
  const agent = channels.find((c) => c.channel === 'agent' && c.status === 'active'),
    times = channels.flatMap((c) => (c.at === null ? [] : [c.at]))
  return {
    id,
    name: name ?? id,
    platform: (state === 'known' ? platforms[0] : 'unknown') as Platform,
    registration: agent?.id ?? null,
    generation: agent?.generation ?? null,
    status: v['status'],
    lastObservedAt: times.length ? Math.max(...times) : null,
  }
}
export function nativeBinding(value: unknown, device: string): Binding {
  if (!wireSchemas.getApiV1DevicesByDeviceDeviceAccessBindingsByIdResponse.validateRoot(value))
    throw new Error('Invalid MDM contract')

  const v = value
  same(v['device'], device)
  const account = v['account'] === null ? null : v['account']
  let accountLabel = 'unknown'
  if (account) {
    const platform = account.platform
    accountLabel = platform === 'windows' ? text(account['sid']) : uuid(account['generatedUid'])
  }
  const observations: Observation[] = []
  const native = (key: string, value: unknown) => {
    const v = choice(value, ['present', 'absent', 'unknown', 'needs_administrator'])
    observations.push({
      key,
      state: v === 'unknown' ? 'unknown' : v === 'needs_administrator' ? 'pending' : 'known',
      value: v,
    })
  }
  if (v['effect'] !== null) {
    const e = v['effect'],
      effect = e.state
    observations.push({
      key: 'effect',
      state: effect === 'unknown' ? 'unknown' : effect === 'failed' ? 'failed' : 'known',
      value: effect,
    })
    if (effect === 'applied') {
      observations.push({
        key: 'role',
        state: 'known',
        value: e['role'],
      })
      if (e['mac'] !== null) {
        const m = e.mac
        native('secureToken', m['secureToken'])
        native('volumeOwner', m['volumeOwner'])
        native('filevaultUnlock', m['filevaultUnlock'])
        if (m['platformSso'] !== null) {
          const p = m.platformSso
          native('configuration', p['configuration'])
          native('deviceRegistered', p['deviceRegistered'])
          native('userRegistered', p['userRegistered'])
        }
      }
    }
    if (effect === 'failed')
      observations.push({
        key: 'reason',
        state: 'failed',
        value: e['reason'],
      })
  }
  return {
    id: uuid(v['id']),
    device,
    revision: count(v['revision']),
    principal: uuid(v['principal']),
    instance: uuid(v['instance']),
    bindingGeneration: count(v['bindingGeneration']),
    factorGeneration: count(v['factorGeneration']),
    account: accountLabel,
    targetRevision: count(v['revision']),
    receivedRevision: nullable(v['receivedRevision'], count),
    appliedRevision: nullable(v['appliedRevision'], count),
    serverState: v['serverState'],
    observations,
  }
}
export function nativeMaterial(value: unknown, device: string): Material {
  if (
    !wireSchemas.postApiV1DevicesByDeviceDeviceAccessMaterialsByIdVersionsByVersionSecretResponse.validateMaterial(
      value,
    )
  )
    throw new Error('Invalid MDM contract')

  const v = value,
    b = v['binding'],
    s = b.subject
  same(b['device'], device)
  const kind = s['kind']
  return {
    id: uuid(v['id']),
    device,
    registration: uuid(b['registration']),
    generation: count(b['generation']),
    version: count(v['version']),
    subject: {
      kind,
      binding: kind === 'rss_login' ? uuid(s['binding']) : null,
      bindingGeneration: kind === 'rss_login' ? count(s['bindingGeneration']) : null,
      sid: kind === 'rss_login' ? text(s['sid']) : null,
    },
    escrowed: v['escrowed'],
    validity: v['validity'],
    current: v['current'],
  }
}
export function application(value: unknown): Application {
  if (!wireSchemas.getApiV1DeviceAccessEnterpriseConfigurationResponse.validateRelyingParty(value))
    throw new Error('Invalid MDM contract')

  const v = value
  const callback = text(v['callback'])
  const u = new URL(callback)
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash)
    throw new Error('Invalid callback')
  return {
    id: text(v['id'], 64),
    revision: count(v['revision']),
    enabled: v['enabled'],
    callback,
    capabilities: list(v['capabilities'], (x) => x),
  }
}
