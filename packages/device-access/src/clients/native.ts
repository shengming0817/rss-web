import type { Application, Binding, Computer, Material, Observation, Platform } from '../model'
import {
  object,
  closed,
  text,
  count,
  bool,
  uuid,
  nullable,
  list,
  choice,
  same,
} from '../model/decode'
/** Decode only requested/current public facts. No last-known value is promoted to current. */
export function nativeComputer(value: unknown): Computer {
  const v = object(value),
    id = text(v['id'], 256),
    p = closed(v['platform'], ['state', 'values'])
  const state = choice(p['state'], ['known', 'unknown', 'conflict']),
    platforms = list(p['values'], (v) => choice(v, ['windows', 'macos']))
  if (
    (state === 'known' && platforms.length !== 1) ||
    (state === 'unknown' && platforms.length !== 0) ||
    (state === 'conflict' && platforms.length < 2)
  )
    throw new Error('Invalid platform')
  let name: string | null = null
  if (v['displayName'] !== undefined) {
    const f = object(v['displayName']),
      s = object(f['state'])
    if (s['kind'] === 'known') {
      const scalar = closed(s['value'], ['kind', 'value'])
      if (scalar['kind'] === 'string') name = text(scalar['value'], 256)
    }
  }
  const channels = list(v['channels'], (raw) => {
    const c = object(raw)
    return {
      id: uuid(c['registrationId']),
      generation: count(c['generation']),
      status: choice(c['status'], ['active', 'revoked', 'superseded']),
      at: nullable(c['lastCommunicationReceivedAt'], count),
      channel: choice(c['channel'], ['agent', 'mdm']),
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
    status: choice(v['status'], [
      'active',
      'pending',
      'revoked',
      'superseded',
      'registered',
      'cancelled',
      'expired',
    ]),
    lastObservedAt: times.length ? Math.max(...times) : null,
  }
}
export function nativeAccountLabel(value: unknown) {
  const account = value === null ? null : object(value)
  let accountLabel = 'unknown'
  if (account) {
    const platform = choice(account['platform'], ['windows', 'macos'])
    accountLabel = platform === 'windows' ? text(account['sid']) : uuid(account['generatedUid'])
  }
  return accountLabel
}
export function nativeBindingObservations(value: unknown): Observation[] {
  const observations: Observation[] = []
  const native = (key: string, value: unknown) => {
    const v = choice(value, ['present', 'absent', 'unknown', 'needs_administrator'])
    observations.push({
      key,
      state: v === 'unknown' ? 'unknown' : v === 'needs_administrator' ? 'pending' : 'known',
      value: v,
    })
  }
  if (value !== null) {
    const e = object(value),
      effect = choice(e['state'], ['applied', 'unbound', 'unknown', 'failed', 'whfb_retired'])
    observations.push({
      key: 'effect',
      state: effect === 'unknown' ? 'unknown' : effect === 'failed' ? 'failed' : 'known',
      value: effect,
    })
    if (effect === 'applied') {
      observations.push({
        key: 'role',
        state: 'known',
        value: choice(e['role'], ['standard', 'administrator']),
      })
      if (e['mac'] !== null) {
        const m = object(e['mac'])
        native('secureToken', m['secureToken'])
        native('volumeOwner', m['volumeOwner'])
        native('filevaultUnlock', m['filevaultUnlock'])
        if (m['platformSso'] !== null) {
          const p = object(m['platformSso'])
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
        value: choice(e['reason'], [
          'unsupported',
          'account_changed',
          'name_conflict',
          'recovery_account_protected',
          'needs_user',
          'native_failure',
        ]),
      })
  }
  return observations
}
export function nativeBinding(value: unknown, device: string): Binding {
  const v = object(value)
  same(v['device'], device)
  const accountLabel = nativeAccountLabel(v['account'])
  const observations = nativeBindingObservations(v['effect'])
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
    serverState: choice(v['serverState'], ['pending', 'active', 'revoked']),
    observations,
  }
}
export function nativeMaterial(value: unknown, device: string): Material {
  const v = closed(value, [
      'id',
      'binding',
      'version',
      'current',
      'validity',
      'escrowed',
      'operation',
      'createdAt',
      'invalidatedAt',
    ]),
    b = closed(v['binding'], ['device', 'registration', 'generation', 'subject']),
    s = object(b['subject'])
  same(b['device'], device)
  const kind = choice(s['kind'], [
    'rss_login',
    'bitlocker',
    'local_administrator',
    'filevault',
    'recovery_lock',
    'lock_pin',
  ])
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
    escrowed: bool(v['escrowed']),
    validity: choice(v['validity'], ['unverified', 'verified', 'unknown', 'superseded', 'revoked']),
    current: bool(v['current']),
  }
}
export function application(value: unknown): Application {
  const v = closed(value, [
    'id',
    'revision',
    'enabled',
    'callback',
    'targetFingerprint',
    'capabilities',
  ])
  const callback = text(v['callback'])
  const u = new URL(callback)
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash)
    throw new Error('Invalid callback')
  return {
    id: text(v['id'], 64),
    revision: count(v['revision']),
    enabled: bool(v['enabled']),
    callback,
    capabilities: list(v['capabilities'], (x) => choice(x, ['native_key', 'password'])),
  }
}
