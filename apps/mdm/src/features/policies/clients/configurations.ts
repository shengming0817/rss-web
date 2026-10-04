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
import { platforms, type Platform } from './resources'
import { candidate } from './candidate'
export const configurationFormats = [
  'windows_csp',
  'windows_admx',
  'apple_profile',
  'apple_ddm',
] as const
export type ConfigurationFormat = (typeof configurationFormats)[number]
export type SettingValue = string | number | boolean
export interface Setting {
  key: string
  value: SettingValue
}
function scalar(value: unknown): SettingValue {
  if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
    return value
  return string(value)
}
export function settings(value: unknown): Setting[] {
  return unique(
    array(value, (value) => {
      const v = closed(value, ['key', 'value'])
      return { key: identifier(v['key']), value: scalar(v['value']) }
    }),
    (s) => s.key,
  )
}
export function configuration(value: unknown, id: string) {
  const v = closed(value, ['id', 'revision', 'name', 'platform', 'format', 'versions'])
  if (uuid(v['id']) !== id) throw new Error('Wrong configuration')
  return {
    id,
    revision: count(v['revision']),
    name: identifier(v['name']),
    platform: enumeration(v['platform'], platforms),
    format: enumeration(v['format'], configurationFormats),
    versions: unique(
      array(v['versions'], (value) => {
        const v = closed(value, ['version', 'status', 'settings'])
        return {
          version: count(v['version']),
          status: enumeration(v['status'], ['draft', 'published', 'archived'] as const),
          settings: settings(v['settings']),
        }
      }),
      (v) => v.version,
    ),
  }
}
export type Configuration = ReturnType<typeof configuration>
export type ConfigurationChange =
  | { action: 'create'; name: string; platform: Platform; format: ConfigurationFormat }
  | { action: 'version'; settings: Setting[] }
  | { action: 'publish' | 'archive'; version: number }
export function createConfigurationsClient(
  transport: HttpTransport,
  tenant: string,
  demo: boolean,
) {
  function read(value: unknown, id: string) {
    return configuration(candidate(value, tenant, demo, ['configuration'])['configuration'], id)
  }
  return {
    list: (cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/policies/configurations',
        query: { cursor, limit: 20 },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['snapshot', 'items', 'nextCursor'])
          return {
            snapshot: uuid(v['snapshot']),
            items: array(v['items'], (value) => configuration(value, uuid(record(value)['id']))),
            nextCursor: nullable(v['nextCursor'], string),
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/policies/configurations/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => read(v, id),
      }),
    change: (id: string, body: Operation<ConfigurationChange>) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/mdm-candidate/policies/configurations/{id}',
        pathParams: { id },
        body,
        successStatus: 200,
        decode: (v) => read(v, id),
      }),
    diff: (id: string, from: number, to: number) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/policies/configurations/{id}/diff',
        pathParams: { id },
        query: { from, to },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['configuration', 'from', 'to', 'items'])
          if (v['configuration'] !== id || v['from'] !== from || v['to'] !== to)
            throw new Error('Wrong configuration diff')
          return array(v['items'], (value) => {
            const i = closed(value, ['key', 'before', 'after'])
            return {
              key: identifier(i['key']),
              before: nullable(i['before'], scalar),
              after: nullable(i['after'], scalar),
            }
          })
        },
      }),
    preview: (id: string, body: Operation<{ scope: string; version: number }>) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/mdm-candidate/policies/configurations/{id}/previews',
        pathParams: { id },
        body,
        successStatus: 202,
        decode(value) {
          const v = candidate(value, tenant, demo, ['task'])
          if (uuid(v['task']) !== body.operationId) throw new Error('Wrong configuration preview')
          return { task: body.operationId }
        },
      }),
    previewStatus: (id: string, task: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/policies/configurations/{id}/previews/{task}',
        pathParams: { id, task },
        successStatus: 200,
        decode(value) {
          const v = closed(candidate(value, tenant, demo, ['preview'])['preview'], [
            'id',
            'configuration',
            'version',
            'scope',
            'scopeRevision',
            'status',
            'rows',
          ])
          if (v['id'] !== task || v['configuration'] !== id)
            throw new Error('Wrong configuration preview')
          return {
            id: task,
            configuration: id,
            version: count(v['version']),
            scope: uuid(v['scope']),
            scopeRevision: count(v['scopeRevision']),
            status: enumeration(v['status'], ['pending', 'completed', 'superseded'] as const),
            rows: array(v['rows'], (value) => {
              const r = closed(value, ['device', 'support', 'reason', 'drift', 'conflicts'])
              return {
                device: identifier(r['device']),
                support: enumeration(r['support'], [
                  'executable',
                  'blocked',
                  'unsupported',
                ] as const),
                reason: nullable(r['reason'], (v) =>
                  enumeration(v, [
                    'candidate_only',
                    'offline',
                    'platform',
                    'conflict',
                    'authorization',
                    'unknown',
                  ] as const),
                ),
                drift: enumeration(r['drift'], ['unknown', 'changed', 'aligned'] as const),
                conflicts: array(r['conflicts'], identifier),
              }
            }),
          }
        },
      }),
  }
}
