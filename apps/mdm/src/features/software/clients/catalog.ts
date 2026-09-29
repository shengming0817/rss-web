import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import {
  array,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  record,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import { decodeResource } from '../../policies/clients/resources'
import { sourceRead } from './admission'
import { decodePublication } from './publication'
import { candidate } from './candidate'
export function catalogDefinition(value: unknown) {
  const v = closed(value, ['title', 'description', 'category', 'license', 'supersedes'])
  const l = closed(v['license'], ['kind', 'seats', 'expiresAt'])
  const license = {
    kind: enumeration(l['kind'], ['unknown', 'free', 'commercial'] as const),
    seats: nullable(l['seats'], count),
    expiresAt: nullable(l['expiresAt'], count),
  }
  if (license.kind !== 'commercial' && (license.seats !== null || license.expiresAt !== null))
    throw new Error('Invalid license')
  const supersedes = unique(
    array(v['supersedes'], (value) => {
      const s = closed(value, ['resource', 'version'])
      return { resource: identifier(s['resource']), version: identifier(s['version']) }
    }),
    (s) => JSON.stringify([s.resource, s.version]),
  )
  if (supersedes.length > 32) throw new Error('Too many predecessors')
  return {
    title: identifier(v['title']),
    description: string(v['description']),
    category: string(v['category']),
    license,
    supersedes,
  }
}
export type CatalogDefinition = ReturnType<typeof catalogDefinition>
export type CatalogChange = { action: 'put' } & CatalogDefinition
export function catalogEntry(value: unknown, id?: string) {
  const v = closed(value, ['resource', 'metadata', 'usage'])
  const resource = decodeResource(v['resource'], id ?? identifier(record(v['resource'])['id']))
  if (resource.kind !== 'software') throw new Error('Wrong resource kind')
  const m = closed(v['metadata'], ['revision', 'operation', 'definition'])
  const u = closed(v['usage'], [
    'asOf',
    'windowDays',
    'sampledDevices',
    'totalDevices',
    'activeDevices',
    'unknownDevices',
    'source',
  ])
  const usage = {
    asOf: nullable(u['asOf'], count),
    windowDays: count(u['windowDays']),
    sampledDevices: count(u['sampledDevices']),
    totalDevices: count(u['totalDevices']),
    activeDevices: nullable(u['activeDevices'], count),
    unknownDevices: count(u['unknownDevices']),
    source: enumeration(u['source'], ['agent_usage', 'unavailable'] as const),
  }
  if (
    !usage.windowDays ||
    usage.sampledDevices > usage.totalDevices ||
    usage.unknownDevices !== usage.totalDevices - usage.sampledDevices ||
    (usage.activeDevices !== null && usage.activeDevices > usage.sampledDevices) ||
    (usage.source === 'unavailable' &&
      (usage.asOf !== null || usage.sampledDevices !== 0 || usage.activeDevices !== null)) ||
    (usage.source === 'agent_usage' &&
      (usage.asOf === null || usage.sampledDevices === 0 || usage.activeDevices === null))
  )
    throw new Error('Invalid usage denominators')
  return {
    resource,
    metadata: {
      revision: count(m['revision']),
      operation: nullable(m['operation'], uuid),
      definition: catalogDefinition(m['definition']),
    },
    usage,
  }
}
export type CatalogEntry = ReturnType<typeof catalogEntry>
export function createCatalogClient(transport: HttpTransport, tenant: string, demo: boolean) {
  const envelope = (value: unknown, keys: string[]) => candidate(value, tenant, demo, keys)
  const read = (value: unknown, id: string) => catalogEntry(envelope(value, ['entry'])['entry'], id)
  return {
    list: (query = '', cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/software/catalog',
        query: { query, cursor, limit: 20 },
        successStatus: 200,
        decode(value) {
          const v = envelope(value, ['snapshot', 'items', 'nextCursor'])
          return {
            snapshot: uuid(v['snapshot']),
            items: array(v['items'], (v) => catalogEntry(v)),
            nextCursor: nullable(v['nextCursor'], string),
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/software/catalog/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => read(v, id),
      }),
    change: (id: string, body: Operation<CatalogChange>) =>
      transport.request({
        method: 'POST',
        path: '/api/mdm-candidate/v1/software/catalog/{id}',
        pathParams: { id },
        body,
        successStatus: 200,
        decode(value) {
          const entry = read(value, id)
          if (entry.metadata.operation !== body.operationId)
            throw new Error('Wrong catalog receipt')
          return entry
        },
      }),
    sources: (cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/software/sources',
        query: { cursor, limit: 20 },
        successStatus: 200,
        decode(value) {
          const v = envelope(value, ['snapshot', 'items', 'nextCursor', 'bindings'])
          return {
            snapshot: uuid(v['snapshot']),
            nextCursor: nullable(v['nextCursor'], string),
            items: array(v['items'], (v) => {
              const s = record(record(v)['source'])
              return sourceRead(v, identifier(s['id']), identifier(s['revision']))
            }),
            bindings: array(v['bindings'], (v) => {
              const b = closed(v, ['id', 'kind'])
              return {
                id: identifier(b['id']),
                kind: enumeration(b['kind'], ['Winget', 'Brew'] as const),
              }
            }),
          }
        },
      }),
    publications: (cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/software/publications',
        query: { cursor, limit: 20 },
        successStatus: 200,
        decode(value) {
          const v = envelope(value, ['snapshot', 'items', 'nextCursor'])
          return {
            snapshot: uuid(v['snapshot']),
            nextCursor: nullable(v['nextCursor'], string),
            items: array(v['items'], (value) => {
              const { source, ...p } = record(value)
              return { source: identifier(source), ...decodePublication(p, identifier(p['id'])) }
            }),
          }
        },
      }),
  }
}
