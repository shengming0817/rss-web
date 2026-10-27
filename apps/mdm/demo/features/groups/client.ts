import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  nullable,
  string,
  uuid,
} from '../../../src/services/decode'
import {
  nextCursor,
  queryParameters,
  type DirectoryQuery,
} from '../../../src/services/directory-query'
import { group, draft, resultRow, type Draft, type Person, type Device } from './model'
const base = '/api/v1/mdm-candidate/groups'
export function createDemoGroupsClient(transport: HttpTransport, tenant: string) {
  function envelope(value: unknown, keys: string[]) {
    const v = closed(value, ['contract', 'source', 'tenantId', ...keys])
    if (
      v['contract'] !== 'groups-interaction-demo' ||
      v['source'] !== 'mock' ||
      uuid(v['tenantId']) !== tenant
    )
      throw new Error('Wrong explicit demo response')
    return v
  }
  function receipt(value: unknown, operationId: string) {
    const v = envelope(value, ['receipt']),
      r = closed(v['receipt'], ['operationId', 'groupId', 'revision', 'taskId'])
    if (uuid(r['operationId']) !== operationId) throw new Error('Wrong candidate receipt')
    return {
      operationId,
      groupId: uuid(r['groupId']),
      revision: count(r['revision']),
      taskId: nullable(r['taskId'], uuid),
    }
  }
  return {
    list: (query: DirectoryQuery = {}) =>
      transport.request({
        method: 'GET',
        path: base,
        query: queryParameters({ limit: 20, ...query }),
        successStatus: 200,
        decode(value) {
          const v = envelope(value, ['items', 'nextCursor'])
          return { items: array(v['items'], group), nextCursor: nextCursor(v['nextCursor']) }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: `${base}/{id}`,
        pathParams: { id: uuid(id) },
        successStatus: 200,
        decode(value) {
          const v = envelope(value, ['group']),
            row = group(v['group'])
          if (row.id !== id) throw new Error('Wrong candidate group')
          return row
        },
      }),
    catalog: () =>
      transport.request({
        method: 'GET',
        path: `${base}/catalog`,
        successStatus: 200,
        decode(value) {
          const v = envelope(value, ['people', 'devices', 'writable'])
          const item = (value: unknown) => {
            const p = closed(value, ['id', 'label'])
            return { id: uuid(p['id']), label: string(p['label']) }
          }
          return {
            writable: boolean(v['writable']),
            people: array(v['people'], item) as Pick<Person, 'id' | 'label'>[],
            devices: array(v['devices'], item) as Pick<Device, 'id' | 'label'>[],
          }
        },
      }),
    save: (
      id: string,
      body: { operationId: string; expectedRevision: number; input: Draft | null },
    ) => {
      uuid(id)
      uuid(body.operationId)
      count(body.expectedRevision)
      if (body.input !== null) draft(body.input)
      return transport.request({
        method: 'PUT',
        path: `${base}/{id}`,
        pathParams: { id },
        body,
        successStatus: 202,
        decode: (v) => receipt(v, body.operationId),
      })
    },
    calculate: (
      id: string,
      preview: boolean,
      body: { operationId: string; expectedRevision: number; input: Record<string, never> },
    ) =>
      transport.request({
        method: 'POST',
        path: `${base}/{id}/${preview ? 'preview' : 'recompute'}`,
        pathParams: { id: uuid(id) },
        body,
        successStatus: 202,
        decode: (v) => receipt(v, body.operationId),
      }),
    generate: (
      id: string,
      body: {
        operationId: string
        expectedRevision: number
        input: {
          id: string
          name: string
          description: string
          relation: 'registration_user' | 'current_user'
        }
      },
    ) =>
      transport.request({
        method: 'POST',
        path: `${base}/{id}/generate-device-group`,
        pathParams: { id: uuid(id) },
        body,
        successStatus: 202,
        decode: (v) => receipt(v, body.operationId),
      }),
    task: (id: string) =>
      transport.request({
        method: 'GET',
        path: `${base}/tasks/{id}`,
        pathParams: { id: uuid(id) },
        successStatus: 200,
        decode(value) {
          const v = envelope(value, ['task']),
            task = closed(v['task'], ['id', 'groupId', 'status', 'preview', 'resultId'])
          if (uuid(task['id']) !== id) throw new Error('Wrong candidate task')
          return {
            id,
            groupId: uuid(task['groupId']),
            status: enumeration(task['status'], ['running', 'completed', 'superseded'] as const),
            preview: boolean(task['preview']),
            resultId: nullable(task['resultId'], uuid),
          }
        },
      }),
    results: (
      id: string,
      result: string,
      projection: 'members' | 'changes' | 'decisions',
      cursor?: string,
    ) =>
      transport.request({
        method: 'GET',
        path: `${base}/{id}/results/{result}`,
        pathParams: { id: uuid(id), result: uuid(result) },
        query: { projection, cursor, limit: 20 },
        successStatus: 200,
        decode(value) {
          const v = envelope(value, [
            'resultId',
            'groupId',
            'preview',
            'evaluatedAt',
            'items',
            'nextCursor',
          ])
          if (v['resultId'] !== result || v['groupId'] !== id)
            throw new Error('Wrong candidate result')
          return {
            resultId: result,
            groupId: id,
            preview: boolean(v['preview']),
            evaluatedAt: count(v['evaluatedAt']),
            items: array(v['items'], resultRow),
            nextCursor: nextCursor(v['nextCursor']),
          }
        },
      }),
  }
}
