import { TENANT, type DomainHandler } from '../scenario'
import { createPages, createReceipts, error, ok, operation } from '../http'
import { closed, identifier } from '../../src/services/decode'
import { catalogDefinition, type CatalogEntry } from '../../src/features/software/clients/catalog'
import type { createResourceDemo } from '../policies/resources'
import type { createAdmissionDemo } from './admission'
import { publicationBindings, type createPublicationDemo } from './publication'
import type { DemoEvent } from '../policies/schedule'
export const candidate = (body: Record<string, unknown>, status = 200) =>
  ok({ contract: 'software-v1', tenantId: TENANT, source: 'mock', ...body }, status)
export function createCatalogDemo(
  resources: ReturnType<typeof createResourceDemo>,
  admission: ReturnType<typeof createAdmissionDemo>,
  publication: ReturnType<typeof createPublicationDemo>,
  deviceIds: () => string[],
) {
  const metadata = new Map<string, CatalogEntry['metadata']>(),
    pages = createPages(),
    receipts = createReceipts()
  const usage = new Map<string, { device: string; at: number; active: boolean }[]>()
  let now = Math.floor(Date.now() / 1000)
  function entry(id: string): CatalogEntry | null {
    const resource = resources.read(id)
    if (resource?.kind !== 'software') return null
    const devices = new Set(deviceIds()),
      samples = (usage.get(id) ?? []).filter(
        (s) => devices.has(s.device) && s.at > now - 30 * 86400 && s.at <= now,
      )
    const sampled = new Set(samples.map((s) => s.device)),
      active = new Set(samples.filter((s) => s.active).map((s) => s.device))
    return {
      resource,
      metadata: metadata.get(id) ?? {
        revision: 0,
        operation: null,
        definition: {
          title: id,
          description: '',
          category: '',
          license: { kind: 'unknown', seats: null, expiresAt: null },
          supersedes: [],
        },
      },
      usage: {
        asOf: samples.length ? now : null,
        windowDays: 30,
        sampledDevices: sampled.size,
        totalDevices: devices.size,
        activeDevices: samples.length ? active.size : null,
        unknownDevices: devices.size - sampled.size,
        source: samples.length ? 'agent_usage' : 'unavailable',
      },
    }
  }
  function cyclic(
    root: string,
    predecessors: CatalogEntry['metadata']['definition']['supersedes'],
  ) {
    const visiting = new Set<string>([root]),
      visited = new Set<string>()
    function walk(id: string): boolean {
      if (visiting.has(id)) return true
      if (visited.has(id)) return false
      if (visited.size > 1000) return true
      visiting.add(id)
      if ((metadata.get(id)?.definition.supersedes ?? []).some((s) => walk(s.resource))) return true
      visiting.delete(id)
      visited.add(id)
      return false
    }
    return predecessors.some((s) => walk(s.resource))
  }
  const handle: DomainHandler = (request, scenario) => {
    const match =
      /^\/api\/v1\/mdm-candidate\/software\/(catalog|sources|publications)(?:\/([^/]+))?$/.exec(
        request.path,
      )
    if (!match) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      const id = match[2] ? identifier(decodeURIComponent(match[2])) : undefined
      if (!id && request.method === 'GET') {
        if (match[1] === 'sources')
          return candidate({
            ...pages.page(
              request.path,
              scenario === 'empty' ? [] : admission.list(),
              request.query,
            ),
            bindings: publicationBindings,
          })
        if (match[1] === 'publications')
          return candidate(
            pages.page(request.path, scenario === 'empty' ? [] : publication.list(), request.query),
          )
        const query = (request.query.get('query') ?? '').trim().toLowerCase()
        const items =
          scenario === 'empty'
            ? []
            : resources
                .list()
                .map((r) => entry(r.id))
                .filter(
                  (r): r is CatalogEntry =>
                    !!r &&
                    `${r.resource.id} ${r.metadata.definition.title} ${r.metadata.definition.category}`
                      .toLowerCase()
                      .includes(query),
                )
        return candidate(pages.page(JSON.stringify([request.path, query]), items, request.query))
      }
      if (!id || match[1] !== 'catalog') return error('malformed_request', 400)
      const current = entry(id)
      if (!current) return error('resource_not_found', 404)
      if (request.method === 'GET') return candidate({ entry: current })
      if (request.method !== 'POST') return
      const op = operation(request.body)
      return receipts.write(request, op.operationId, () => {
        if (current.metadata.revision !== op.expectedRevision) return error('operation_conflict')
        const { action, ...fields } = closed(op.input, [
          'action',
          'title',
          'description',
          'category',
          'license',
          'supersedes',
        ])
        if (action !== 'put') return error('malformed_request', 400)
        const definition = catalogDefinition(fields)
        if (
          cyclic(id, definition.supersedes) ||
          definition.supersedes.some((s) => {
            const predecessor = resources.read(s.resource)
            return (
              predecessor?.kind !== 'software' ||
              !predecessor.versions.some((v) => v.id === s.version && v.state !== 'archived')
            )
          })
        )
          return error('malformed_request', 400)
        metadata.set(id, {
          revision: current.metadata.revision + 1,
          operation: op.operationId,
          definition,
        })
        return candidate({ entry: entry(id) })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    tick(event: DemoEvent) {
      if (event.at < now) return
      now = event.at
      for (const [id, values] of usage)
        usage.set(
          id,
          values.filter((s) => s.at > now - 30 * 86400),
        )
      if (
        event.kind !== 'software_usage' ||
        !event.resource ||
        !event.device ||
        typeof event.active !== 'boolean' ||
        !deviceIds().includes(event.device) ||
        resources.read(event.resource)?.kind !== 'software'
      )
        return
      const values = usage.get(event.resource) ?? []
      const previous = values.find((s) => s.device === event.device && s.at === event.at)
      if (previous) previous.active ||= event.active
      else values.push({ device: event.device, at: event.at, active: event.active })
      usage.set(event.resource, values)
    },
    reset() {
      metadata.clear()
      pages.reset()
      receipts.reset()
      usage.clear()
      now = Math.floor(Date.now() / 1000)
    },
  }
}
