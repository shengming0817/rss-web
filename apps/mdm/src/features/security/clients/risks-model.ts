import { closed, count, enumeration, identifier, nullable, uuid } from '../../../services/decode'
import { boundedText, positive } from './compliance-model'
import { securitySource } from './source'
export function risk(value: unknown) {
  const v = closed(value, [
    'id',
    'revision',
    'code',
    'title',
    'severity',
    'priority',
    'provider',
    'publishedAt',
    'software',
  ])
  const s = closed(v['software'], ['id', 'name', 'affectedVersion', 'fixedVersion'])
  return {
    id: uuid(v['id']),
    revision: positive(v['revision']),
    code: boundedText(v['code'], 128),
    title: boundedText(v['title'], 256),
    severity: enumeration(v['severity'], ['low', 'medium', 'high', 'critical', 'unknown'] as const),
    priority: enumeration(v['priority'], [
      'urgent',
      'high',
      'normal',
      'deferred',
      'unknown',
    ] as const),
    provider: boundedText(v['provider'], 128),
    publishedAt: count(v['publishedAt']),
    software: {
      id: identifier(s['id']),
      name: boundedText(s['name'], 128),
      affectedVersion: boundedText(s['affectedVersion'], 128),
      fixedVersion: nullable(s['fixedVersion'], (v) => boundedText(v, 128)),
    },
  }
}
export type Risk = ReturnType<typeof risk>
export function riskAssessment(value: unknown) {
  const v = closed(value, [
    'id',
    'version',
    'risk',
    'riskRevision',
    'device',
    'provider',
    'evaluatedAt',
    'state',
    'reason',
    'software',
    'patch',
    'evidence',
  ])
  const s = closed(v['software'], ['id', 'version']),
    p = closed(v['patch'], ['state', 'targetVersion']),
    e = nullable(v['evidence'], (value) => {
      const e = closed(value, ['id', 'observedAt', 'source'])
      return {
        id: uuid(e['id']),
        observedAt: count(e['observedAt']),
        source: securitySource(e['source']),
      }
    })
  const result = {
    id: uuid(v['id']),
    version: positive(v['version']),
    risk: uuid(v['risk']),
    riskRevision: positive(v['riskRevision']),
    device: identifier(v['device']),
    provider: boundedText(v['provider'], 128),
    evaluatedAt: count(v['evaluatedAt']),
    state: enumeration(v['state'], ['affected', 'clear', 'unknown', 'not_applicable'] as const),
    reason: enumeration(v['reason'], [
      'matched',
      'fixed_version_observed',
      'inventory_missing',
      'source_changed',
      'feed_unavailable',
      'platform_not_applicable',
    ] as const),
    software: {
      id: identifier(s['id']),
      version: nullable(s['version'], (v) => boundedText(v, 128)),
    },
    patch: {
      state: enumeration(p['state'], ['available', 'unavailable', 'unknown'] as const),
      targetVersion: nullable(p['targetVersion'], (v) => boundedText(v, 128)),
    },
    evidence: e,
  }
  if (
    (result.patch.state === 'available') !== (result.patch.targetVersion !== null) ||
    (['affected', 'clear'].includes(result.state) && (!e || result.software.version === null)) ||
    (e && e.observedAt > result.evaluatedAt) ||
    (result.state === 'clear' && result.reason !== 'fixed_version_observed') ||
    (result.state === 'affected' && result.reason !== 'matched')
  )
    throw new Error('Invalid risk evidence')
  return result
}
export type RiskAssessment = ReturnType<typeof riskAssessment>
