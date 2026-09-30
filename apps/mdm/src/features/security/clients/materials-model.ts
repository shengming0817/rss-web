import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  unique,
  uuid,
} from '../../../services/decode'
import { boundedText, positive } from './compliance-model'
import { securitySource } from './source'
export const materialKinds = [
  'bitlocker',
  'filevault',
  'laps',
  'bootstrap_token',
  'recovery_lock',
] as const
export type MaterialKind = (typeof materialKinds)[number]
export const secretMaterialKinds = ['bitlocker', 'filevault', 'laps', 'recovery_lock'] as const
export const materialActions = ['reveal', 'rotate', 'reescrow'] as const
const encryption = (v: unknown) => enumeration(v, ['on', 'off', 'unknown'] as const)
const escrow = (v: unknown) => enumeration(v, ['available', 'missing', 'unknown'] as const)
const observedBoolean = (v: unknown) => nullable(v, boolean)
function content(kind: MaterialKind, value: unknown) {
  if (kind === 'bitlocker')
    return {
      kind,
      details: nullable(value, (value) => {
        const v = closed(value, ['volumes', 'tpm'])
        const volumes = unique(
          array(v['volumes'], (value) => {
            const x = closed(value, ['id', 'role', 'encryption', 'escrow', 'keyId'])
            return {
              id: identifier(x['id']),
              role: enumeration(x['role'], ['os', 'fixed'] as const),
              encryption: encryption(x['encryption']),
              escrow: escrow(x['escrow']),
              keyId: nullable(x['keyId'], uuid),
            }
          }),
          (r) => r.id,
        )
        if (!volumes.length || volumes.length > 32) throw new Error('Invalid volumes')
        return { volumes, tpm: enumeration(v['tpm'], ['ready', 'missing', 'unknown'] as const) }
      }),
    }
  if (kind === 'filevault')
    return {
      kind,
      details: nullable(value, (value) => {
        const v = closed(value, ['encryption', 'keyType', 'escrow', 'keyId', 'profile'])
        return {
          encryption: encryption(v['encryption']),
          keyType: enumeration(v['keyType'], ['personal', 'institutional', 'unknown'] as const),
          escrow: escrow(v['escrow']),
          keyId: nullable(v['keyId'], uuid),
          profile: enumeration(v['profile'], ['applied', 'missing', 'unknown'] as const),
        }
      }),
    }
  if (kind === 'laps')
    return {
      kind,
      details: nullable(value, (value) => {
        const v = closed(value, [
          'account',
          'backup',
          'policy',
          'escrow',
          'lastRotatedAt',
          'nextRotationAt',
        ])
        return {
          account: boundedText(v['account'], 128),
          backup: enumeration(v['backup'], ['directory', 'cloud', 'unknown'] as const),
          policy: enumeration(v['policy'], ['applied', 'missing', 'unknown'] as const),
          escrow: escrow(v['escrow']),
          lastRotatedAt: nullable(v['lastRotatedAt'], count),
          nextRotationAt: nullable(v['nextRotationAt'], count),
        }
      }),
    }
  if (kind === 'bootstrap_token')
    return {
      kind,
      details: nullable(value, (value) => {
        const v = closed(value, [
          'supported',
          'supervised',
          'ade',
          'deviceChannel',
          'awaitingConfiguration',
          'escrow',
        ])
        return {
          supported: observedBoolean(v['supported']),
          supervised: observedBoolean(v['supervised']),
          ade: observedBoolean(v['ade']),
          deviceChannel: observedBoolean(v['deviceChannel']),
          awaitingConfiguration: observedBoolean(v['awaitingConfiguration']),
          escrow: enumeration(v['escrow'], ['present', 'absent', 'unknown'] as const),
        }
      }),
    }
  return {
    kind,
    details: nullable(value, (value) => {
      const v = closed(value, [
        'appleSilicon',
        'supervised',
        'deviceChannel',
        'accessRight',
        'configured',
        'escrow',
        'verification',
      ])
      return {
        appleSilicon: observedBoolean(v['appleSilicon']),
        supervised: observedBoolean(v['supervised']),
        deviceChannel: observedBoolean(v['deviceChannel']),
        accessRight: observedBoolean(v['accessRight']),
        configured: enumeration(v['configured'], ['yes', 'no', 'unknown'] as const),
        escrow: escrow(v['escrow']),
        verification: enumeration(v['verification'], [
          'verified',
          'unverified',
          'unknown',
        ] as const),
      }
    }),
  }
}
export function material(value: unknown) {
  const v = closed(value, [
      'device',
      'kind',
      'revision',
      'platform',
      'state',
      'evaluatedAt',
      'source',
      'prerequisites',
      'actions',
      'details',
    ]),
    p = closed(v['prerequisites'], ['status', 'reasons']),
    kind = enumeration(v['kind'], materialKinds),
    base = {
      device: identifier(v['device']),
      revision: positive(v['revision']),
      platform: enumeration(v['platform'], ['windows', 'macos', 'unknown'] as const),
      state: enumeration(v['state'], ['observed', 'unknown', 'not_applicable'] as const),
      evaluatedAt: count(v['evaluatedAt']),
      source: nullable(v['source'], securitySource),
      prerequisites: {
        status: enumeration(p['status'], ['eligible', 'ineligible', 'unknown'] as const),
        reasons: unique(
          array(p['reasons'], (v) =>
            enumeration(v, [
              'platform_unsupported',
              'missing_registration',
              'missing_capability',
              'requires_supervision',
              'requires_ade',
              'requires_apple_silicon',
              'requires_device_channel',
              'requires_access_right',
              'source_changed',
              'unknown',
            ] as const),
          ),
          (v) => v,
        ),
      },
      actions: unique(
        array(v['actions'], (v) => enumeration(v, materialActions)),
        (v) => v,
      ),
    },
    result = { ...base, ...content(kind, v['details']) }
  const expectedPlatform = kind === 'bitlocker' || kind === 'laps' ? 'windows' : 'macos'
  if (
    (result.state === 'observed') !== (result.details !== null && result.source !== null) ||
    (result.state !== 'observed' && (result.details !== null || result.source !== null)) ||
    (result.state === 'observed' && result.platform !== expectedPlatform) ||
    (result.prerequisites.status === 'eligible' &&
      (result.state !== 'observed' || result.prerequisites.reasons.length > 0)) ||
    (result.actions.length > 0 && result.prerequisites.status !== 'eligible') ||
    result.actions.some((a) => (kind === 'bootstrap_token' ? a !== 'reescrow' : a === 'reescrow'))
  )
    throw new Error('Invalid material prerequisites')
  if (result.actions.includes('reveal') && !hasEscrow(result))
    throw new Error('Missing material escrow')
  if (
    result.kind === 'bootstrap_token' &&
    result.prerequisites.status === 'eligible' &&
    (!result.details?.supported ||
      !result.details.supervised ||
      !result.details.ade ||
      !result.details.deviceChannel)
  )
    throw new Error('Invalid Bootstrap Token prerequisites')
  if (
    result.kind === 'recovery_lock' &&
    result.prerequisites.status === 'eligible' &&
    (!result.details?.appleSilicon ||
      !result.details.supervised ||
      !result.details.deviceChannel ||
      !result.details.accessRight)
  )
    throw new Error('Invalid Recovery Lock prerequisites')
  return result
}
export type Material = ReturnType<typeof material>
export function hasEscrow(value: Material, volume?: string | null): boolean {
  if (value.kind === 'bootstrap_token') return false
  if (value.kind === 'bitlocker')
    return !!value.details?.volumes.some(
      (v) => (!volume || v.id === volume) && v.escrow === 'available' && v.keyId !== null,
    )
  if (value.kind === 'filevault')
    return (
      value.details?.keyType === 'personal' &&
      value.details.escrow === 'available' &&
      value.details.keyId !== null
    )
  return value.details?.escrow === 'available'
}
