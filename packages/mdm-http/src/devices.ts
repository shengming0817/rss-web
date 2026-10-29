import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { projectedPage, queryParameters, windowParameters, nextCursor } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import {
  validateAssociation,
  validateUser,
  referenceKey,
  type Association,
  type AssociationRow,
  type DevicesPort,
  type DeviceRef,
  type DeviceView,
  type Endpoint,
  type EndpointDetail,
  type EndpointRow,
  type ViewEndpoint,
  type ViewRow,
  type DirectoryQuery,
  type Page,
  type PersonDisplay,
  type PrimaryRegistration,
  type User,
  type RegistrationUser,
  type Retirement,
} from '@rss/mdm-devices'
import { boolean, count, enumeration, positive, text, uuid } from './decode'

function identifier(value: unknown): string {
  const result = text(value)
  if (!result || result.trim() !== result || result.length > 256 || /\p{Cc}/u.test(result))
    throw new Error('Invalid endpoint identifier')
  return result
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('Invalid integer')
  return value
}
function unique<T>(values: readonly T[], key: (v: T) => string): void {
  if (new Set(values.map(key)).size !== values.length) throw new Error('Duplicate device identity')
}
function member(value: unknown): PrimaryRegistration {
  if (!schema.getApiV1DeviceViewsResponse.validatePrimaryRegistration(value))
    throw new Error('Invalid registration contract')
  return {
    device: identifier(value.device),
    channel: value.channel,
    registrationId: uuid(value.registrationId),
    generation: positive(value.generation),
  }
}
function association(value: unknown): Association {
  if (!schema.getApiV1DeviceViewsResponse.validateAssociation(value))
    throw new Error('Invalid association contract')
  validateAssociation(value)
  return value
}
function reference(value: unknown): DeviceRef {
  if (!schema.getApiV1DeviceViewsByKindByIdResponse.validateObjectRef(value))
    throw new Error('Invalid device reference')
  referenceKey(value)
  return value
}
function user(value: unknown, tenant: string): User {
  if (!schema.getApiV1DeviceViewsResponse.validateUser(value))
    throw new Error('Invalid personnel contract')
  validateUser(value, tenant)
  return value
}
function display(value: unknown): PersonDisplay {
  if (!schema.getApiV1DeviceViewsResponse.validatePersonDisplay(value))
    throw new Error('Invalid display contract')
  for (const profile of value.profiles) {
    if (
      profile.status !== 'available' &&
      (profile.displayName !== null || profile.username !== null)
    )
      throw new Error('Unavailable personnel contains values')
    if (profile.source.kind === 'idp') uuid(profile.source.provider)
  }
  return value
}
const endpointFields = {
  id: identifier,
  status: (v: unknown) =>
    enumeration(v, [
      'active',
      'pending',
      'revoked',
      'superseded',
      'registered',
      'cancelled',
      'expired',
    ] as const),
  primaryMdmRegistration: (v: unknown): Endpoint['primaryMdmRegistration'] => {
    if (v === null) return null
    if (!schema.getApiV1DevicesByDeviceResponse.validatePrimary(v))
      throw new Error('Invalid primary registration')
    return {
      registrationId: uuid(v.registrationId),
      generation: positive(v.generation),
      source: enumeration(v.source, ['mdm.windows', 'mdm.apple'] as const),
    }
  },
  channels: (v: unknown): Endpoint['channels'] => {
    if (!Array.isArray(v)) throw new Error('Invalid channels')
    const result = v.map((raw: unknown) => {
      if (!schema.getApiV1DevicesByDeviceResponse.validateChannel(raw))
        throw new Error('Invalid channel contract')
      uuid(raw.registrationId)
      positive(raw.generation)
      if (raw.lastCommunicationReceivedAt !== null) integer(raw.lastCommunicationReceivedAt)
      unique(raw.children, (c) => c.registrationId)
      for (const child of raw.children) {
        uuid(child.registrationId)
        positive(child.generation)
        if (
          child.parentRegistrationId !== raw.registrationId ||
          child.parentGeneration !== raw.generation
        )
          throw new Error('Wrong child registration binding')
      }
      if (
        raw.userContext &&
        (raw.userContext.parentRegistrationId !== raw.registrationId ||
          raw.userContext.parentGeneration !== raw.generation)
      )
        throw new Error('Wrong user channel binding')
      return raw
    })
    unique(result, (c) => c.channel)
    return result
  },
  enrollments: (v: unknown): Endpoint['enrollments'] => {
    if (!Array.isArray(v)) throw new Error('Invalid enrollments')
    const result = v.map((e: unknown) => {
      if (!schema.getApiV1DevicesByDeviceResponse.validateEnrollment(e))
        throw new Error('Invalid enrollment contract')
      uuid(e.enrollmentId)
      integer(e.expiresAt)
      return e
    })
    unique(result, (e) => e.enrollmentId)
    return result
  },
  inventoryAvailable: boolean,
}
function endpoint(value: unknown, id: string): EndpointDetail {
  if (!schema.getApiV1DevicesByDeviceResponse.validateRoot(value))
    throw new Error('Invalid endpoint detail')
  if (value.id !== id) throw new Error('Wrong endpoint')
  return {
    ...value,
    id: identifier(value.id),
    channels: endpointFields.channels(value.channels),
    enrollments: endpointFields.enrollments(value.enrollments),
    primaryMdmRegistration: endpointFields.primaryMdmRegistration(value.primaryMdmRegistration),
  }
}
function viewEndpoint(value: unknown, tenant: string): ViewEndpoint {
  if (!schema.getApiV1DeviceViewsByKindByIdResponse.validateEndpoint(value))
    throw new Error('Invalid view endpoint')
  identifier(value.id)
  endpointFields.channels(value.channels)
  endpointFields.enrollments(value.enrollments)
  endpointFields.primaryMdmRegistration(value.primaryMdmRegistration)
  const platform = value.platform
  unique(platform.values, (v) => v)
  if (
    (platform.state === 'known' && platform.values.length !== 1) ||
    (platform.state === 'unknown' && platform.values.length !== 0) ||
    (platform.state === 'conflict' && platform.values.length < 2)
  )
    throw new Error('Invalid platform observation')
  const owner = value.registrationUser,
    current = value.currentUser
  for (const person of [owner, current])
    if (person) {
      count(person.revision)
      if (person.user) user(person.user, tenant)
      if (person.display) {
        if (!person.user) throw new Error('Unbound personnel display')
        display(person.display)
      }
    }
  if (current && (current.state === 'active') !== (current.user !== null))
    throw new Error('Invalid current user observation')
  const { displayName, serialNumber, registrationUser, currentUser, ...rest } = value
  return {
    ...rest,
    primaryMdmRegistration: endpointFields.primaryMdmRegistration(value.primaryMdmRegistration),
    ...(displayName ? { displayName: displayName.state } : {}),
    ...(serialNumber ? { serialNumber: serialNumber.state } : {}),
    ...(registrationUser ? { registrationUser } : {}),
    ...(currentUser ? { currentUser } : {}),
  }
}
function validateViewBinding(
  ref: DeviceRef,
  linked: Association | null,
  endpoints: readonly ViewEndpoint[],
): void {
  unique(endpoints, (e) => e.id)
  if (
    ref.kind === 'endpoint' &&
    (linked !== null || endpoints.length !== 1 || endpoints[0]?.id !== ref.id)
  )
    throw new Error('Wrong endpoint view')
  if (
    ref.kind === 'association' &&
    (!linked ||
      linked.id !== ref.id ||
      linked.state === 'revoked' ||
      endpoints.length !== 2 ||
      linked.members.some((m) => !endpoints.some((e) => e.id === m.device)))
  )
    throw new Error('Wrong association view')
}
export function viewSummary(
  value: { reference: unknown; association: unknown; endpoints: readonly unknown[] },
  tenant: string,
) {
  const ref = reference(value.reference),
    linked = value.association === null ? null : association(value.association),
    endpoints = value.endpoints.map((e) => viewEndpoint(e, tenant))
  validateViewBinding(ref, linked, endpoints)
  return { reference: ref, association: linked, endpoints }
}
function directory(query: DirectoryQuery, identity: string, maximum: number) {
  if (query.fields && !query.fields.includes(identity))
    throw new Error('Directory identity required')
  if (query.limit !== undefined && query.limit > maximum) throw new Error('Invalid directory limit')
  return queryParameters({ limit: 20, ...query })
}
/** Current generated protocol only, over the application's existing session-bound executor. */
export function createDevicesAdapter(transport: HttpTransport, tenant: string): DevicesPort {
  uuid(tenant)
  const personnel = (value: unknown): RegistrationUser => {
    if (!schema.getApiV1DevicesByDeviceRegistrationUserResponse.validateRoot(value))
      throw new Error('Invalid personnel contract')
    return {
      revision: count(value.revision),
      user: value.user === null ? null : user(value.user, tenant),
    }
  }
  return {
    endpoints: (query) =>
      api.getApiV1Devices(
        transport,
        { query: directory(query, 'id', 1000) },
        (value) => projectedPage(value, endpointFields, query.fields, ['id']) as Page<EndpointRow>,
      ),
    endpoint: (id) =>
      api.getApiV1DevicesByDevice(transport, { pathParams: { device: identifier(id) } }, (value) =>
        endpoint(value, id),
      ),
    endpointStatistics: (filter) =>
      api.getApiV1DevicesStatistics(transport, { query: queryParameters({ filter }) }, (value) => ({
        statistics: {
          total: count(value.statistics.total),
          pending: count(value.statistics.pending),
          active: count(value.statistics.active),
          revoked: count(value.statistics.revoked),
        },
        asOf: integer(value.asOf),
      })),
    views: (query) =>
      api.getApiV1DeviceViews(transport, { query: directory(query, 'key', 100) }, (value) => {
        const page = projectedPage(
          value,
          {
            key: text,
            reference,
            association: (v: unknown) => (v === null ? null : association(v)),
            endpoints: (v: unknown) => {
              if (!Array.isArray(v)) throw new Error('Invalid view endpoints')
              return v.map((e) => viewEndpoint(e, tenant))
            },
          },
          query.fields,
          ['key'],
        ) as Page<ViewRow>
        for (const row of page.items)
          if (row.reference && row.endpoints && row.association !== undefined) {
            validateViewBinding(row.reference, row.association, row.endpoints)
            if (row.key !== referenceKey(row.reference)) throw new Error('Wrong view key')
          }
        return page
      }),
    view: (ref) =>
      api.getApiV1DeviceViewsByKindById(transport, { pathParams: { ...ref } }, (value) => {
        const summary = viewSummary(value, tenant)
        if (referenceKey(summary.reference) !== referenceKey(ref))
          throw new Error('Wrong device view')
        return {
          ...summary,
          fields: Object.fromEntries(
            Object.entries(value.fields).map(([key, field]) => {
              if (
                field.field !== key ||
                field.sources.some((s) => !summary.endpoints.some((e) => e.id === s.endpoint))
              )
                throw new Error('Wrong device field binding')
              return [key, field.state]
            }),
          ),
        } satisfies DeviceView
      }),
    viewStatistics: (filter) =>
      api.getApiV1DeviceViewsStatistics(
        transport,
        { query: queryParameters({ filter }) },
        (value) => ({
          statistics: {
            endpointCount: count(value.statistics.endpointCount),
            deviceViewCount: count(value.statistics.deviceViewCount),
          },
          asOf: integer(value.asOf),
        }),
      ),
    associations: (query) =>
      api.getApiV1DeviceAssociations(transport, { query: directory(query, 'id', 100) }, (value) => {
        const page = projectedPage(
          value,
          { id: uuid, version: positive, confirmedAt: integer, association },
          query.fields,
          ['id'],
        ) as Page<AssociationRow>
        for (const row of page.items)
          if (
            row.association &&
            (row.association.id !== row.id ||
              (row.version !== undefined && row.version !== row.association.version))
          )
            throw new Error('Wrong association row')
        return page
      }),
    association: (id) =>
      api.getApiV1DeviceAssociationsById(transport, { pathParams: { id: uuid(id) } }, (value) => {
        const result = association(value)
        if (result.id !== id) throw new Error('Wrong association')
        return result
      }),
    changes: (query) =>
      api.getApiV1DeviceAssociationsChanges(
        transport,
        { query: windowParameters(query, 64) },
        (value) => ({
          items: value.items.map((c) => ({
            association: association(c.association),
            position: count(c.position),
            action: c.action,
            recordedAt: integer(c.recordedAt),
          })),
          nextCursor: nextCursor(value.nextCursor),
        }),
      ),
    candidates: (device, channel, query) =>
      api.getApiV1DevicesByDeviceAssociationCandidates(
        transport,
        {
          pathParams: { device: identifier(device) },
          query: { ...windowParameters(query, 100), channel },
        },
        (value) => {
          const items = value.items.map(member)
          unique(items, (m) => m.device)
          if (items.some((m) => m.device === device || m.channel === channel))
            throw new Error('Wrong candidate channel')
          return { items, nextCursor: nextCursor(value.nextCursor) }
        },
      ),
    confirm: (change) => api.postApiV1DeviceAssociations(transport, { body: change }, association),
    revoke: (id, change) =>
      api.postApiV1DeviceAssociationsByIdRevoke(
        transport,
        { pathParams: { id: uuid(id) }, body: change },
        association,
      ),
    registrationUser: (device) =>
      api.getApiV1DevicesByDeviceRegistrationUser(
        transport,
        { pathParams: { device: identifier(device) } },
        personnel,
      ),
    assign: (device, change) =>
      api.putApiV1DevicesByDeviceRegistrationUser(
        transport,
        {
          pathParams: { device: identifier(device) },
          headers: { 'Idempotency-Key': uuid(change.operationId) },
          body: { expectedRevision: change.expectedRevision, user: change.user },
        },
        personnel,
      ),
    retirement: (id) =>
      api.getApiV1DeviceRetirementsById(transport, { pathParams: { id: uuid(id) } }, (value) => {
        if (value.id !== id) throw new Error('Wrong retirement')
        referenceKey(value.target.object)
        value.target.members.forEach(member)
        for (const channel of value.channels) {
          identifier(channel.device)
          uuid(channel.registration)
          positive(channel.generation)
        }
        return value satisfies Retirement
      }),
    forceRetirement: (id, operationId, reason) =>
      api.postApiV1DeviceRetirementsByIdForceRevoke(
        transport,
        { pathParams: { id: uuid(id) }, body: { operationId: uuid(operationId), reason } },
        (value) => value,
      ),
    assetState: (ref, operationId, state) =>
      api.postApiV1DeviceViewsByKindByIdAssetState(
        transport,
        { pathParams: { ...ref }, body: { operationId: uuid(operationId), state } },
        (value) => value,
      ),
  }
}
