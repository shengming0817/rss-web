import * as api from '@rss/api/mdm-operations'
import { validateDeclaration, validateResourceResponse } from '@rss/api/mdm-validators'
import * as schema from '@rss/api/mdm-schemas'
import { allOf, projectedPage, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type { NativeQueryDefinition } from '@rss/api/mdm-types'
import { resourceId, variantKey } from '@rss/mdm-inventory'
import type {
  Applicability,
  MappingDeclaration,
  MappingResource,
  MappingResourceRow,
  MappingVariant,
  MappingVersionsPort,
  PhysicalRead,
  PreparedUpload,
  UploadSession,
} from '@rss/mdm-inventory'
import { boolean, count, enumeration, list, nullable, text, uuid } from './decode'
import { attachment } from './download'
import { boundedObject, requestInput } from './inventory-values'
import { encodeCollectionContent } from './mapping-content'

function digest(value: unknown): readonly number[] {
  const bytes = list(value, count, 32)
  if (bytes.length !== 32 || bytes.some((byte) => byte > 255))
    throw new Error('Invalid artifact digest')
  return bytes
}
function sameDigest(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index])
}
function sameDocument(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => sameDocument(value, b[index]))
    )
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const left = Object.keys(a),
    right = Object.keys(b)
  return (
    left.length === right.length &&
    left.every(
      (key) => Object.hasOwn(b, key) && sameDocument(Reflect.get(a, key), Reflect.get(b, key)),
    )
  )
}
function applicability(value: {
  minimumOsVersion?: string | null
  minimumBuild?: number | null
  editions: readonly string[]
  enrollments: readonly string[]
  tools: Readonly<Record<string, string>>
  capabilities: readonly string[]
}): Applicability {
  return {
    minimumOsVersion: value.minimumOsVersion ?? null,
    minimumBuild: value.minimumBuild ?? null,
    editions: [...value.editions],
    enrollments: [...value.enrollments],
    tools: { ...value.tools },
    capabilities: [...value.capabilities],
  }
}
function physical(value: NativeQueryDefinition): PhysicalRead {
  return value.kind === 'windows_wmi'
    ? { ...value, filter: value.filter ?? null }
    : structuredClone(value)
}
function declaration(value: unknown): MappingDeclaration {
  if (!validateDeclaration(value)) throw new Error('Invalid collection declaration')
  if (
    value.kind !== 'native_collection' &&
    value.kind !== 'agent_collection' &&
    value.kind !== 'script'
  )
    throw new Error('Resource is not a collection mapping source')
  const artifact = {
    reference: resourceId(value.artifact.reference),
    length: count(value.artifact.length),
    sha256: digest(value.artifact.sha256),
  }
  if (value.kind === 'native_collection')
    return {
      kind: value.kind,
      artifact,
      definition: {
        ...value.definition,
        applicability: applicability(value.definition.applicability),
        mappings: structuredClone(value.definition.mappings),
      },
    }
  if (value.kind === 'agent_collection')
    return {
      kind: value.kind,
      artifact,
      definition: {
        applicability: applicability(value.definition.applicability),
        mappings: structuredClone(value.definition.mappings),
        plan: {
          ...value.definition.plan,
          queries: Object.fromEntries(
            Object.entries(value.definition.plan.queries).map(([key, query]) => [
              key,
              { ...query, definition: physical(query.definition) },
            ]),
          ),
        },
      },
    }
  const purpose = value.definition.purpose
  return {
    kind: value.kind,
    artifact,
    definition: {
      ...value.definition,
      sql: value.definition.sql ?? null,
      parameters: boundedObject(value.definition.parameters),
      output: boundedObject(value.definition.output),
      bindings: structuredClone(value.definition.bindings),
      purpose:
        purpose.kind === 'action'
          ? { kind: 'action' }
          : {
              ...purpose,
              applicability: applicability(purpose.applicability),
              mappings: structuredClone(purpose.mappings),
            },
    },
  }
}
function resource(value: unknown, id: string): MappingResource {
  if (!validateResourceResponse(value) || !('versions' in value) || value.id !== id)
    throw new Error('Wrong mapping resource')
  const kind = enumeration(value.kind, ['script', 'native_collection', 'agent_collection'] as const)
  return {
    id,
    kind,
    revision: count(value.revision),
    presentation: boundedObject(value.presentation),
    versions: value.versions.map((version) => ({
      id: resourceId(version.id),
      state: enumeration(version.state, ['frozen', 'active', 'deprecated', 'archived'] as const),
      digest: digest(version.digest),
      variants: version.variants.map((variant): MappingVariant => {
        const result = declaration(variant.declaration)
        if (result.kind !== kind) throw new Error('Wrong version declaration kind')
        return {
          key: resourceId(variant.key),
          platform: variant.platform,
          architecture: variant.architecture,
          declaration: result,
        }
      }),
    })),
  }
}
function unchangedPhysical(base: MappingDeclaration, next: MappingDeclaration): boolean {
  if (base.kind !== next.kind || !sameDocument(base.artifact, next.artifact)) return false
  function withoutMappings(declaration: MappingDeclaration): unknown {
    if (declaration.kind !== 'script') return { ...declaration.definition, mappings: {} }
    const purpose = declaration.definition.purpose
    return {
      ...declaration.definition,
      purpose: purpose.kind === 'collection' ? { ...purpose, mappings: {} } : purpose,
    }
  }
  return sameDocument(withoutMappings(base), withoutMappings(next))
}
const directoryFields = {
  id: text,
  revision: count,
  kind: (value: unknown) =>
    enumeration(value, ['script', 'native_collection', 'agent_collection'] as const),
  activeVersion: (value: unknown) => nullable(value, text),
  presentation: boundedObject,
}
/** Fixed version/content operations only. No activation, catalog authority or background replay. */
export function createMappingVersionsAdapter(transport: HttpTransport): MappingVersionsPort {
  const read = (id: string) =>
    api.getApiV1ResourcesById(transport, { pathParams: { id: resourceId(id) } }, (value) =>
      resource(value, id),
    )
  async function target(upload: PreparedUpload) {
    const source = await read(upload.target.resource),
      version = source.versions.find((version) => version.id === upload.target.version),
      variant = version?.variants.find(
        (variant) =>
          variant.key === upload.target.variant &&
          variant.platform === upload.target.platform &&
          variant.architecture === upload.target.architecture,
      )
    if (!version || !variant || !sameDocument(variant.declaration.artifact, upload.target.artifact))
      throw new Error('Original upload target is unavailable')
    return version.digest
  }
  function session(
    value: unknown,
    upload: PreparedUpload,
    expectedDigest: readonly number[],
  ): UploadSession {
    if (!schema.getApiV1ResourcesByIdUploadsByUploadResponse.validateRoot(value))
      throw new Error('Invalid upload session')
    const binding = value.binding,
      purpose = binding.purpose
    if (purpose.kind !== 'resource') throw new Error('Wrong upload purpose')
    const selected = purpose.binding
    if (
      count(value.offset) > upload.bytes.byteLength ||
      value.id !== upload.id ||
      selected.resource !== upload.target.resource ||
      selected.version !== upload.target.version ||
      selected.variant !== upload.target.variant ||
      selected.platform !== upload.target.platform ||
      selected.architecture !== upload.target.architecture ||
      binding.reference !== upload.target.artifact.reference ||
      binding.length !== upload.target.artifact.length ||
      !sameDigest(binding.sha256, upload.target.artifact.sha256) ||
      !sameDigest(selected.resource_digest, expectedDigest)
    )
      throw new Error('Wrong upload binding')
    return {
      id: uuid(value.id),
      target: upload.target,
      resourceDigest: digest(selected.resource_digest),
      actor: text(binding.actor),
      storageClass: selected.storage_class,
      offset: count(value.offset),
      expires: count(value.expires),
      complete: boolean(value.complete),
    }
  }
  return {
    resources: (query = {}) => {
      if (query.fields && !query.fields.includes('id'))
        throw new Error('Resource identity required')
      return api.getApiV1Resources(
        transport,
        {
          query: queryParameters({
            limit: 20,
            ...query,
            filter: allOf('kind=in=(script,native_collection,agent_collection)', query.filter),
          }),
        },
        (value) =>
          projectedPage(value, directoryFields, query.fields, ['id']) as {
            items: MappingResourceRow[]
            nextCursor: string | null
          },
      )
    },
    resource: read,
    prepare: async (draft) => {
      const source = await read(draft.resource),
        base = source.versions.find((version) => version.id === draft.baseVersion)
      if (source.revision !== draft.expectedRevision)
        throw { status: 409, code: 'configuration_changed' }
      if (
        !base ||
        source.kind !== draft.kind ||
        base.variants.length !== draft.variants.length ||
        source.versions.some((version) => version.id === draft.version)
      )
        throw { cause: 'client', code: 'invalid_input' }
      const originals = new Map(base.variants.map((variant) => [variantKey(variant), variant]))
      const staged: { candidate: MappingVariant; bytes: ArrayBuffer; sha256: readonly number[] }[] =
        []
      for (const candidate of draft.variants) {
        const original = originals.get(variantKey(candidate))
        if (!original || !unchangedPhysical(original.declaration, candidate.declaration))
          throw { cause: 'client', code: 'physical_plan_changed' }
        const bytes =
          candidate.declaration.kind === 'script'
            ? (
                await api.getApiV1ResourcesByIdVersionsByVersionScript(
                  transport,
                  {
                    pathParams: { id: draft.resource, version: draft.baseVersion },
                    query: {
                      platform: candidate.platform,
                      architecture: candidate.architecture,
                      variant: candidate.key,
                    },
                  },
                  (value) =>
                    attachment(value, 'application/octet-stream', 'script.txt', 32 * 1024 * 1024),
                )
              ).bytes
            : encodeCollectionContent(candidate.declaration)
        const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        if (
          candidate.declaration.kind === 'script' &&
          (bytes.byteLength !== original.declaration.artifact.length ||
            !sameDigest(sha256, original.declaration.artifact.sha256))
        )
          throw new Error('Original script bytes do not match their declaration')
        staged.push({ candidate, bytes, sha256 })
      }
      const variants: MappingVariant[] = [],
        uploads: PreparedUpload[] = [],
        reserved = new Set(staged.map((item) => item.candidate.declaration.artifact.reference)),
        assigned = new Map<string, string>()
      let nextReference = 0
      for (const item of staged) {
        const original = item.candidate.declaration.artifact,
          peers = staged.filter(
            (peer) => peer.candidate.declaration.artifact.reference === original.reference,
          ),
          retained = peers.find((peer) => sameDigest(peer.sha256, original.sha256)) ?? peers[0]!,
          key = JSON.stringify([original.reference, item.sha256])
        let reference = assigned.get(key)
        if (reference === undefined) {
          if (sameDigest(item.sha256, retained.sha256)) reference = original.reference
          else {
            do {
              reference = `mapping/${draft.operationId}/${++nextReference}.json`
            } while (reserved.has(reference))
            reserved.add(reference)
          }
          assigned.set(key, reference)
        }
        const artifact = { reference, length: item.bytes.byteLength, sha256: item.sha256 },
          changed = { ...item.candidate, declaration: { ...item.candidate.declaration, artifact } }
        variants.push(changed)
        const prior = uploads.find((upload) => sameDocument(upload.target.artifact, artifact))
        if (prior) new Uint8Array(item.bytes).fill(0)
        else
          uploads.push({
            id: crypto.randomUUID(),
            target: {
              resource: draft.resource,
              version: draft.version,
              variant: item.candidate.key,
              platform: item.candidate.platform,
              architecture: item.candidate.architecture,
              artifact,
            },
            bytes: item.bytes,
          })
      }
      return {
        resource: draft.resource,
        change: {
          operationId: draft.operationId,
          expectedRevision: draft.expectedRevision,
          input: { action: 'version', version: draft.version, kind: draft.kind, variants },
        },
        uploads,
      }
    },
    restore: async (id, uploadId, scriptSource) => {
      const observed = await api.getApiV1ResourcesByIdUploadsByUpload(transport, {
          pathParams: { id: resourceId(id), upload: uuid(uploadId) },
        }),
        purpose = observed.binding.purpose
      if (
        purpose.kind !== 'resource' ||
        observed.id !== uploadId ||
        purpose.binding.resource !== id
      )
        throw new Error('Wrong original upload')
      const selected = purpose.binding,
        source = await read(id),
        version = source.versions.find((version) => version.id === selected.version),
        variant = version?.variants.find(
          (variant) =>
            variant.key === selected.variant &&
            variant.platform === selected.platform &&
            variant.architecture === selected.architecture,
        )
      if (!version || !variant) throw new Error('Original fixed version is unavailable')
      let bytes: ArrayBuffer
      if (variant.declaration.kind !== 'script')
        bytes = encodeCollectionContent(variant.declaration)
      else if (scriptSource && 'bytes' in scriptSource) bytes = scriptSource.bytes.slice(0)
      else {
        const from =
          scriptSource && 'version' in scriptSource
            ? resourceId(scriptSource.version)
            : observed.complete
              ? version.id
              : null
        if (from === null) throw { cause: 'client', code: 'script_source_required' }
        const original = source.versions
          .find((version) => version.id === from)
          ?.variants.find((candidate) => variantKey(candidate) === variantKey(variant))
        if (
          !original ||
          original.declaration.kind !== 'script' ||
          original.declaration.artifact.length !== variant.declaration.artifact.length ||
          !sameDigest(original.declaration.artifact.sha256, variant.declaration.artifact.sha256)
        )
          throw { cause: 'client', code: 'input_changed' }
        bytes = (
          await api.getApiV1ResourcesByIdVersionsByVersionScript(
            transport,
            {
              pathParams: { id, version: from },
              query: {
                platform: variant.platform,
                architecture: variant.architecture,
                variant: variant.key,
              },
            },
            (value) =>
              attachment(value, 'application/octet-stream', 'script.txt', 32 * 1024 * 1024),
          )
        ).bytes
      }
      const prepared: PreparedUpload = {
        id: uploadId,
        target: {
          resource: id,
          version: version.id,
          variant: variant.key,
          platform: variant.platform,
          architecture: variant.architecture,
          artifact: variant.declaration.artifact,
        },
        bytes,
      }
      if (
        bytes.byteLength !== prepared.target.artifact.length ||
        !sameDigest(
          [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))],
          prepared.target.artifact.sha256,
        )
      ) {
        new Uint8Array(bytes).fill(0)
        throw { cause: 'client', code: 'input_changed' }
      }
      session(observed, prepared, version.digest)
      return prepared
    },
    declare: (prepared) =>
      api.postApiV1ResourcesById(
        transport,
        {
          pathParams: { id: prepared.resource },
          body: requestInput(prepared.change, schema.postApiV1ResourcesByIdBody.validateRoot),
        },
        (value) => {
          if (
            !('request' in value) ||
            value.request !== prepared.change.operationId ||
            value.resource !== prepared.resource ||
            value.storageRevision !== prepared.change.expectedRevision + 1
          )
            throw new Error('Wrong fixed version declaration receipt')
          return {
            request: value.request,
            resource: value.resource,
            storageRevision: count(value.storageRevision),
          }
        },
      ),
    begin: async (upload) => {
      const expected = await target(upload)
      return api.postApiV1ResourcesByIdUploadsByUpload(
        transport,
        {
          pathParams: { id: upload.target.resource, upload: upload.id },
          query: {
            version: upload.target.version,
            variant: upload.target.variant,
            platform: upload.target.platform,
            architecture: upload.target.architecture,
            artifact: upload.target.artifact.reference,
          },
        },
        (value) => session(value, upload, expected),
      )
    },
    upload: async (upload) => {
      const expected = await target(upload)
      return api.getApiV1ResourcesByIdUploadsByUpload(
        transport,
        { pathParams: { id: upload.target.resource, upload: upload.id } },
        (value) => session(value, upload, expected),
      )
    },
    append: async (upload, offset) => {
      if (
        !sameDigest(
          [...new Uint8Array(await crypto.subtle.digest('SHA-256', upload.bytes))],
          upload.target.artifact.sha256,
        )
      )
        throw { cause: 'client', code: 'input_changed' }
      const expected = await target(upload)
      return api.patchApiV1ResourcesByIdUploadsByUpload(
        transport,
        {
          pathParams: { id: upload.target.resource, upload: upload.id },
          query: { offset },
          body: upload.bytes.slice(offset, Math.min(offset + 1024 * 1024, upload.bytes.byteLength)),
        },
        (value) => session(value, upload, expected),
      )
    },
    complete: (upload) =>
      api.postApiV1ResourcesByIdUploadsByUploadComplete(transport, {
        pathParams: { id: upload.target.resource, upload: upload.id },
      }),
    receipt: (upload) =>
      api.getApiV1ResourcesByIdContentOperationsByOperation(
        transport,
        { pathParams: { id: upload.target.resource, operation: upload.id } },
        (value) => ({ ...value, sha256: digest(value.sha256), length: count(value.length) }),
      ),
  }
}
