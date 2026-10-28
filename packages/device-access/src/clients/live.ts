import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import { queryParameters, comparison, allOf } from '@rss/api/mdm-query'
import {
  bindingDirectory,
  materialDirectory,
  applicationDirectory,
  computerDirectory,
  bindingDetail,
  applicationDetail,
} from './directory'
import type { HttpTransport } from '@rss/api/mdm'
import { CapabilityUnavailable, type OriginalOperation } from '../model'
import type { DeviceAccessClient } from '../client'
import { object, closed, text, count, uuid, nullable, list, same } from '../model/decode'
import { challenge } from './security'
import { nativeComputer, nativeMaterial } from './native'
export function createLiveClient(transport: HttpTransport): DeviceAccessClient {
  const ready = { available: true, reason: null, source: 'service' as const }
  const missing = (reason: string) => ({ available: false, reason, source: 'service' as const })
  const unavailable = (name: string): never => {
    throw new CapabilityUnavailable(name)
  }
  return {
    capabilities: {
      assignment: missing('asset_contract'),
      passkeys: missing('passkey_contract'),
      configuration: missing('configuration_projection'),
      bindings: ready,
      recovery: ready,
      rotation: missing('recovery_rotation'),
      applications: ready,
      applicationWrite: missing('application_operation_query'),
      security: ready,
      audit: ready,
    },
    computers: (query, signal) =>
      api.getApiV1DeviceViews(
        transport,
        { query: queryParameters({ limit: 50, ...query }), signal },
        (value) => computerDirectory(value, query),
      ),
    viewComputers: (reference, signal) =>
      api.getApiV1DeviceViewsByKindById(transport, { pathParams: reference, signal }, (value) => {
        const row = object(value)
        const actual = closed(row['reference'], ['kind', 'id'])
        same(actual['kind'], reference.kind)
        same(actual['id'], reference.id)
        return list(row['endpoints'], nativeComputer)
      }),
    computer: (device, signal) =>
      api.getApiV1DeviceViewsByKindById(
        transport,
        { pathParams: { kind: 'endpoint', id: device }, signal },
        (value) => {
          const v = value,
            r = v['reference']
          same(r['kind'], 'endpoint')
          same(r['id'], device)
          const rows = list(v['endpoints'], nativeComputer)
          if (rows.length !== 1 || rows[0]?.id !== device) throw new Error('Wrong endpoint')
          return rows[0]
        },
      ),
    bindings: (device, query, signal) =>
      api.getApiV1DevicesByDeviceDeviceAccess(
        transport,
        { pathParams: { device }, query: queryParameters({ limit: 50, ...query }), signal },
        (value) => bindingDirectory(value, device, query),
      ),
    binding: (device, id, signal) =>
      api.getApiV1DevicesByDeviceDeviceAccessBindingsById(
        transport,
        { pathParams: { device, id: uuid(id) }, signal },
        (value) => {
          const row = bindingDetail(value, device)
          same(row.id, id)
          return row
        },
      ),
    changeBinding: (device, id, input, signal) =>
      api.putApiV1DevicesByDeviceDeviceAccessBindingsById(
        transport,
        { pathParams: { device, id: uuid(id) }, body: input, signal },
        (v) => {
          const b = bindingDetail(v, device)
          same(b.id, id)
          if (b.revision <= input.expectedRevision) throw new Error('Wrong revision')
          return b
        },
      ),
    bindingOperation: (device, id, signal) =>
      api.getApiV1DevicesByDeviceDeviceAccessOperationsById(
        transport,
        { pathParams: { device, id: uuid(id) }, signal },
        (v) => bindingDetail(v, device),
      ),
    assignment: async () => unavailable('asset_contract'),
    people: async () => unavailable('asset_contract'),
    assign: async () => unavailable('asset_contract'),
    passkeys: async () => unavailable('passkey_contract'),
    configurations: async () => unavailable('configuration_projection'),
    configuration: async () => unavailable('configuration_projection'),
    readConfiguration: async () => unavailable('configuration_projection'),
    scopes: async () => unavailable('configuration_projection'),
    materials: (device, query, signal) =>
      api.getApiV1DevicesByDeviceRecoveryCredentials(
        transport,
        { pathParams: { device }, query: queryParameters({ limit: 50, ...query }), signal },
        (value) => materialDirectory(value, device, query),
      ),
    material: (device, id, version, signal) =>
      api.getApiV1DevicesByDeviceRecoveryCredentials(
        transport,
        {
          pathParams: { device },
          query: queryParameters({
            filter: allOf(
              comparison('id', '==', uuid(id)),
              comparison('version', '==', count(version)),
            ),
            limit: 1,
          }),
          signal,
        },
        (value) => {
          const page = materialDirectory(value, device, {})
          const row = page.summaries?.[0]
          if (!row || row.id !== id || row.version !== version || page.nextCursor)
            throw new Error('Wrong material')
          return row
        },
      ),
    materialChallenge: (device, material, operationId, signal) =>
      api.postApiV1DevicesByDeviceDeviceAccessMaterialsByIdVersionsByVersionStepUp(
        transport,
        {
          pathParams: { device, id: material.id, version: material.version },
          body: { operationId: uuid(operationId) },
          signal,
        },
        challenge,
      ),
    applicationChallenge: async () => unavailable('application_operation_query'),
    bindingChallenge: (device, id, input, signal) =>
      api.postApiV1DevicesByDeviceDeviceAccessBindingsByIdStepUp(
        transport,
        { pathParams: { device, id }, body: input, signal },
        challenge,
      ),
    reveal: async (device, material, operationId, signal) => {
      same(material.device, device)
      if (material.subject.kind !== 'rss_login') return unavailable('material_kind')
      return api.postApiV1DevicesByDeviceDeviceAccessMaterialsByIdVersionsByVersionSecret(
        transport,
        {
          pathParams: { device, id: material.id, version: material.version },
          body: { operationId: uuid(operationId) },
          signal,
        },
        (value) => {
          const v = value,
            m = nativeMaterial(v['material'], device)
          same(m.id, material.id)
          same(m.version, material.version)
          return text(v['secret'], 4096)
        },
      )
    },
    rotate: async () => unavailable('recovery_rotation'),
    operation: async (device, id, signal) => {
      if (!device) return unavailable('operation_query')
      return api.getApiV1DevicesByDeviceOperationsById(
        transport,
        { pathParams: { device, id: uuid(id) }, signal },
        (value): OriginalOperation => {
          const v = value // Operations remain opaque beyond their exact identity and native state.
          same(v['operationId'], id)
          return {
            id,
            device,
            kind: 'rotation',
            state: 'pending',
            observations: [{ key: 'execution', state: 'known', value: text(v['commandStatus']) }],
          }
        },
      )
    },
    applications: (query, signal) => {
      const selection = {
        limit: 50,
        ...query,
        filter: allOf("kind=='relying_party'", query.filter),
      }
      return api.getApiV1DeviceAccessEnterpriseConfiguration(
        transport,
        { query: queryParameters(selection), signal },
        (value) => applicationDirectory(value, selection),
      )
    },
    readApplication: (record, signal) =>
      api.getApiV1DeviceAccessEnterpriseConfigurationById(
        transport,
        { pathParams: { id: record }, signal },
        (value) => applicationDetail(value, record),
      ),
    application: async () => unavailable('application_operation_query'),
    audit: (device, cursor, signal) => {
      const project = (value: unknown) => {
        if (
          !wireSchemas.getApiV1AuditEventsResponse.validateRoot(value) &&
          !wireSchemas.getApiV1DevicesByDeviceTimelineResponse.validateRoot(value)
        )
          throw new Error('Invalid audit response')
        const v = value
        return {
          items: list(v['items'], (raw) => {
            const r = raw
            return {
              id: text(r['eventId']),
              recordedAt: count(r['recordedAt']),
              actor: text(r['actor']),
              action: text(r['action']),
              device: nullable(r['deviceId'], text),
              outcome: text(r['auditOutcome']),
              phase: text(r['phase']),
            }
          }),
          nextCursor: nullable(v['nextCursor'], text),
        }
      }
      return device
        ? api.getApiV1DevicesByDeviceTimeline(
            transport,
            { pathParams: { device }, query: { limit: 50, ...(cursor ? { cursor } : {}) }, signal },
            project,
          )
        : api.getApiV1AuditEvents(
            transport,
            { query: { limit: 50, ...(cursor ? { cursor } : {}) }, signal },
            project,
          )
    },
  }
}
