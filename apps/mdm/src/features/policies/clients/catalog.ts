import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import { candidate } from './candidate'
export type Collection = 'scopes' | 'resources' | 'policies' | 'script-plans' | 'workflows'
export function createCatalogClient(transport: HttpTransport, tenant: string, demo: boolean) {
  return {
    list: (collection: Collection, cursor?: string) =>
      transport.request({
        method: 'GET',
        path: `/api/mdm-candidate/v1/policies/${collection}`,
        query: { limit: 20, cursor },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['snapshot', 'items', 'nextCursor'])
          return {
            snapshot: uuid(v['snapshot']),
            items: unique(
              array(v['items'], (value) => {
                const i = closed(value, ['id', 'label', 'revision', 'status'])
                return {
                  id: identifier(i['id']),
                  label: identifier(i['label']),
                  revision: count(i['revision']),
                  status: enumeration(i['status'], [
                    'ready',
                    'draft',
                    'frozen',
                    'active',
                    'paused',
                    'archived',
                    'pending_review',
                    'approved',
                    'cancelled',
                    'deleted',
                  ] as const),
                }
              }),
              (i) => i.id,
            ),
            nextCursor: nullable(v['nextCursor'], string),
          }
        },
      }),
    approvals: (cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/policies/approvals',
        query: { limit: 20, cursor },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['snapshot', 'items', 'nextCursor'])
          return {
            snapshot: uuid(v['snapshot']),
            items: array(v['items'], (value) => {
              const a = closed(value, ['kind', 'id', 'run', 'revision', 'author', 'label'])
              return {
                kind: enumeration(a['kind'], ['script', 'workflow'] as const),
                id: uuid(a['id']),
                run: nullable(a['run'], uuid),
                revision: count(a['revision']),
                author: uuid(a['author']),
                label: identifier(a['label']),
              }
            }),
            nextCursor: nullable(v['nextCursor'], string),
          }
        },
      }),
  }
}
