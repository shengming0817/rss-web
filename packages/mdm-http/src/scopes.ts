import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { nextCursor, projectedPage, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type { ScopeDefinition, ScopeReference, ScopeRow, ScopesPort } from '@rss/mdm-scopes'
import { boolean, count, enumeration, nullable, positive, text, uuid } from './decode'
import { distinct, requestInput, windowQuery } from './inventory-values'

function reference(value: ScopeReference): ScopeReference {
  return { kind: value.kind, id: value.kind === 'group' ? uuid(value.id) : text(value.id) }
}
function definition(value: ScopeDefinition): ScopeDefinition {
  const refs = (values: readonly ScopeReference[]) =>
    distinct(values.map(reference), (item) => JSON.stringify(item))
  return {
    targets: refs(value.targets),
    limitations: value.limitations === null ? null : refs(value.limitations),
    exclusions: refs(value.exclusions),
  }
}
const fields = {
  id: uuid,
  revision: positive,
  deleted: boolean,
  calculationRevision: count,
  resolutionRevision: count,
  resolution: (value: unknown) => nullable(value, uuid),
}
/** Uses the application's one authenticated transport; writes are never automatically replayed. */
export function createScopesAdapter(transport: HttpTransport): ScopesPort {
  return {
    list: (query = {}) => {
      if (query.fields && !query.fields.includes('id')) throw new Error('Scope identity required')
      return api.getApiV1Scopes(
        transport,
        { query: queryParameters({ limit: 20, ...query }) },
        (value) =>
          projectedPage(value, fields, query.fields, ['id']) as {
            items: ScopeRow[]
            nextCursor: string | null
          },
      )
    },
    read: (id) =>
      api.getApiV1ScopesById(transport, { pathParams: { id: uuid(id) } }, (value) => {
        if (!schema.getApiV1ScopesByIdResponse200.validateScopeRead(value) || value.id !== id)
          throw new Error('Wrong scope detail')
        return {
          id,
          revision: positive(value.revision),
          definition: definition(value.definition),
          resolution: nullable(value.resolution, uuid),
          resolutionRevision: count(value.resolutionRevision),
        }
      }),
    change: (id, change) =>
      api.postApiV1ScopesById(
        transport,
        {
          pathParams: { id: uuid(id) },
          body: requestInput(change, schema.postApiV1ScopesByIdBody.validateRoot),
        },
        (value) => {
          if (!schema.postApiV1ScopesByIdResponse200.validateScopeReceipt(value) || value.id !== id)
            throw new Error('Wrong scope receipt')
          return { id, revision: positive(value.revision), task: nullable(value.task, uuid) }
        },
      ),
    task: (id, task) =>
      api.getApiV1ScopesByScopeTasksByTask(
        transport,
        {
          pathParams: { scope: uuid(id), task: uuid(task) },
        },
        (value) => {
          if (
            !schema.getApiV1ScopesByIdResponse200.validateTaskRead(value) ||
            value.target !== id ||
            value.task !== task
          )
            throw new Error('Wrong scope task')
          return {
            task,
            target: id,
            kind: enumeration(value.kind, ['scope'] as const),
            status: enumeration(value.status, [
              'pending',
              'running',
              'completed',
              'failed',
              'superseded',
            ] as const),
            processed: count(value.processed),
            members: count(value.members),
            failure: value.failure,
            failureDetail: value.failureDetail,
            replacementTask: nullable(value.replacementTask, uuid),
          }
        },
      ),
    result: (id, result, kind, channel, query = {}) =>
      api.getApiV1ScopesByScopeResultsByResultByKind(
        transport,
        {
          pathParams: { scope: uuid(id), result: uuid(result), kind },
          query: { ...windowQuery(query), channel },
        },
        (value) => {
          if (
            !schema.getApiV1ScopesByIdResponse200.validateScopePage(value) ||
            value.scope !== id ||
            value.result !== result ||
            value.channel !== channel ||
            value.page.kind !== kind
          )
            throw new Error('Wrong scope result coordinates')
          const object = (item: { kind: 'endpoint' | 'association'; id: string }) => ({
            kind: item.kind,
            id: item.kind === 'association' ? uuid(item.id) : text(item.id),
          })
          const sources = (
            items: readonly { reference: ScopeReference; version: number }[] | null,
          ) =>
            items === null
              ? null
              : items.map((item) => ({
                  reference: reference(item.reference),
                  version: count(item.version),
                }))
          const page = value.page
          return {
            scope: id,
            result,
            current: value.current,
            channel,
            nextCursor: nextCursor(value.nextCursor),
            page:
              page.kind === 'members'
                ? { kind: 'members', items: page.items.map(object) }
                : {
                    kind: 'decisions',
                    items: page.items.map((item) => {
                      const qualification = item.qualification
                      if (
                        qualification.state === 'eligible' &&
                        !Number.isSafeInteger(qualification.entry)
                      )
                        throw new Error('Unsafe scope entry')
                      return {
                        object: object(item.object),
                        qualification: { ...qualification },
                        reasons: [...item.reasons],
                        targets: sources(item.targets),
                        limitations: sources(item.limitations),
                        exclusions: sources(item.exclusions),
                      }
                    }),
                  },
          }
        },
      ),
  }
}
