import { closed, count, enumeration, identifier, nullable, uuid } from '../../../services/decode'
import { boundedText, positive } from './compliance-model'
import { securitySource } from './source'
export function certificateCredential(value: unknown) {
  const v = closed(value, ['serial', 'fingerprint', 'subject', 'notBefore', 'notAfter']),
    result = {
      serial: identifier(v['serial']),
      fingerprint: identifier(v['fingerprint']),
      subject: boundedText(v['subject'], 256),
      notBefore: count(v['notBefore']),
      notAfter: count(v['notAfter']),
    }
  if (result.notAfter <= result.notBefore) throw new Error('Invalid certificate validity')
  return result
}
export function certificate(value: unknown) {
  const v = closed(value, [
      'id',
      'revision',
      'device',
      'profile',
      'source',
      'issuance',
      'installed',
      'validity',
      'evaluatedAt',
    ]),
    p = closed(v['profile'], ['id', 'name', 'platform', 'protocol', 'issuer', 'purpose']),
    result = {
      id: uuid(v['id']),
      revision: positive(v['revision']),
      device: identifier(v['device']),
      profile: {
        id: uuid(p['id']),
        name: boundedText(p['name'], 128),
        platform: enumeration(p['platform'], ['windows', 'macos'] as const),
        protocol: enumeration(p['protocol'], ['scep', 'acme'] as const),
        issuer: boundedText(p['issuer'], 128),
        purpose: enumeration(p['purpose'], ['device_identity'] as const),
      },
      source: nullable(v['source'], securitySource),
      issuance: nullable(v['issuance'], (value) => {
        const i = closed(value, ['operation', 'state', 'requestedAt', 'resultAt', 'credential'])
        const result = {
          operation: uuid(i['operation']),
          state: enumeration(i['state'], ['requested', 'issued', 'failed', 'unknown'] as const),
          requestedAt: count(i['requestedAt']),
          resultAt: nullable(i['resultAt'], count),
          credential: nullable(i['credential'], certificateCredential),
        }
        if (
          (result.state === 'issued') !== (result.credential !== null) ||
          (result.state === 'requested') !== (result.resultAt === null) ||
          (result.resultAt !== null && result.resultAt <= result.requestedAt)
        )
          throw new Error('Invalid issuance result')
        return result
      }),
      installed: nullable(v['installed'], (value) => {
        const i = closed(value, ['credential', 'observedAt', 'source'])
        return {
          credential: certificateCredential(i['credential']),
          observedAt: count(i['observedAt']),
          source: securitySource(i['source']),
        }
      }),
      validity: enumeration(v['validity'], [
        'unknown',
        'not_yet_valid',
        'valid',
        'expiring',
        'expired',
      ] as const),
      evaluatedAt: count(v['evaluatedAt']),
    }
  const expected = result.profile.platform === 'windows' ? 'mdm.windows' : 'mdm.apple'
  if (
    (result.source && result.source.source !== expected) ||
    (result.installed && result.installed.source.source !== expected) ||
    (result.installed && result.installed.observedAt > result.evaluatedAt) ||
    (result.issuance &&
      (result.issuance.requestedAt > result.evaluatedAt ||
        (result.issuance.resultAt ?? 0) > result.evaluatedAt)) ||
    (result.validity !== 'unknown' &&
      (!result.installed ||
        !result.source ||
        JSON.stringify(result.source) !== JSON.stringify(result.installed.source)))
  )
    throw new Error('Invalid certificate observation')
  const installed = result.installed?.credential
  if (installed && result.validity !== 'unknown') {
    const at = result.evaluatedAt
    if (
      (result.validity === 'expired' && at < installed.notAfter) ||
      (result.validity === 'not_yet_valid' && at >= installed.notBefore) ||
      (['valid', 'expiring'].includes(result.validity) &&
        (at < installed.notBefore || at >= installed.notAfter))
    )
      throw new Error('Certificate validity contradicts its interval')
  }
  return result
}
export type Certificate = ReturnType<typeof certificate>
