import * as api from '@rss/api/mdm-operations'
import { projectedPage, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type { SoftwareSnapshotsPort } from '@rss/mdm-software'
import { count, list, nullable, text, uuid } from './decode'

const snapshotFields = {
  source: text,
  revision: count,
  documentSha256: (value: unknown) => list(value, count),
  entryCount: count,
  importedAt: count,
  extraction: (value: unknown) =>
    value as api.postApiV1SoftwareSourceSnapshotsBySourceContract.Body.Extraction,
}
const entryFields = {
  entryId: uuid,
  source: text,
  revision: count,
  packageId: (value: unknown) => nullable(value, text),
  name: (value: unknown) => nullable(value, text),
  version: (value: unknown) => nullable(value, text),
}
type Receipt = api.postApiV1SoftwareSourceSnapshotsBySourceContract.Output
const summary = <T extends Omit<Receipt, 'operationId'>>(value: T) => ({
  ...value,
  revision: count(value.revision),
  entryCount: count(value.entryCount),
  importedAt: count(value.importedAt),
})
const receipt = (value: Receipt) => ({ ...summary(value), operationId: uuid(value.operationId) })

export function createSoftwareSnapshotsAdapter(transport: HttpTransport): SoftwareSnapshotsPort {
  return {
    sources: (query, signal) =>
      api.getApiV1SoftwareSourceSnapshots(
        transport,
        { query: queryParameters(query), signal },
        (value) => projectedPage(value, snapshotFields, query.fields, ['source']),
      ),
    snapshot: (source, signal) =>
      api.getApiV1SoftwareSourceSnapshotsBySource(
        transport,
        { pathParams: { source }, signal },
        (value) => ({ ...summary(value), document: text(value.document) }),
      ),
    entries: (source, query, signal) =>
      api.getApiV1SoftwareSourceSnapshotsBySourceEntries(
        transport,
        { pathParams: { source }, query: queryParameters(query), signal },
        (value) => projectedPage(value, entryFields, query.fields, ['entryId']),
      ),
    entry: (source, entry, signal) =>
      api.getApiV1SoftwareSourceSnapshotsBySourceEntriesByEntry(
        transport,
        { pathParams: { source, entry }, signal },
        (value) => ({ ...value, revision: count(value.revision), data: text(value.data) }),
      ),
    replace: (source, intent) =>
      api.postApiV1SoftwareSourceSnapshotsBySource(
        transport,
        { pathParams: { source }, body: { ...intent, input: { ...intent.input } } },
        receipt,
      ),
    receipt: (source, operation) =>
      api.getApiV1SoftwareSourceSnapshotsBySourceOperationsByOperation(
        transport,
        { pathParams: { source, operation } },
        receipt,
      ),
  }
}
