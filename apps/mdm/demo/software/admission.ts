import { createHash } from 'node:crypto'
import type { DomainHandler } from '../scenario'
import type { createResourceDemo } from '../policies/resources'
import { createReceipts, error, ok, operation } from '../http'
import { array, closed, enumeration, identifier, record } from '../../src/services/decode'
import { sourceDefinition } from '../../src/features/software/clients/admission'
import type { admission, SourceDefinition } from '../../src/features/software/clients/admission'
import type { SoftwareDefinition } from '../../src/features/policies/clients/software-definition'
type Admission = ReturnType<typeof admission>
const hash = (value: unknown) => [...createHash('sha256').update(JSON.stringify(value)).digest()]
const key = (id: string, version: string) => JSON.stringify([id, version])
export function createAdmissionDemo(resources: ReturnType<typeof createResourceDemo>) {
  const sources = new Map<
      string,
      { source: SourceDefinition; snapshot: SoftwareDefinition['source']; admission: Admission }
    >(),
    versions = new Map<string, Admission>(),
    receipts = createReceipts()
  function sourceAllowed(source: SoftwareDefinition['source']) {
    const saved = sources.get(key(source.id, source.revision))
    return (
      saved?.admission.state === 'approved' &&
      JSON.stringify(saved.snapshot.sha256) === JSON.stringify(source.sha256)
    )
  }
  function isAdmitted(id: string, version: string, operation?: string): boolean {
    const saved = versions.get(key(id, version)),
      resource = resources.read(id)?.versions.find((v) => v.id === version)
    return (
      !!resource &&
      resource.state !== 'archived' &&
      saved?.state === 'approved' &&
      (!operation || saved.operation === operation) &&
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
          !isAdmitted(dependency.resource, dependency.version) ||
          !dependenciesAllowed(dependency.resource, dependency.version, visiting, seen)
        )
          return false
      }
    }
    visiting.delete(coordinate)
    return true
  }
  const handle: DomainHandler = (request, scenario) => {
    const sourceRoute = /^\/api\/v3\/software\/sources\/([^/]+)\/revisions\/([^/]+)$/.exec(
        request.path,
      ),
      versionRoute = /^\/api\/v3\/software\/resources\/([^/]+)\/versions\/([^/]+)$/.exec(
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
        previous = sourceRoute ? source?.admission : versions.get(coordinate)
      if (request.method === 'GET') {
        if (sourceRoute)
          return source ? ok(structuredClone(source)) : error('software_source_not_found', 404)
        return resource && resource.state !== 'archived'
          ? ok({
              resource: id,
              version: label,
              resourceDigest: resource.digest,
              admission: previous ?? null,
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
            ? (['register', 'approve', 'withdraw'] as const)
            : (['approve', 'withdraw'] as const),
        )
        const input = closed(
          op.input,
          action === 'register' ? ['action', 'definition'] : ['action', 'evidence'],
        )
        let definition: SourceDefinition | undefined, digest: number[], evidence: string[]
        if (action === 'register') {
          if (source) return error('operation_conflict')
          definition = sourceDefinition(input['definition'])
          if (definition.id !== id || definition.revision !== label)
            return error('malformed_request', 400)
          if (
            definition.kind === 'private'
              ? definition.location !== null
              : definition.location === null
          )
            return error('malformed_request', 400)
          if (definition.kind === 'winget') {
            const url = new URL(definition.location!)
            if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
              return error('malformed_request', 400)
          }
          if (
            definition.kind === 'brew' &&
            !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(definition.location!)
          )
            return error('malformed_request', 400)
          if (definition.publishers.length > 32) return error('malformed_request', 400)
          digest = hash(definition)
          evidence = []
        } else {
          evidence = array(input['evidence'], identifier)
          if (!evidence.length || evidence.length > 32 || evidence.some((v) => v.length > 1024))
            return error('malformed_request', 400)
          if (sourceRoute ? !source : !resource || resource.state === 'archived')
            return error('resource_not_found', 404)
          if (
            action === 'withdraw' ? previous?.state !== 'approved' : previous?.state === 'approved'
          )
            return error('operation_conflict')
          if (!sourceRoute && action === 'approve' && !dependenciesAllowed(id, label))
            return error('operation_conflict')
          digest = sourceRoute ? source!.snapshot.sha256 : resource!.digest
        }
        const next: Admission = {
          revision: op.expectedRevision + 1,
          state:
            action === 'register' ? 'registered' : action === 'approve' ? 'approved' : 'withdrawn',
          operation: op.operationId,
          actor: request.actor.principalId,
          evidence,
          at: Math.floor(Date.now() / 1000),
          digest,
        }
        if (sourceRoute) {
          const result = {
            source: definition ?? source!.source,
            snapshot: { id, revision: label, sha256: digest },
            admission: next,
          }
          sources.set(coordinate, result)
          return ok(structuredClone(result))
        }
        versions.set(coordinate, next)
        return ok({ resource: id, version: label, admission: next })
      })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    isAdmitted,
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
