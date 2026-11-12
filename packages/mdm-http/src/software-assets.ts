import * as api from '@rss/api/mdm-operations'
import { postApiV1SoftwareAssetQueriesBody } from '@rss/api/mdm-schemas'
import type { HttpTransport } from '@rss/api/mdm'
import type {
  SoftwareAssetsPort,
  SoftwareEvidenceValue,
  SoftwareMapping,
  SoftwareRecord,
  StandardSoftware,
} from '@rss/mdm-inventory'
import { count, uuid } from './decode'
import { distinct, requestInput, windowQuery } from './inventory-values'

type Envelope = api.getApiV1SoftwareAssetQueriesByIdContract.Output
type Response = Extract<Envelope['asset'], { kind: 'software' }>['response']
type ResponseOf<K extends Response['kind']> = Extract<Response, { kind: K }>

function checkedNumbers(value: unknown): void {
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
  )
    throw new Error('Unsafe software asset coordinate')
  if (value && typeof value === 'object') Object.values(value).forEach(checkedNumbers)
}
/** Integer evidence uses the producer's exact signed 64-bit decimal representation. */
function validateEvidenceValue(value: SoftwareEvidenceValue): void {
  if (value.kind === 'integer') {
    if (!/^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(value.value))
      throw new Error('Invalid integer evidence')
    const integer = BigInt(value.value)
    if (integer < -9223372036854775808n || integer > 9223372036854775807n)
      throw new Error('Integer evidence out of range')
  } else if (value.kind === 'array') value.value.forEach(validateEvidenceValue)
  else if (value.kind === 'object') Object.values(value.value).forEach(validateEvidenceValue)
  else if ((value.kind === 'time' || value.kind === 'number') && !Number.isFinite(value.value))
    throw new Error('Invalid evidence number')
}
function record<T>(value: SoftwareRecord<T>, expected?: string) {
  if (expected && value.id !== expected) throw new Error('Wrong software asset record')
  return { ...value, id: uuid(value.id), revision: count(value.revision) }
}
function page<T>(value: { items: readonly T[]; nextCursor: string | null }) {
  return { items: value.items, nextCursor: value.nextCursor }
}
function fixedPage<T>(value: {
  items: readonly T[]
  nextCursor: string | null
  task: string
  coordinates: ResponseOf<'status'>['coordinates']
}) {
  return { ...page(value), task: uuid(value.task), coordinate: JSON.stringify(value.coordinates) }
}
const query = (value: Parameters<typeof windowQuery>[0]) => windowQuery(value, 20)

export function createSoftwareAssetsAdapter(
  transport: HttpTransport,
  tenant: string,
): SoftwareAssetsPort {
  function response<K extends Response['kind']>(value: Envelope, kind: K): ResponseOf<K> {
    if (
      value.tenantId !== tenant ||
      value.asset.kind !== 'software' ||
      value.asset.response.kind !== kind
    )
      throw new Error('Wrong software asset binding')
    checkedNumbers(value.asset.response)
    return value.asset.response as ResponseOf<K>
  }
  const accepted = (value: Envelope) => {
    if (value.tenantId !== tenant || value.asset.kind !== 'accepted')
      throw new Error('Wrong software query acceptance')
    const receipt = value.asset
    if (receipt.statusUrl !== api.getApiV1SoftwareAssetQueriesById.url({ id: uuid(receipt.task) }))
      throw new Error('Wrong software asset status location')
    return receipt
  }
  const mutation = (value: Envelope) => response(value, 'mutation').receipt
  const records = <T>(value: { items: SoftwareRecord<T>[]; nextCursor: string | null }) => ({
    ...page(value),
    items: distinct(
      value.items.map((row) => record(row)),
      (row) => row.id,
    ),
  })
  return {
    standards: (page, signal) =>
      api.getApiV1StandardSoftware(transport, { query: query(page), signal }, (value) =>
        records<StandardSoftware>(response(value, 'standards')),
      ),
    standard: (id, signal) =>
      api.getApiV1StandardSoftwareById(transport, { pathParams: { id }, signal }, (value) =>
        record<StandardSoftware>(response(value, 'standard').record, id),
      ),
    mappings: (page, signal) =>
      api.getApiV1SoftwareMappings(transport, { query: query(page), signal }, (value) =>
        records<SoftwareMapping>(response(value, 'mappings')),
      ),
    mapping: (id, signal) =>
      api.getApiV1SoftwareMappingsById(transport, { pathParams: { id }, signal }, (value) =>
        record<SoftwareMapping>(response(value, 'mapping').record, id),
      ),
    mutate(intent) {
      switch (intent.kind) {
        case 'query':
          return api.postApiV1SoftwareAssetQueries(
            transport,
            {
              body: requestInput(intent.operation, postApiV1SoftwareAssetQueriesBody.validateRoot),
            },
            accepted,
          )
        case 'release':
          return api.postApiV1SoftwareAssetQueriesByIdRelease(
            transport,
            { pathParams: { id: intent.id }, body: intent.operation },
            mutation,
          )
        case 'standard':
          return api.putApiV1StandardSoftwareById(
            transport,
            { pathParams: { id: intent.id }, body: intent.operation },
            mutation,
          )
        case 'mapping':
          return api.putApiV1SoftwareMappingsById(
            transport,
            { pathParams: { id: intent.id }, body: intent.operation },
            mutation,
          )
      }
    },
    receipt: (id) =>
      api.getApiV1SoftwareAssetOperationsById(transport, { pathParams: { id } }, (value) => {
        const result = response(value, 'receipt')
        if (result.operation !== id) throw new Error('Wrong software asset operation')
        return result.receipt
      }),
    status: (id, signal) =>
      api.getApiV1SoftwareAssetQueriesById(transport, { pathParams: { id }, signal }, (value) => {
        const { coordinates, ...status } = response(value, 'status')
        return {
          ...status,
          coordinate: JSON.stringify(coordinates),
          context: coordinates.context,
          asOf: coordinates.asOf,
        }
      }),
    buckets: (id, page, signal) =>
      api.getApiV1SoftwareAssetQueriesByIdSoftware(
        transport,
        { pathParams: { id }, query: query(page), signal },
        (value) => fixedPage(response(value, 'buckets')),
      ),
    breakdowns: (id, bucket, dimension, page, signal) =>
      api.getApiV1SoftwareAssetQueriesByIdSoftwareByBucketBreakdownsByDimension(
        transport,
        { pathParams: { id, bucket, dimension }, query: query(page), signal },
        (value) => fixedPage(response(value, 'breakdowns')),
      ),
    devices: (id, bucket, page, signal) =>
      api.getApiV1SoftwareAssetQueriesByIdSoftwareByBucketDevices(
        transport,
        { pathParams: { id, bucket }, query: query(page), signal },
        (value) => fixedPage(response(value, 'devices')),
      ),
    evidence: (id, bucket, object, page, signal) =>
      api.getApiV1SoftwareAssetQueriesByIdSoftwareByBucketDevicesByObjectEvidence(
        transport,
        {
          pathParams: { id, bucket, object: `${object.kind}:${object.id}` },
          query: query(page),
          signal,
        },
        (value) => {
          if (
            value.tenantId !== tenant ||
            value.asset.kind !== 'software' ||
            value.asset.response.kind !== 'evidence'
          )
            throw new Error('Wrong software evidence binding')
          const { items, ...page } = value.asset.response
          checkedNumbers(page)
          for (const { value: evidenceValue, ...fact } of items) {
            validateEvidenceValue(evidenceValue)
            checkedNumbers(fact)
          }
          return { ...fixedPage({ ...page, items }), quality: page.quality }
        },
      ),
    coverage: (id, page, signal) =>
      api.getApiV1SoftwareAssetQueriesByIdCoverage(
        transport,
        { pathParams: { id }, query: query(page), signal },
        (value) => fixedPage(response(value, 'coverage')),
      ),
  }
}
