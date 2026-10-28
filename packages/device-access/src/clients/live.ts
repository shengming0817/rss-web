import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import { CapabilityUnavailable } from '../model'
import type { Computer, OriginalOperation } from '../model'
import type { DeviceAccessClient } from '../client'
import { text, count, uuid, nullable, list, page, same, unique } from '../model/decode'
import { challenge } from './security'
import { application, nativeBinding, nativeComputer, nativeMaterial } from './native'
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
    computers: async (cursor, signal) =>
      api.getApiV1DeviceViews(
        transport,
        {
          query: { fields: 'key,reference,endpoints', limit: 20, ...(cursor ? { cursor } : {}) },
          signal,
        },
        (value) => {
          const p = page(value, (v) => {
            if (!wireSchemas.getApiV1DeviceViewsResponse.validateProjection_DirectoryRow(v))
              throw new Error('Invalid device row')
            const r = v
            return list(r['endpoints'], nativeComputer)
          })
          const byId = new Map<string, Computer>()
          for (const c of p.items.flat()) byId.set(c.id, c)
          return { items: [...byId.values()], nextCursor: p.nextCursor }
        },
      ),
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
    bindings: (device, cursor, signal) =>
      api.getApiV1DevicesByDeviceDeviceAccess(
        transport,
        { pathParams: { device }, query: { limit: 50, ...(cursor ? { cursor } : {}) }, signal },
        (v) => {
          const p = page(v, (x) => nativeBinding(x, device))
          unique(p.items, (x) => x.id)
          return p
        },
      ),
    changeBinding: (device, id, input, signal) =>
      api.putApiV1DevicesByDeviceDeviceAccessBindingsById(
        transport,
        { pathParams: { device, id: uuid(id) }, body: input, signal },
        (v) => {
          const b = nativeBinding(v, device)
          same(b.id, id)
          if (b.revision <= input.expectedRevision) throw new Error('Wrong revision')
          return b
        },
      ),
    bindingOperation: (device, id, signal) =>
      api.getApiV1DevicesByDeviceDeviceAccessOperationsById(
        transport,
        { pathParams: { device, id: uuid(id) }, signal },
        (v) => nativeBinding(v, device),
      ),
    assignment: async () => unavailable('asset_contract'),
    people: async () => unavailable('asset_contract'),
    assign: async () => unavailable('asset_contract'),
    passkeys: async () => unavailable('passkey_contract'),
    configurations: async () => unavailable('configuration_projection'),
    configuration: async () => unavailable('configuration_projection'),
    scopes: async () => unavailable('configuration_projection'),
    materials: (device, cursor, signal) =>
      api.getApiV1DevicesByDeviceRecoveryCredentials(
        transport,
        { pathParams: { device }, query: { limit: 100, ...(cursor ? { cursor } : {}) }, signal },
        (value) => page(value, (v) => nativeMaterial(v, device)),
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
    applications: (cursor, signal) =>
      api.getApiV1DeviceAccessEnterpriseConfiguration(
        transport,
        {
          query: { filter: 'kind==relying_party', limit: 50, ...(cursor ? { cursor } : {}) },
          signal,
        },
        (v) =>
          page(v, (raw) => {
            if (
              !wireSchemas.getApiV1DeviceAccessEnterpriseConfigurationResponse.validateProjection_RecordView(
                raw,
              )
            )
              throw new Error('Invalid application row')
            const row = raw
            same(row['kind'], 'relying_party')
            const result = application(row['value'])
            same(row['id'], 'rp:' + result.id)
            return result
          }),
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
