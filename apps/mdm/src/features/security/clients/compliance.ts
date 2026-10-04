import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import { array, closed, nullable, string, unique, uuid } from '../../../services/decode'
import {
  complianceHistory,
  complianceRule,
  complianceTask,
  currentCompliance,
  positive,
  type ComplianceDefinition,
} from './compliance-model'
export type HistoryFilter = { cursor?: string; from?: number; until?: number; limit?: number }
/** Published rss-mdm v2 wire: no candidate envelope and distinct rule/history pagination. */
export function createComplianceClient(transport: HttpTransport) {
  return {
    list: (after?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/compliance-rules',
        query: { after },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['items', 'nextCursor'])
          return {
            items: unique(
              array(v['items'], (v) => complianceRule(v)),
              (v) => v.id,
            ),
            nextCursor: nullable(v['nextCursor'], uuid),
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/compliance-rules/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => complianceRule(v, id),
      }),
    version: (id: string, revision: number) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/compliance-rules/{id}/versions/{revision}',
        pathParams: { id, revision: String(revision) },
        successStatus: 200,
        decode: (v) => complianceRule(v, id, revision),
      }),
    put: (id: string, body: Operation<ComplianceDefinition>) =>
      transport.request({
        method: 'PUT',
        path: '/api/v1/compliance-rules/{id}',
        pathParams: { id },
        body,
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['id', 'revision', 'task'])
          if (uuid(v['id']) !== id || positive(v['revision']) !== body.expectedRevision + 1)
            throw new Error('Wrong compliance write')
          const task = nullable(v['task'], uuid)
          if (body.input.enabled !== (task !== null)) throw new Error('Wrong compliance evaluation')
          return { id, revision: body.expectedRevision + 1, task }
        },
      }),
    recompute: (id: string, body: Operation<Record<string, never>>) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/compliance-rules/{id}/recompute',
        pathParams: { id },
        body,
        successStatus: 200,
        decode: (v) => ({ task: uuid(closed(v, ['task'])['task']) }),
      }),
    task: (id: string, task: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/compliance-rules/{id}/tasks/{task}',
        pathParams: { id, task },
        successStatus: 200,
        decode: (v) => complianceTask(v, id, task),
      }),
    current: (device: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/compliance',
        pathParams: { device },
        successStatus: 200,
        decode: (v) => currentCompliance(v, device),
      }),
    history: (device: string, query: HistoryFilter = {}) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/compliance/history',
        pathParams: { device },
        query,
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['items', 'nextCursor'])
          return {
            items: unique(array(v['items'], complianceHistory), (v) => v.task),
            nextCursor: nullable(v['nextCursor'], string),
          }
        },
      }),
  }
}
