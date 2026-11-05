import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { comparison, projectedPage, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import { boundedDocument } from '@rss/mdm-resources'
import type { ExportDocument, Publication, PublicationsPort } from '@rss/mdm-software/publications'
import { boolean, count, enumeration, nullable, positive, record, text, uuid } from './decode'
import { requestInput } from './inventory-values'
import { resourceDigest } from './resource-values'

function exportDocument(value: unknown): ExportDocument {
  if (!schema.postApiV1SoftwarePublicationsResponse.validateExportDocument(value))
    throw new Error('Invalid native publication document')
  boundedDocument(value, 8 * 1024 * 1024)
  return value.kind === 'Winget'
    ? { kind: 'winget', manifest: structuredClone(record(value.manifest)) }
    : { kind: 'brew', recipe: structuredClone(record(value.recipe)) }
}
const withdrawal = (value: unknown) =>
  nullable(value, (value) =>
    enumeration(value, [
      'withdrawn',
      'not_published',
      'waiting_publication',
      'preflight_retryable',
      'unknown',
    ] as const),
  )
const outcome = (value: unknown) =>
  enumeration(value, ['pending', 'unknown', 'not_applied', 'published'] as const)
function publication(value: unknown, id?: string): Publication {
  if (
    !schema.postApiV1SoftwarePublicationsResponse.validateRoot(value) ||
    (id !== undefined && value.id !== id)
  )
    throw new Error('Wrong publication detail')
  return {
    id: uuid(value.id),
    revision: count(value.revision),
    target: text(value.target),
    resource: text(value.resource),
    version: text(value.version),
    publication: resourceDigest(value.publication),
    contentDigest: resourceDigest(value.contentDigest),
    manifestDigest: resourceDigest(value.manifestDigest),
    targetDigest: resourceDigest(value.targetDigest),
    attempt: positive(value.attempt),
    outcome: outcome(value.outcome),
    withdrawn: boolean(value.withdrawn),
    withdrawal: withdrawal(value.withdrawal),
    ...(value.document == null ? {} : { document: exportDocument(value.document) }),
  }
}
const fields = {
  id: uuid,
  revision: count,
  target: text,
  resource: text,
  version: text,
  publication: resourceDigest,
  contentDigest: resourceDigest,
  manifestDigest: resourceDigest,
  targetDigest: resourceDigest,
  attempt: positive,
  outcome,
  withdrawn: boolean,
  withdrawal,
}
const targetFields = {
  id: text,
  digest: resourceDigest,
  protocol: (value: unknown) => enumeration(value, ['winget', 'brew'] as const),
}
export function createPublicationsAdapter(transport: HttpTransport): PublicationsPort {
  return {
    target: (id) =>
      api.getApiV1SoftwarePublicationTargets(
        transport,
        {
          query: queryParameters({
            filter: comparison('id', '==', id),
            fields: ['id', 'digest', 'protocol'],
            limit: 2,
          }),
        },
        (value) => {
          const page = projectedPage(value, targetFields, ['id', 'digest', 'protocol'], ['id'])
          if (!page.items.length) return null
          if (page.items.length !== 1 || page.items[0]!.id !== id)
            throw new Error('Wrong exact publication target')
          return page.items[0]!
        },
      ),
    original: (operation, query) =>
      api.getApiV1SoftwarePublications(
        transport,
        {
          query: queryParameters({
            ...query,
            filter: comparison('operationId', '==', operation),
            limit: query.limit ?? 20,
          }),
        },
        (value) => projectedPage(value, fields, undefined, ['id']),
      ),
    targets: (query) =>
      api.getApiV1SoftwarePublicationTargets(
        transport,
        { query: queryParameters({ limit: 20, ...query }) },
        (value) => projectedPage(value, targetFields, query.fields, ['id']),
      ),
    list: (query) =>
      api.getApiV1SoftwarePublications(
        transport,
        { query: queryParameters({ limit: 20, ...query }) },
        (value) => projectedPage(value, fields, query.fields, ['id']),
      ),
    read: (id) =>
      api.getApiV1SoftwarePublicationsById(transport, { pathParams: { id } }, (value) =>
        publication(value, id),
      ),
    publish: (change) =>
      api.postApiV1SoftwarePublications(
        transport,
        { body: requestInput(change, schema.postApiV1SoftwarePublicationsBody.validateRoot) },
        (value) => publication(value, change.operationId),
      ),
    change: (id, change) =>
      api.postApiV1SoftwarePublicationsById(
        transport,
        {
          pathParams: { id },
          body: requestInput(change, schema.postApiV1SoftwarePublicationsByIdBody.validateRoot),
        },
        (value) => publication(value, id),
      ),
  }
}
