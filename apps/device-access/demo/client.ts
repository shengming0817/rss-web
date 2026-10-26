/** MOCK_SOURCE: HTTP candidate projections are available only from the explicit demo entry. */
import type { HttpTransport } from '@rss/api/mdm'
import type { DeviceAccessClient, SecurityClient, Challenge } from '@rss/device-access/client'
import { viewDecoders as d } from '@rss/device-access/model'
export function createDemoClients(transport: HttpTransport): {
  client: DeviceAccessClient
  security: SecurityClient
} {
  const root = '/api/da-demo'
  function read<T>(
    path: string,
    decode: (v: unknown) => T,
    signal?: AbortSignal,
    cursor?: string | null,
    query: Record<string, string> = {},
  ) {
    return transport.request({
      method: 'GET',
      path: root + path,
      ...(signal ? { signal } : {}),
      query: { ...query, ...(cursor ? { cursor } : {}) },
      successStatus: 200,
      decode,
    })
  }
  function write<T>(path: string, body: unknown, decode: (v: unknown) => T, signal?: AbortSignal) {
    return transport.request({
      method: 'POST',
      path: root + path,
      body,
      ...(signal ? { signal } : {}),
      successStatus: 200,
      decode,
    })
  }
  const devicePath = (device: string) => '/computers/' + encodeURIComponent(device)
  const challenge = (v: unknown): Challenge => {
    const x = d.closed(v, ['id', 'options', 'expiresAt'])
    return {
      id: d.uuid(x['id']),
      options: d.closed(x['options'], []),
      expiresAt: d.count(x['expiresAt']),
    }
  }
  const ready = { available: true, reason: null, source: 'demo' as const }
  return {
    client: {
      capabilities: {
        assignment: ready,
        passkeys: ready,
        configuration: ready,
        bindings: ready,
        recovery: ready,
        rotation: ready,
        applications: ready,
        applicationWrite: ready,
        security: ready,
        audit: ready,
      },
      computers: (cursor, signal) =>
        read('/computers', (v) => d.page(v, d.computerView), signal, cursor),
      computer: (device, signal) =>
        read(
          devicePath(device),
          (v) => {
            const c = d.computerView(v)
            d.same(c.id, device)
            return c
          },
          signal,
        ),
      bindings: (device, cursor, signal) =>
        read(
          devicePath(device) + '/bindings',
          (v) => d.page(v, (x) => d.bindingView(x, device)),
          signal,
          cursor,
        ),
      changeBinding: (device, id, input, signal) =>
        write(
          devicePath(device) + '/bindings/' + id,
          input,
          (v) => d.bindingView(v, device),
          signal,
        ),
      bindingOperation: (device, id, signal) =>
        read(
          devicePath(device) + '/binding-operations/' + id,
          (v) => d.bindingView(v, device),
          signal,
        ),
      assignment: (device, signal) =>
        read(devicePath(device) + '/assignment', (v) => d.assignmentView(v, device), signal),
      people: (signal) => read('/people', (v) => d.list(v, d.person), signal),
      assign: (device, input, signal) =>
        write(
          devicePath(device) + '/assignment',
          input,
          (v) => d.assignmentView(v, device),
          signal,
        ),
      passkeys: (device, cursor, signal) =>
        read(
          devicePath(device) + '/passkeys',
          (v) => d.page(v, (x) => d.passkeyView(x, device)),
          signal,
          cursor,
        ),
      materials: (device, cursor, signal) =>
        read(
          devicePath(device) + '/materials',
          (v) => d.page(v, (x) => d.materialView(x, device)),
          signal,
          cursor,
        ),
      reveal: (device, material, operationId, signal) =>
        write(
          devicePath(device) + '/materials/' + material.id + '/secret',
          { operationId, version: material.version },
          (v) => d.text(d.closed(v, ['secret'])['secret'], 4096),
          signal,
        ),
      rotate: (device, material, operationId, signal) =>
        write(
          devicePath(device) + '/materials/' + material.id + '/rotate',
          { operationId, version: material.version },
          (v) => d.operationView(v, device, operationId),
          signal,
        ),
      operation: (device, id, signal) =>
        read(
          '/operations/' + id,
          (v) => (v === null ? null : d.operationView(v, device, id)),
          signal,
          null,
          device ? { device } : {},
        ),
      configurations: (cursor, signal) =>
        read('/configurations', (v) => d.page(v, d.configurationView), signal, cursor),
      configuration: (input, signal) =>
        write('/configurations', input, d.configurationView, signal),
      scopes: (signal) => read('/scopes', (v) => d.list(v, d.person), signal),
      applications: (cursor, signal) =>
        read('/applications', (v) => d.page(v, d.applicationView), signal, cursor),
      application: (input, signal) => write('/applications', input, d.applicationView, signal),
      audit: (device, cursor, signal) =>
        read(
          device ? devicePath(device) + '/audit' : '/audit',
          (v) => d.page(v, d.auditView),
          signal,
          cursor,
        ),
      materialChallenge: (device, material, operationId, signal) =>
        write(
          devicePath(device) + '/challenge',
          { operationId, material: material.id },
          challenge,
          signal,
        ),
      bindingChallenge: (device, id, input, signal) =>
        write(devicePath(device) + '/challenge', { ...input, id }, challenge, signal),
      applicationChallenge: (input, signal) => write('/challenge', input, challenge, signal),
    },
    security: {
      list: (signal) => read('/credentials', (v) => d.list(v, d.credentialView), signal),
      register: (label, signal) => write('/credentials', { label }, d.credentialView, signal),
      remove: (id, signal) =>
        write(
          '/credentials/' + id + '/remove',
          {},
          (v) => {
            d.same(d.closed(v, ['removed'])['removed'], true)
          },
          signal,
        ),
      reauthenticate: (signal) => write('/prove', {}, () => undefined, signal),
      prove: (_value, signal) => write('/prove', {}, () => undefined, signal),
      cancel: () => write('/cancel', {}, () => undefined),
    },
  }
}
