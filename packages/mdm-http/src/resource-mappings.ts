import { allOf } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type { createContent } from '@rss/mdm-content'
import {
  materialTarget,
  resourceId,
  sameArtifact,
  sameDefinition,
  variantKey,
  type MappingDeclaration,
  type MappingPort,
  type MappingResource,
  type MappingVariant,
  type Resource,
} from '@rss/mdm-resources'
import { createResourcesAdapter } from './resources'
import { prepareVersionMaterials, reconstructResourceMaterial } from './resource-authoring'

function mappingResource(value: Resource): MappingResource {
  if (
    value.kind !== 'script' &&
    value.kind !== 'native_collection' &&
    value.kind !== 'agent_collection'
  )
    throw new Error('Resource is not a mapping source')
  return {
    ...value,
    kind: value.kind,
    versions: value.versions.map((version) => ({
      ...version,
      variants: version.variants.map((variant): MappingVariant => {
        const declaration = variant.declaration
        if (
          declaration.kind !== 'script' &&
          declaration.kind !== 'native_collection' &&
          declaration.kind !== 'agent_collection'
        )
          throw new Error('Wrong mapping source variant')
        return { ...variant, declaration }
      }),
    })),
  }
}
function unchangedPhysical(base: MappingDeclaration, next: MappingDeclaration): boolean {
  if (base.kind !== next.kind || !sameArtifact(base.artifact, next.artifact)) return false
  function withoutMappings(value: MappingDeclaration): unknown {
    if (value.kind !== 'script') return { ...value.definition, mappings: {} }
    const purpose = value.definition.purpose
    return {
      ...value.definition,
      purpose: purpose.kind === 'collection' ? { ...purpose, mappings: {} } : purpose,
    }
  }
  return sameDefinition(withoutMappings(base), withoutMappings(next))
}
const hash = async (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
const sameHash = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

/** Resource material authoring; all download/upload execution is delegated to the content owner. */
export function createResourceMappingsAdapter(
  transport: HttpTransport,
  content: Pick<ReturnType<typeof createContent>, 'downloadBytes'>,
): MappingPort {
  const resources = createResourcesAdapter(transport),
    read = async (id: string) => mappingResource(await resources.read(resourceId(id)))
  const script = (
    source: Resource,
    version: string,
    variant: MappingVariant,
    signal?: AbortSignal,
  ) =>
    content.downloadBytes(
      {
        kind: 'script',
        target: materialTarget(source, {
          version,
          variant: variant.key,
          platform: variant.platform,
          architecture: variant.architecture,
        }),
      },
      16 * 1024 * 1024,
      signal,
    )
  return {
    resources: (query) =>
      resources.list({
        ...query,
        filter: allOf('kind=in=(script,native_collection,agent_collection)', query.filter),
      }),
    resource: read,
    prepare: async (draft) => {
      const source = await read(draft.resource),
        base = source.versions.find((version) => version.id === draft.baseVersion)
      if (source.revision !== draft.expectedRevision)
        throw { cause: 'client', status: 409, code: 'configuration_changed' }
      if (
        !base ||
        source.kind !== draft.kind ||
        base.variants.length !== draft.variants.length ||
        source.versions.some((version) => version.id === draft.version)
      )
        throw { cause: 'client', code: 'invalid_input' }
      const originals = new Map(base.variants.map((variant) => [variantKey(variant), variant])),
        owned: ArrayBuffer[] = [],
        contents: {
          variant: string
          platform: MappingVariant['platform']
          architecture: MappingVariant['architecture']
          bytes: ArrayBuffer
        }[] = []
      try {
        for (const candidate of draft.variants) {
          const original = originals.get(variantKey(candidate))
          if (!original || !unchangedPhysical(original.declaration, candidate.declaration))
            throw { cause: 'client', code: 'physical_plan_changed' }
          if (candidate.declaration.kind === 'script') {
            const bytes = await script(source, draft.baseVersion, candidate)
            owned.push(bytes)
            if (
              bytes.byteLength !== original.declaration.artifact.length ||
              !sameHash(await hash(bytes), original.declaration.artifact.sha256)
            )
              throw new Error('Original script differs from its fixed declaration')
            contents.push({
              variant: candidate.key,
              platform: candidate.platform,
              architecture: candidate.architecture,
              bytes,
            })
          }
        }
        const prepared = await prepareVersionMaterials({ ...draft, contents })
        return {
          ...prepared,
          change: {
            ...prepared.change,
            input: {
              ...prepared.change.input,
              kind: draft.kind,
              variants: prepared.change.input.variants.map((variant): MappingVariant => {
                const declaration = variant.declaration
                if (
                  declaration.kind !== 'script' &&
                  declaration.kind !== 'native_collection' &&
                  declaration.kind !== 'agent_collection'
                )
                  throw new Error('Wrong mapping material kind')
                return { ...variant, declaration }
              }),
            },
          },
        }
      } finally {
        for (const bytes of owned) new Uint8Array(bytes).fill(0)
      }
    },
    restore: async (target, scriptSource, signal) => {
      const source = await read(target.resource),
        version = source.versions.find((version) => version.id === target.version),
        variant = version?.variants.find(
          (variant) =>
            variantKey(variant) ===
            variantKey({
              key: target.variant,
              platform: target.platform,
              architecture: target.architecture,
            }),
        )
      if (!version || !variant || !sameArtifact(variant.declaration.artifact, target.artifact))
        throw new Error('Original fixed material is unavailable')
      let bytes: ArrayBuffer
      if (variant.declaration.kind !== 'script') return reconstructResourceMaterial(source, target)
      if (scriptSource && 'bytes' in scriptSource) bytes = scriptSource.bytes.slice(0)
      else {
        const from =
            scriptSource && 'version' in scriptSource
              ? resourceId(scriptSource.version)
              : version.id,
          original = source.versions
            .find((version) => version.id === from)
            ?.variants.find((candidate) => variantKey(candidate) === variantKey(variant))
        if (
          !original ||
          original.declaration.kind !== 'script' ||
          original.declaration.artifact.length !== target.artifact.length ||
          !sameHash(original.declaration.artifact.sha256, target.artifact.sha256)
        )
          throw { cause: 'client', code: 'script_source_required' }
        bytes = await script(source, from, original, signal)
      }
      let delivered = false
      try {
        if (
          bytes.byteLength !== target.artifact.length ||
          !sameHash(await hash(bytes), target.artifact.sha256)
        )
          throw { cause: 'client', code: 'input_changed' }
        delivered = true
        return { target, bytes }
      } finally {
        if (!delivered) new Uint8Array(bytes).fill(0)
      }
    },
    declare: async (resource, change) => {
      const receipt = await resources.change(resource, change)
      if (!('request' in receipt)) throw new Error('Wrong version declaration receipt')
      return receipt
    },
  }
}
