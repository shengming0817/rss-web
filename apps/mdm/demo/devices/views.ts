/** MOCK_SOURCE: same wire as the product; synthetic facts never enter production bundles. */
import { randomUUID } from 'node:crypto'
import { array, closed, count, uuid } from '../../src/services/decode'
import {
  member,
  currentMember,
  type Endpoint,
} from '../../src/features/devices/clients/endpoint-model'
import { verificationText, type Association } from '../../src/features/devices/clients/associations'
import type { ObjectRef } from '../../src/features/devices/clients/objects'
import type { Permission } from '../../src/features/operations/clients/authorization'
import type { DomainHandler, DemoRequest } from '../scenario'
import { createReceipts, error, ok } from '../http'
import type { DemoDevice } from './fixtures'
type Can = (actor: string, permission: Permission, device?: string) => boolean
export function mergedFieldState<T extends { kind: string }>(
  sources: { state: T; evidence: { source: string } }[],
): T | { kind: 'conflict' } {
  const manual = sources.filter((s) => s.evidence.source === 'manual'),
    selected = manual.length ? manual : sources
  return selected.length &&
    selected.every((s) => JSON.stringify(s.state) === JSON.stringify(selected[0]!.state))
    ? selected[0]!.state
    : { kind: 'conflict' }
}
export function endpointProjection(d: DemoDevice): Endpoint {
  const registrations = d.registrations.filter(
    (r) => r.source === 'agent.builtin' || r.source === 'mdm.apple' || r.source === 'mdm.windows',
  )
  const latest = registrations.filter(
    (r) =>
      !registrations.some((other) => other.source === r.source && other.generation > r.generation),
  )
  const mdm = latest.find((r) => r.source !== 'agent.builtin' && r.status === 'active')
  return {
    id: d.summary.id,
    status: latest.some((r) => r.status === 'active')
      ? 'active'
      : d.summary.status === 'pending'
        ? 'pending'
        : latest.length
          ? 'revoked'
          : 'registered',
    primaryMdmRegistration:
      mdm && mdm.source !== 'agent.builtin'
        ? { registrationId: mdm.registrationId, generation: mdm.generation, source: mdm.source }
        : null,
    channels: latest.map((r) => ({
      channel: r.source === 'agent.builtin' ? 'agent' : 'mdm',
      registrationId: r.registrationId,
      generation: r.generation,
      status: r.status,
      source: r.source,
      children: [],
      userContext: null,
    })),
    enrollments: d.enrollments.map((id) => ({
      enrollmentId: id,
      source: d.summary.platform === 'macos' ? 'mdm.apple' : 'mdm.windows',
      status: 'bound',
      expiresAt: 4102444800,
    })),
  }
}
export function endpointDetailProjection(d: DemoDevice) {
  const p = endpointProjection(d)
  return {
    ...p,
    inventoryAvailable: d.summary.inventoryAvailable,
    capabilities: ['script', 'software', 'configuration'].map((action) => {
      const channel = action === 'configuration' ? 'mdm' : 'agent'
      return {
        action,
        channel,
        productSupport: { state: 'supported', reason: null },
        devicePrerequisite: {
          state: p.channels.some((c) => c.channel === channel && c.status === 'active')
            ? 'ready'
            : 'blocked',
          reason: p.channels.some((c) => c.channel === channel && c.status === 'active')
            ? null
            : 'not_registered',
        },
        permission: { allowed: true, reason: null },
      }
    }),
  }
}
export function createDeviceViewsDemo(devices: () => Map<string, DemoDevice>, can: () => Can) {
  const relations = new Map<string, Association>(),
    receipts = createReceipts(),
    tokens = new Map<
      string,
      {
        binding: string
        offset: number
        source?:
          | { endpoint: string; field: string; values: unknown[]; evidence: unknown }
          | undefined
      }
    >()
  let epoch = 0
  function effective(a: Association): Association {
    if (a.state === 'revoked') return a
    const valid = a.members.every((m) => {
      const d = devices().get(m.device),
        c = d && currentMember(endpointProjection(d), m.channel)
      return c?.registrationId === m.registrationId && c.generation === m.generation
    })
    return { ...a, state: valid ? a.state : 'needs_verification' }
  }
  function readable(request: DemoRequest, id: string) {
    return can()(request.actor.principalId, 'inventory_read', id)
  }
  function writable(request: DemoRequest, id: string) {
    return readable(request, id) && can()(request.actor.principalId, 'device_association_write', id)
  }
  function groups(request: DemoRequest) {
    const rows = new Map([...devices()].filter(([id]) => readable(request, id))),
      result: { reference: ObjectRef; association: Association | null; endpoints: Endpoint[] }[] =
        []
    for (const raw of relations.values()) {
      const a = effective(raw)
      if (a.state === 'revoked' || !a.members.every((m) => rows.has(m.device))) continue
      const endpoints = a.members.map((m) => endpointProjection(rows.get(m.device)!))
      a.members.forEach((m) => rows.delete(m.device))
      result.push({ reference: { kind: 'association', id: a.id }, association: a, endpoints })
    }
    for (const [id, d] of rows)
      result.push({
        reference: { kind: 'endpoint', id },
        association: null,
        endpoints: [endpointProjection(d)],
      })
    return result.sort((a, b) =>
      `${a.reference.kind}:${a.reference.id}`.localeCompare(
        `${b.reference.kind}:${b.reference.id}`,
      ),
    )
  }
  function binding(request: DemoRequest, extra: unknown) {
    return JSON.stringify([
      request.actor,
      epoch,
      [...devices()].map(([id, d]) => [id, d.registrations, d.inventory]),
      [...relations.values()],
      [...devices().keys()].filter((id) => readable(request, id)),
      extra,
    ])
  }
  function token(
    binding: string,
    offset: number,
    source?: { endpoint: string; field: string; values: unknown[]; evidence: unknown },
  ) {
    const id = randomUUID()
    tokens.set(id, { binding, offset, source })
    while (tokens.size > 256) tokens.delete(tokens.keys().next().value!)
    return id
  }
  function view(request: DemoRequest, reference: ObjectRef) {
    const g =
      reference.kind === 'endpoint'
        ? readable(request, reference.id) && devices().has(reference.id)
          ? {
              reference,
              association: null,
              endpoints: [endpointProjection(devices().get(reference.id)!)],
            }
          : undefined
        : groups(request).find(
            (g) => g.reference.kind === 'association' && g.reference.id === reference.id,
          )
    if (!g) return undefined
    const fields: Record<string, unknown> = {},
      lists: Record<string, unknown> = {}
    const keys = new Set(
      g.endpoints.flatMap((e) => Object.keys(devices().get(e.id)!.inventory.fields)),
    )
    for (const key of keys) {
      const sources = g.endpoints.flatMap((e) =>
        (devices().get(e.id)!.inventory.fields[key]?.sources ?? []).map((fact) => ({
          endpoint: e.id,
          fact,
        })),
      )
      fields[key] = {
        field: key,
        state: mergedFieldState(sources.map((s) => s.fact)),
        sources,
      }
    }
    for (const e of g.endpoints) {
      const ev = {
        source: 'agent.builtin',
        dataset: 'device.software',
        registration: e.channels.find((c) => c.channel === 'agent')?.registrationId ?? null,
        registrationGeneration: e.channels.find((c) => c.channel === 'agent')?.generation ?? null,
        epoch: null,
        snapshotId: `demo-software:${e.id}`,
        observedAt: 1780000000,
        receivedAt: 1780000001,
        actor: null,
      }
      const values = [
        {
          kind: 'object',
          value: {
            name: { kind: 'string', value: 'Enterprise Browser' },
            version: { kind: 'string', value: '128.0' },
          },
        },
      ]
      const key = 'device.software'
      const existing = lists[key] as
        | { state: unknown; sources: unknown[]; itemKey: null }
        | undefined
      const state =
        e.status === 'active'
          ? { kind: 'known', count: 1, digest: 'synthetic-demo-list' }
          : { kind: 'missing' }
      const source = {
        endpoint: e.id,
        evidence: ev,
        state,
        lastKnown: null,
        cursor: token(binding(request, [reference, key]), 0, {
          endpoint: e.id,
          field: key,
          values,
          evidence: ev,
        }),
      }
      if (existing) existing.sources.push(source)
      else lists[key] = { state, sources: [source], itemKey: null }
    }
    return {
      ...g,
      fields,
      lists,
      inventorySources: g.endpoints.map((e) => ({
        endpoint: e.id,
        quality: devices().get(e.id)!.inventory.quality,
        revisions: devices().get(e.id)!.inventory.revisions,
      })),
    }
  }
  const handle: DomainHandler = (request, scenario) => {
    const { method, path, query } = request
    if (path === '/api/v1/device-views' && method === 'GET') {
      let items = scenario === 'empty' ? [] : groups(request)
      items = items.filter((g) =>
        g.endpoints.some(
          (e) =>
            (!query.get('status') || e.status === query.get('status')) &&
            (!query.get('channel') || e.channels.some((c) => c.channel === query.get('channel'))) &&
            (!query.get('source') || e.channels.some((c) => c.source === query.get('source'))),
        ),
      )
      if (query.get('descending') === 'true') items.reverse()
      const b = binding(request, [
          path,
          query.get('status'),
          query.get('channel'),
          query.get('source'),
          query.get('descending'),
        ]),
        old = query.get('cursor') ? tokens.get(query.get('cursor')!) : undefined
      if (query.has('cursor') && (!old || old.binding !== b))
        return error('device_view_cursor_invalidated')
      const offset = old?.offset ?? 0,
        limit = Number(query.get('limit') ?? 20)
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        return error('malformed_request', 400)
      return ok({
        items: items.slice(offset, offset + limit),
        statistics: {
          endpointCount: items.reduce((n, g) => n + g.endpoints.length, 0),
          deviceViewCount: items.length,
        },
        nextCursor: offset + limit < items.length ? token(b, offset + limit) : null,
      })
    }
    const vm =
      /^\/api\/v1\/device-views\/(endpoint|association)\/([^/]+)(?:\/inventory-lists\/([^/]+))?$/.exec(
        path,
      )
    if (vm && method === 'GET') {
      const ref: ObjectRef = { kind: vm[1] as ObjectRef['kind'], id: decodeURIComponent(vm[2]!) },
        v = view(request, ref)
      if (!v) return error('inventory_not_found', 404)
      if (!vm[3]) return ok(v)
      const key = decodeURIComponent(vm[3]),
        old = tokens.get(query.get('cursor') ?? '')
      if (!old?.source || old.binding !== binding(request, [ref, key]))
        return error('device_view_cursor_invalidated')
      const source = old.source,
        limit = Number(query.get('limit') ?? 20),
        items = source.values.slice(old.offset, old.offset + limit)
      return ok({
        reference: ref,
        field: key,
        source: source.evidence,
        endpoint: source.endpoint,
        total: source.values.length,
        items,
        nextCursor:
          old.offset + items.length < source.values.length
            ? token(old.binding, old.offset + items.length, source)
            : null,
      })
    }
    const cm = /^\/api\/v1\/devices\/([^/]+)\/association-candidates$/.exec(path)
    if (cm && method === 'GET') {
      const id = decodeURIComponent(cm[1]!)
      if (!writable(request, id)) return error('permission_denied', 403)
      const d = devices().get(id),
        channel = query.get('channel')
      if (
        !d ||
        !['mdm', 'agent'].includes(channel ?? '') ||
        !currentMember(endpointProjection(d), channel as 'mdm' | 'agent')
      )
        return error('operation_conflict')
      const other = channel === 'mdm' ? 'agent' : 'mdm',
        items =
          scenario === 'empty'
            ? []
            : [...devices().values()]
                .filter(
                  (d) =>
                    d.summary.id !== id &&
                    writable(request, d.summary.id) &&
                    d.summary.id > (query.get('after') ?? '') &&
                    ![...relations.values()].some(
                      (a) =>
                        a.state !== 'revoked' && a.members.some((m) => m.device === d.summary.id),
                    ),
                )
                .flatMap((d) => {
                  const m = currentMember(endpointProjection(d), other)
                  return m ? [m] : []
                })
                .sort((a, b) => a.device.localeCompare(b.device)),
        limit = Number(query.get('limit') ?? 20)
      return ok({
        items: items.slice(0, limit),
        nextCursor: items.length > limit ? items[limit - 1]!.device : null,
      })
    }
    const am = /^\/api\/v1\/device-associations\/([^/]+)(?:\/(revoke))?$/.exec(path)
    if (am && method === 'GET') {
      const a = relations.get(am[1]!)
      return a && a.members.every((m) => readable(request, m.device))
        ? ok(effective(a))
        : error('inventory_not_found', 404)
    }
    if (method !== 'POST' || (path !== '/api/v1/device-associations' && !am?.[2])) return
    const revoke = !!am?.[2],
      body = closed(
        request.body,
        revoke
          ? ['operationId', 'expectedVersion', 'reason']
          : ['operationId', 'associationId', 'expectedVersion', 'mdm', 'agent', 'evidence'],
      ),
      operationId = uuid(body['operationId'])
    const old = revoke
      ? relations.get(am![1]!)
      : body['associationId'] === null
        ? undefined
        : relations.get(uuid(body['associationId']))
    const members = revoke ? old?.members : array([body['mdm'], body['agent']], member)
    if (!members || members.some((m) => !writable(request, m.device)))
      return error('permission_denied', 403)
    return receipts.write(request, operationId, () => {
      const expected = count(body['expectedVersion'])
      if ((old?.version ?? 0) !== expected || (!old && expected !== 0) || scenario === 'conflict')
        return error('operation_conflict')
      if (!verificationText(String(body[revoke ? 'reason' : 'evidence'] ?? '')))
        return error('malformed_request', 400)
      if (!revoke) {
        if (
          members[0]?.channel !== 'mdm' ||
          members[1]?.channel !== 'agent' ||
          members[0].device === members[1].device
        )
          return error('malformed_request', 400)
        if (
          old &&
          members.some(
            (m) => !old.members.some((p) => p.device === m.device && p.channel === m.channel),
          )
        )
          return error('operation_conflict')
        if (
          members.some((m) => {
            const d = devices().get(m.device),
              current = d && currentMember(endpointProjection(d), m.channel)
            return (
              !current ||
              current.registrationId !== m.registrationId ||
              current.generation !== m.generation ||
              [...relations.values()].some(
                (a) =>
                  a.id !== old?.id &&
                  a.state !== 'revoked' &&
                  a.members.some((p) => p.device === m.device),
              )
            )
          })
        )
          return error('operation_conflict')
      }
      const a: Association = {
        id: old?.id ?? randomUUID(),
        version: expected + 1,
        state: revoke ? 'revoked' : 'confirmed',
        members: structuredClone(members),
        evidence: revoke ? old!.evidence : String(body['evidence']),
        confirmedBy: revoke ? old!.confirmedBy : request.actor.principalId,
        confirmedAt: revoke ? old!.confirmedAt : Math.floor(Date.now() / 1000),
        revokedBy: revoke ? request.actor.principalId : null,
        revokedAt: revoke ? Math.floor(Date.now() / 1000) : null,
        reason: revoke ? String(body['reason']) : null,
      }
      relations.set(a.id, a)
      epoch++
      return ok(a)
    })
  }
  return {
    handle,
    objects() {
      const linked = new Set<string>()
      const objects = [...relations.values()]
        .map(effective)
        .filter((a) => a.state !== 'revoked')
        .map((a) => {
          a.members.forEach((m) => linked.add(m.device))
          return {
            object: { kind: 'association' as const, id: a.id },
            associationVersion: a.version,
            verified: a.state === 'confirmed',
            members: a.members.map((m) => ({
              device: m.device,
              channel: m.channel,
              registrationId: m.registrationId,
              generation: m.generation,
            })),
          }
        })
      return [
        ...objects,
        ...[...devices().values()]
          .filter((d) => !linked.has(d.summary.id))
          .map((d) => ({
            object: { kind: 'endpoint' as const, id: d.summary.id },
            associationVersion: null,
            verified: true,
            members: d.registrations
              .filter((r) => r.status === 'active')
              .map((r) => ({
                device: d.summary.id,
                channel: r.source === 'agent.builtin' ? ('agent' as const) : ('mdm' as const),
                registrationId: r.registrationId,
                generation: r.generation,
              })),
          })),
      ]
    },
    reset() {
      relations.clear()
      receipts.reset()
      tokens.clear()
      epoch++
    },
  }
}
