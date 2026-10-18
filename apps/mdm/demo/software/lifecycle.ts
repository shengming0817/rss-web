import { createHash } from 'node:crypto'
import type { DomainHandler } from '../scenario'
import type { createResourceDemo } from '../policies/resources'
import { createReceipts, error, ok, operation } from '../http'
import { closed, enumeration, identifier, record } from '../../src/services/decode'
import { sourceDefinition } from '../../src/features/software/clients/lifecycle'
import type { lifecycle, SourceDefinition } from '../../src/features/software/clients/lifecycle'
import type { SoftwareDefinition } from '../../src/features/policies/clients/software-definition'
type Lifecycle = ReturnType<typeof lifecycle>
const hash = (value: unknown) => [...createHash('sha256').update(JSON.stringify(value)).digest()]
const key = (id: string, version: string) => JSON.stringify([id, version])
export function createLifecycleDemo(resources: ReturnType<typeof createResourceDemo>) {
  const sources = new Map<
      string,
      { source: SourceDefinition; snapshot: SoftwareDefinition['source']; lifecycle: Lifecycle }
    >(),
    versions = new Map<string, Lifecycle>(),
    receipts = createReceipts()
  function sourceAllowed(source: SoftwareDefinition['source']) {
    const saved = sources.get(key(source.id, source.revision))
    return (
      saved?.lifecycle.state === 'enabled' &&
      JSON.stringify(saved.snapshot.sha256) === JSON.stringify(source.sha256)
    )
  }
  function isEnabled(id: string, version: string): boolean {
    const saved = versions.get(key(id, version)),
      resource = resources.read(id)?.versions.find((v) => v.id === version)
    return (
      !!resource &&
      resource.state !== 'archived' &&
      saved?.state === 'enabled' &&
      resource.variants.every(
        (v) => v.declaration.kind === 'software' && sourceAllowed(v.declaration.definition.source),
      )
    )
  }
  function dependenciesAllowed(
    id: string,
    version: string,
    visiting = new Set<string>(),
    seen = new Set<string>(),
  ): boolean {
    const coordinate = key(id, version)
    if (visiting.has(coordinate) || seen.size >= 32) return false
    if (seen.has(coordinate)) return true
    visiting.add(coordinate)
    seen.add(coordinate)
    const value = resources.read(id)?.versions.find((v) => v.id === version)
    if (!value || value.state === 'archived' || !resources.contentReady(id, version)) return false
    for (const variant of value.variants) {
      if (variant.declaration.kind !== 'software') return false
      const d = variant.declaration.definition
      if (!sourceAllowed(d.source)) return false
      for (const dependency of d.dependencies) {
        const target = resources
          .read(dependency.resource)
          ?.versions.find((v) => v.id === dependency.version)
        if (
          !target ||
          JSON.stringify(target.digest) !== JSON.stringify(dependency.sha256) ||
          !isEnabled(dependency.resource, dependency.version) ||
          !dependenciesAllowed(dependency.resource, dependency.version, visiting, seen)
        )
          return false
      }
    }
    visiting.delete(coordinate)
    return true
  }
  const handle: DomainHandler = (request, scenario) => {
    const sourceRoute = /^\/api\/v1\/software\/sources\/([^/]+)\/revisions\/([^/]+)$/.exec(
        request.path,
      ),
      versionRoute = /^\/api\/v1\/software\/resources\/([^/]+)\/versions\/([^/]+)$/.exec(
        request.path,
      )
    const match = sourceRoute ?? versionRoute
    if (!match) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      const id = identifier(decodeURIComponent(match[1]!)),
        label = identifier(decodeURIComponent(match[2]!)),
        coordinate = key(id, label),
        source = sources.get(coordinate),
        resource = resources.read(id)?.versions.find((v) => v.id === label),
        previous = sourceRoute ? source?.lifecycle : versions.get(coordinate)
      if (request.method === 'GET') {
        if (sourceRoute)
          return source ? ok(structuredClone(source)) : error('software_source_not_found', 404)
        return resource && resource.state !== 'archived'
          ? ok({
              resource: id,
              version: label,
              resourceDigest: resource.digest,
              lifecycle: previous ?? null,
            })
          : error('resource_not_found', 404)
      }
      if (request.method !== 'POST') return
      const op = operation(request.body)
      return receipts.write(request, op.operationId, () => {
        if (op.expectedRevision !== (previous?.revision ?? 0)) return error('operation_conflict')
        const action = enumeration(
          record(op.input)['action'],
          sourceRoute
            ? (['register', 'enable', 'disable'] as const)
            : (['enable', 'withdraw'] as const),
        )
        const input = closed(
          op.input,
          action === 'register' ? ['action', 'definition'] : ['action'],
        )
        let definition: SourceDefinition | undefined, digest: number[]
        if (action === 'register') {
          if (source) return error('operation_conflict')
          definition = sourceDefinition(input['definition'])
          if (definition.id !== id || definition.revision !== label)
            return error('malformed_request', 400)
          digest = hash(definition)
        } else {
          if (sourceRoute ? !source : !resource || resource.state === 'archived')
            return error('resource_not_found', 404)
          if (!sourceRoute && action === 'enable' && !dependenciesAllowed(id, label))
            return error('operation_conflict')
          digest = sourceRoute ? source!.snapshot.sha256 : resource!.digest
        }
        const next: Lifecycle = {
          revision: op.expectedRevision + 1,
          state:
            action === 'withdraw' ? 'withdrawn' : action === 'disable' ? 'disabled' : 'enabled',
          operation: op.operationId,
          actor: request.actor.principalId,
          at: Math.floor(Date.now() / 1000),
          digest,
        }
        if (sourceRoute) {
          const result = {
            source: definition ?? source!.source,
            snapshot: { id, revision: label, sha256: digest },
            lifecycle: next,
          }
          sources.set(coordinate, result)
          return ok(structuredClone(result))
        }
        versions.set(coordinate, next)
        return ok({ resource: id, version: label, lifecycle: next })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    isEnabled,
    binding(id: string, version: string) {
      if (!isEnabled(id, version)) return null
      const v = resources.read(id)!.versions.find((v) => v.id === version)!
      return JSON.stringify([
        versions.get(key(id, version))!.operation,
        v.variants.map((v) =>
          v.declaration.kind === 'software'
            ? sources.get(
                key(v.declaration.definition.source.id, v.declaration.definition.source.revision),
              )?.lifecycle.operation
            : null,
        ),
      ])
    },
    enableDraft(id: string, version: string, actor: string, operationId: string) {
      const existing = versions.get(key(id, version))
      if (
        existing?.state === 'withdrawn' ||
        (existing?.state === 'enabled' && !isEnabled(id, version))
      )
        return false
      if (!existing) {
        const v = resources.read(id)?.versions.find((v) => v.id === version)
        if (!v || !dependenciesAllowed(id, version)) return false
        versions.set(key(id, version), {
          revision: 1,
          state: 'enabled',
          operation: operationId,
          actor,
          at: Math.floor(Date.now() / 1000),
          digest: v.digest,
        })
      }
      return true
    },
    sourceAllowed,
    source: (id: string, revision: string) =>
      structuredClone(sources.get(key(id, revision)) ?? null),
    list: () => structuredClone([...sources.values()]),
    reset() {
      sources.clear()
      versions.clear()
      receipts.reset()
    },
  }
}
