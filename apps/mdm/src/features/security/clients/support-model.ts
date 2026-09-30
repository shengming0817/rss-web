import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  record,
  unique,
  uuid,
} from '../../../services/decode'
import { boundedText, positive } from './compliance-model'
import { securitySource } from './source'
export const supportKinds = ['elevation', 'diagnostics', 'remote_support'] as const
export const diagnosticKinds = ['system_events', 'inventory_summary', 'network_summary'] as const
export function supportProgram(value: unknown) {
  const v = closed(value, ['id', 'name', 'path', 'sha256', 'publisher']),
    sha256 = identifier(v['sha256'])
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid executable digest')
  return {
    id: uuid(v['id']),
    name: boundedText(v['name'], 128),
    path: boundedText(v['path'], 512),
    sha256,
    publisher: boundedText(v['publisher'], 128),
  }
}
export function supportTarget(value: unknown) {
  const kind = enumeration(record(value)['kind'], supportKinds),
    common = ['kind', 'device', 'contextRevision'],
    v = closed(value, [
      ...common,
      ...(kind === 'elevation'
        ? ['account', 'program']
        : kind === 'diagnostics'
          ? ['artifacts', 'retentionSeconds']
          : ['mode']),
    ]),
    base = { device: identifier(v['device']), contextRevision: positive(v['contextRevision']) }
  if (kind === 'elevation')
    return {
      ...base,
      kind,
      account: identifier(v['account']),
      program: supportProgram(v['program']),
    }
  if (kind === 'remote_support')
    return { ...base, kind, mode: enumeration(v['mode'], ['view', 'control'] as const) }
  const artifacts = unique(
      array(v['artifacts'], (v) => enumeration(v, diagnosticKinds)),
      (v) => v,
    ),
    retentionSeconds = positive(v['retentionSeconds'])
  if (!artifacts.length || retentionSeconds > 7 * 86400) throw new Error('Invalid diagnostic scope')
  return { ...base, kind, artifacts, retentionSeconds }
}
export type SupportTarget = ReturnType<typeof supportTarget>
export function isSupportTarget(value: { kind: string }): value is SupportTarget {
  return supportKinds.some((kind) => kind === value.kind)
}
export function supportContext(value: unknown) {
  const v = closed(value, [
      'device',
      'revision',
      'platform',
      'source',
      'capabilities',
      'accounts',
      'programs',
      'evaluatedAt',
    ]),
    c = closed(v['capabilities'], ['elevation', 'diagnostics', 'remoteModes']),
    result = {
      device: identifier(v['device']),
      revision: positive(v['revision']),
      platform: enumeration(v['platform'], ['windows', 'macos', 'unknown'] as const),
      source: nullable(v['source'], securitySource),
      capabilities: {
        elevation: boolean(c['elevation']),
        diagnostics: boolean(c['diagnostics']),
        remoteModes: unique(
          array(c['remoteModes'], (v) => enumeration(v, ['view', 'control'] as const)),
          (v) => v,
        ),
      },
      accounts: unique(
        array(v['accounts'], (value) => {
          const a = closed(value, ['id', 'name'])
          return { id: identifier(a['id']), name: boundedText(a['name'], 128) }
        }),
        (a) => a.id,
      ),
      programs: unique(array(v['programs'], supportProgram), (p) => p.id),
      evaluatedAt: count(v['evaluatedAt']),
    }
  if (
    (result.source && result.source.source !== 'agent.builtin') ||
    ((!result.source || result.platform === 'unknown') &&
      (result.capabilities.elevation ||
        result.capabilities.diagnostics ||
        result.capabilities.remoteModes.length))
  )
    throw new Error('Invalid support capabilities')
  return result
}
export type SupportContext = ReturnType<typeof supportContext>
export function supportRecord(value: unknown) {
  const v = closed(value, ['request', 'requester', 'target', 'source', 'action', 'details']),
    target = supportTarget(v['target']),
    base = {
      request: uuid(v['request']),
      requester: uuid(v['requester']),
      source: nullable(v['source'], securitySource),
      action: nullable(v['action'], uuid),
    }
  if (record(v['details'])['kind'] !== target.kind) throw new Error('Wrong support details')
  if (base.source && base.source.source !== 'agent.builtin') throw new Error('Wrong support source')
  if (target.kind === 'elevation') {
    const d = closed(v['details'], ['kind', 'grant', 'usage']),
      g = closed(d['grant'], ['state', 'observedAt']),
      u = closed(d['usage'], ['state', 'startedAt', 'endedAt']),
      grant = {
        state: enumeration(g['state'], [
          'not_requested',
          'available',
          'revoked',
          'unknown',
        ] as const),
        observedAt: nullable(g['observedAt'], count),
      },
      usage = {
        state: enumeration(u['state'], ['not_observed', 'started', 'ended', 'unknown'] as const),
        startedAt: nullable(u['startedAt'], count),
        endedAt: nullable(u['endedAt'], count),
      }
    if (
      ((grant.observedAt !== null || usage.startedAt !== null) && (!base.action || !base.source)) ||
      (['available', 'revoked'].includes(grant.state) && grant.observedAt === null) ||
      (usage.state === 'not_observed' && (usage.startedAt !== null || usage.endedAt !== null)) ||
      (usage.state === 'started' && (usage.startedAt === null || usage.endedAt !== null)) ||
      (usage.state === 'ended' && (usage.startedAt === null || usage.endedAt === null)) ||
      (usage.endedAt !== null && (usage.startedAt === null || usage.endedAt <= usage.startedAt))
    )
      throw new Error('Invalid elevation evidence')
    return { ...base, target, details: { kind: target.kind, grant, usage } }
  }
  if (target.kind === 'remote_support') {
    const d = closed(v['details'], ['kind', 'attempt', 'helper', 'mode', 'consent', 'session']),
      c = closed(d['consent'], ['state', 'at', 'validUntil']),
      s = closed(d['session'], ['state', 'startedAt', 'endedAt']),
      details = {
        kind: target.kind,
        attempt: uuid(d['attempt']),
        helper: uuid(d['helper']),
        mode: enumeration(d['mode'], ['view', 'control'] as const),
        consent: {
          state: enumeration(c['state'], [
            'not_requested',
            'pending',
            'granted',
            'denied',
            'expired',
            'revoked',
            'unavailable',
          ] as const),
          at: nullable(c['at'], count),
          validUntil: nullable(c['validUntil'], count),
        },
        session: {
          state: enumeration(s['state'], ['not_started', 'active', 'ended', 'unknown'] as const),
          startedAt: nullable(s['startedAt'], count),
          endedAt: nullable(s['endedAt'], count),
        },
      }
    if (
      details.attempt !== base.request ||
      details.helper !== base.requester ||
      details.mode !== target.mode ||
      (details.consent.at !== null && !base.source) ||
      (details.session.startedAt !== null && (!base.action || !base.source)) ||
      (details.consent.state === 'granted' &&
        (details.consent.at === null ||
          details.consent.validUntil === null ||
          details.consent.validUntil <= details.consent.at)) ||
      (details.session.state === 'active' &&
        (details.consent.state !== 'granted' ||
          details.session.startedAt === null ||
          details.session.endedAt !== null)) ||
      (details.session.state === 'ended' &&
        (details.session.startedAt === null || details.session.endedAt === null)) ||
      (details.session.endedAt !== null &&
        (details.session.startedAt === null ||
          details.session.endedAt <= details.session.startedAt))
    )
      throw new Error('Invalid remote binding')
    return { ...base, target, details }
  }
  const d = closed(v['details'], [
      'kind',
      'state',
      'collection',
      'uploadedAt',
      'scan',
      'availableUntil',
    ]),
    s = closed(d['scan'], ['state', 'at']),
    details = {
      kind: target.kind,
      state: enumeration(d['state'], [
        'not_collected',
        'collected',
        'uploaded',
        'ready',
        'blocked',
        'expired',
        'unknown',
      ] as const),
      collection: nullable(d['collection'], (value) => {
        const c = closed(value, ['at', 'artifacts'])
        return {
          at: count(c['at']),
          artifacts: unique(
            array(c['artifacts'], (value) => {
              const a = closed(value, ['kind', 'records', 'bytes'])
              return {
                kind: enumeration(a['kind'], diagnosticKinds),
                records: count(a['records']),
                bytes: count(a['bytes']),
              }
            }),
            (a) => a.kind,
          ),
        }
      }),
      uploadedAt: nullable(d['uploadedAt'], count),
      scan: {
        state: enumeration(s['state'], ['not_scanned', 'clean', 'blocked', 'unknown'] as const),
        at: nullable(s['at'], count),
      },
      availableUntil: nullable(d['availableUntil'], count),
    }
  if (
    (details.collection
      ? details.availableUntil !== count(details.collection.at + target.retentionSeconds)
      : details.availableUntil !== null) ||
    (details.collection !== null && (!base.action || !base.source)) ||
    (details.state === 'ready' &&
      (!details.collection ||
        details.uploadedAt === null ||
        details.scan.state !== 'clean' ||
        details.availableUntil === null)) ||
    (details.uploadedAt !== null &&
      (!details.collection || details.uploadedAt <= details.collection.at)) ||
    (details.scan.at !== null &&
      (details.uploadedAt === null || details.scan.at <= details.uploadedAt)) ||
    (details.collection &&
      (details.collection.artifacts.length !== target.artifacts.length ||
        details.collection.artifacts.some((a) => !target.artifacts.includes(a.kind))))
  )
    throw new Error('Invalid diagnostic evidence')
  return { ...base, target, details }
}
export type SupportRecord = ReturnType<typeof supportRecord>
