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
import { CapabilityUnavailable } from '../model'
import type { OriginalOperation } from '../model'
import type { DeviceAccessClient } from '../client'
import { object, closed, text, count, bool, uuid, nullable, list, same } from '../model/decode'
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
      transport.request({
        method: 'GET',
        path: '/api/v1/device-views',
        query: queryParameters({ limit: 50, ...query }),
        signal,
        successStatus: 200,
        decode: (value) => computerDirectory(value, query),
      }),
    viewComputers: (reference, signal) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/device-views/{kind}/{id}',
        pathParams: reference,
        signal,
        successStatus: 200,
        decode(value) {
          const row = object(value)
          const actual = closed(row['reference'], ['kind', 'id'])
          same(actual['kind'], reference.kind)
          same(actual['id'], reference.id)
          return list(row['endpoints'], nativeComputer)
        },
      }),
    computer: (device, signal) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/device-views/{kind}/{id}',
        pathParams: { kind: 'endpoint', id: device },
        signal,
        successStatus: 200,
        decode(value) {
          const v = object(value),
            r = closed(v['reference'], ['kind', 'id'])
          same(r['kind'], 'endpoint')
          same(r['id'], device)
          const rows = list(v['endpoints'], nativeComputer)
          if (rows.length !== 1 || rows[0]?.id !== device) throw new Error('Wrong endpoint')
          return rows[0]
        },
      }),
    bindings: (device, query, signal) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/device-access',
        pathParams: { device },
        query: queryParameters({ limit: 50, ...query }),
        signal,
        successStatus: 200,
        decode: (value) => bindingDirectory(value, device, query),
      }),
    binding: (device, id, signal) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/device-access/bindings/{id}',
        pathParams: { device, id: uuid(id) },
        signal,
        successStatus: 200,
        decode: (value) => {
          const row = bindingDetail(value, device)
          same(row.id, id)
          return row
        },
      }),
    changeBinding: (device, id, input, signal) =>
      transport.request({
        method: 'PUT',
        path: '/api/v1/devices/{device}/device-access/bindings/{id}',
        pathParams: { device, id: uuid(id) },
        body: input,
        signal,
        successStatus: 200,
        decode: (v) => {
          const b = bindingDetail(v, device)
          same(b.id, id)
          if (b.revision <= input.expectedRevision) throw new Error('Wrong revision')
          return b
        },
      }),
    bindingOperation: (device, id, signal) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/device-access/operations/{id}',
        pathParams: { device, id: uuid(id) },
        signal,
        successStatus: 200,
        decode: (v) => bindingDetail(v, device),
      }),
    assignment: async () => unavailable('asset_contract'),
    people: async () => unavailable('asset_contract'),
    assign: async () => unavailable('asset_contract'),
    passkeys: async () => unavailable('passkey_contract'),
    configurations: async () => unavailable('configuration_projection'),
    configuration: async () => unavailable('configuration_projection'),
    readConfiguration: async () => unavailable('configuration_projection'),
    scopes: async () => unavailable('configuration_projection'),
    materials: (device, query, signal) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/recovery-credentials',
        pathParams: { device },
        query: queryParameters({ limit: 50, ...query }),
        signal,
        successStatus: 200,
        decode: (value) => materialDirectory(value, device, query),
      }),
    material: (device, id, version, signal) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/recovery-credentials',
        pathParams: { device },
        query: queryParameters({
          filter: allOf(
            comparison('id', '==', uuid(id)),
            comparison('version', '==', count(version)),
          ),
          limit: 1,
        }),
        signal,
        successStatus: 200,
        decode(value) {
          const page = materialDirectory(value, device, {})
          const row = page.summaries?.[0]
          if (!row || row.id !== id || row.version !== version || page.nextCursor)
            throw new Error('Wrong material')
          return row
        },
      }),
    materialChallenge: (device, material, operationId, signal) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/devices/{device}/device-access/materials/{id}/versions/{version}/step-up',
        pathParams: { device, id: material.id, version: material.version },
        body: { operationId: uuid(operationId) },
        signal,
        successStatus: 200,
        decode: challenge,
      }),
    applicationChallenge: async () => unavailable('application_operation_query'),
    bindingChallenge: (device, id, input, signal) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/devices/{device}/device-access/bindings/{id}/step-up',
        pathParams: { device, id },
        body: input,
        signal,
        successStatus: 200,
        decode: challenge,
      }),
    reveal: async (device, material, operationId, signal) => {
      same(material.device, device)
      if (material.subject.kind !== 'rss_login') return unavailable('material_kind')
      return transport.request({
        method: 'POST',
        path: '/api/v1/devices/{device}/device-access/materials/{id}/versions/{version}/secret',
        pathParams: { device, id: material.id, version: material.version },
        body: { operationId: uuid(operationId) },
        signal,
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['material', 'secret']),
            m = nativeMaterial(v['material'], device)
          same(m.id, material.id)
          same(m.version, material.version)
          return text(v['secret'], 4096)
        },
      })
    },
    rotate: async () => unavailable('recovery_rotation'),
    operation: async (device, id, signal) => {
      if (!device) return unavailable('operation_query')
      return transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/operations/{id}',
        pathParams: { device, id: uuid(id) },
        signal,
        successStatus: 200,
        decode(value): OriginalOperation {
          const v = object(value) // Operations remain opaque beyond their exact identity and native state.
          same(v['operationId'], id)
          return {
            id,
            device,
            kind: 'rotation',
            state: 'pending',
            observations: [{ key: 'execution', state: 'known', value: text(v['commandStatus']) }],
          }
        },
      })
    },
    applications: (query, signal) => {
      const selection = {
        limit: 50,
        ...query,
        filter: allOf("kind=='relying_party'", query.filter),
      }
      return transport.request({
        method: 'GET',
        path: '/api/v1/device-access/enterprise/configuration',
        query: queryParameters(selection),
        signal,
        successStatus: 200,
        decode: (value) => applicationDirectory(value, selection),
      })
    },
    readApplication: (record, signal) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/device-access/enterprise/configuration/{id}',
        pathParams: { id: record },
        signal,
        successStatus: 200,
        decode: (value) => applicationDetail(value, record),
      }),
    application: async () => unavailable('application_operation_query'),
    audit: (device, cursor, signal) =>
      transport.request({
        method: 'GET',
        path: device ? '/api/v1/devices/{device}/timeline' : '/api/v1/audit-events',
        ...(device ? { pathParams: { device } } : {}),
        query: { limit: 50, ...(cursor ? { cursor } : {}) },
        signal,
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['items', 'nextCursor', 'coverage'])
          bool(closed(v['coverage'], ['complete'])['complete'])
          return {
            items: list(v['items'], (raw) => {
              const r = object(raw)
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
        },
      }),
  }
}
