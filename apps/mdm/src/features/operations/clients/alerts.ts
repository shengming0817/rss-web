import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import {
  array,
  closed,
  count,
  identifier,
  nullable,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import { alert, candidate, type Alert } from './model'
export function closure(value: unknown) {
  const v = closed(value, ['alert', 'revision', 'operation', 'actor', 'at', 'note'])
  return {
    alert: uuid(v['alert']),
    revision: count(v['revision']),
    operation: uuid(v['operation']),
    actor: uuid(v['actor']),
    at: count(v['at']),
    note: identifier(v['note']),
  }
}
export interface AlertFilter {
  cursor?: string
  device?: string
  state?: Alert['state']
}
export function createAlertsClient(transport: HttpTransport, tenant: string, demo: boolean) {
  function read(value: unknown, id: string) {
    const result = alert(candidate(value, tenant, demo, ['alert'])['alert'])
    if (result.id !== id) throw new Error('Wrong alert')
    return result
  }
  return {
    closure: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/operations/alerts/{id}/closure',
        pathParams: { id },
        successStatus: 200,
        decode: (value) => {
          const c = nullable(candidate(value, tenant, demo, ['closure'])['closure'], closure)
          if (c && c.alert !== id) throw new Error('Wrong closure')
          return c
        },
      }),
    close: (id: string, body: Operation<{ note: string }>) =>
      transport.request({
        method: 'POST',
        path: '/api/mdm-candidate/v1/operations/alerts/{id}/close',
        pathParams: { id },
        body,
        successStatus: 200,
        decode: (value) => {
          const c = closure(candidate(value, tenant, demo, ['closure'])['closure'])
          if (
            c.alert !== id ||
            c.operation !== body.operationId ||
            c.revision !== body.expectedRevision + 1
          )
            throw new Error('Wrong close receipt')
          return c
        },
      }),
    list: (filter: AlertFilter = {}) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/operations/alerts',
        query: { limit: 20, ...filter },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['items', 'snapshot', 'nextCursor'])
          return {
            items: unique(array(v['items'], alert), (v) => v.id),
            snapshot: uuid(v['snapshot']),
            nextCursor: nullable(v['nextCursor'], string),
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/operations/alerts/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => read(v, id),
      }),
    acknowledge: (id: string, body: Operation<Record<string, never>>) =>
      transport.request({
        method: 'POST',
        path: '/api/mdm-candidate/v1/operations/alerts/{id}/acknowledge',
        pathParams: { id },
        body,
        successStatus: 200,
        decode(value) {
          const result = read(value, id)
          if (
            result.operation !== body.operationId ||
            result.revision !== body.expectedRevision + 1 ||
            result.acknowledgment === null
          )
            throw new Error('Wrong acknowledgment')
          return result
        },
      }),
  }
}
