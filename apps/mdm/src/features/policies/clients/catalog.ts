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
export type Collection = 'scopes' | 'resources' | 'policies' | 'workflows'
export function createCatalogClient(transport: HttpTransport, tenant: string, demo: boolean) {
  return {
    list: (collection: Collection, cursor?: string) =>
      transport.request({
        method: 'GET',
        path: `/api/v1/mdm-candidate/policies/${collection}`,
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
                  status: enumeration(
                    i['status'],
                    collection === 'policies'
                      ? (['active', 'paused', 'archived'] as const)
                      : collection === 'workflows'
                        ? (['active', 'archived'] as const)
                        : (['ready'] as const),
                  ),
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
        path: '/api/v1/mdm-candidate/policies/approvals',
        query: { limit: 20, cursor },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['snapshot', 'items', 'nextCursor'])
          return {
            snapshot: uuid(v['snapshot']),
            items: array(v['items'], (value) => {
              const a = closed(value, ['kind', 'id', 'run', 'revision', 'author', 'label'])
              return {
                kind: enumeration(a['kind'], ['workflow'] as const),
                id: uuid(a['id']),
                run: uuid(a['run']),
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
