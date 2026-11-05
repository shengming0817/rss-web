import { freeze, revision, uuid, type Operation } from '@rss/mdm-inventory'
import type { DirectoryQuery, Page } from '@rss/mdm-devices'
import type {
  Declaration,
  MaterialTarget,
  PreparedMaterial,
  Resource,
  ResourceReceipt,
  ResourceRow,
  ResourceVersion,
  Variant,
} from './model'
import { resourceId, sameArtifact, sameDefinition, validateVariants } from './authoring'
import { preparedVersion, validatePreparedVersion } from './version-authoring'

export type MappingKind = 'script' | 'native_collection' | 'agent_collection'
export type MappingDeclaration = Extract<Declaration, { readonly kind: MappingKind }>
export interface MappingVariant extends Omit<Variant, 'declaration'> {
  readonly declaration: MappingDeclaration
}
export interface MappingVersion extends Omit<ResourceVersion, 'variants'> {
  readonly variants: readonly MappingVariant[]
}
/** A complete Resource narrowed to families whose field extraction mappings can be edited. */
export interface MappingResource extends Omit<Resource, 'kind' | 'versions'> {
  readonly kind: MappingKind
  readonly versions: readonly MappingVersion[]
}
export interface MappingDraft {
  readonly resource: string
  readonly baseVersion: string
  readonly operationId: string
  readonly expectedRevision: number
  readonly version: string
  readonly kind: MappingKind
  readonly variants: readonly MappingVariant[]
}
export interface PreparedMapping {
  readonly resource: string
  readonly change: Operation<{
    readonly action: 'version'
    readonly version: string
    readonly kind: MappingKind
    readonly variants: readonly MappingVariant[]
  }>
  readonly materials: readonly PreparedMaterial[]
}
export interface MappingPort {
  resources(query: DirectoryQuery<keyof ResourceRow>): Promise<Page<ResourceRow>>
  resource(id: string): Promise<MappingResource>
  prepare(draft: MappingDraft): Promise<PreparedMapping>
  declare(resource: string, change: PreparedMapping['change']): Promise<ResourceReceipt>
  /** Rebuild bytes for an already observed exact target, without reading or creating upload sessions. */
  restore(
    target: MaterialTarget,
    scriptSource?: { readonly version: string } | { readonly bytes: ArrayBuffer },
    signal?: AbortSignal,
  ): Promise<PreparedMaterial>
}
export function validateDraft(value: MappingDraft): void {
  resourceId(value.resource)
  resourceId(value.baseVersion)
  resourceId(value.version)
  uuid(value.operationId)
  revision(value.expectedRevision)
  if (
    value.version === value.baseVersion ||
    !['script', 'native_collection', 'agent_collection'].includes(value.kind)
  )
    throw new Error('Invalid mapping version selection')
  validateVariants(value.kind, value.variants)
}
function prepared(value: PreparedMapping): void {
  validatePreparedVersion(value)
  for (const variant of value.change.input.variants)
    if (
      !value.materials.some((material) =>
        sameArtifact(material.target.artifact, variant.declaration.artifact),
      )
    )
      throw new Error('Missing fixed mapping material')
}
/** Mapping material authoring only. The application separately composes the content owner. */
export function createMappings(port: MappingPort) {
  return Object.freeze({
    resources: (query: DirectoryQuery<keyof ResourceRow> = {}) => port.resources(query),
    async resource(id: string) {
      const value = await port.resource(resourceId(id))
      if (value.id !== id) throw new Error('Wrong mapping resource')
      return value
    },
    async prepare(draft: MappingDraft) {
      validateDraft(draft)
      const original = freeze(draft),
        value = await port.prepare(original)
      try {
        prepared(value)
        return preparedVersion({ ...original, contents: [] }, value)
      } finally {
        for (const material of value.materials) new Uint8Array(material.bytes).fill(0)
      }
    },
    async declare(value: PreparedMapping) {
      prepared(value)
      const resource = value.resource,
        original = freeze(value.change),
        receipt = await port.declare(resource, original)
      if (
        receipt.resource !== resource ||
        receipt.request !== original.operationId ||
        receipt.storageRevision !== original.expectedRevision + 1
      )
        throw new Error('Wrong fixed version receipt')
      return receipt
    },
    async restore(
      target: MaterialTarget,
      scriptSource?: { readonly version: string } | { readonly bytes: ArrayBuffer },
      signal?: AbortSignal,
    ) {
      resourceId(target.resource)
      resourceId(target.version)
      resourceId(target.variant)
      if (scriptSource && 'version' in scriptSource) resourceId(scriptSource.version)
      if (
        scriptSource &&
        'bytes' in scriptSource &&
        (!(scriptSource.bytes instanceof ArrayBuffer) ||
          scriptSource.bytes.byteLength !== target.artifact.length ||
          scriptSource.bytes.byteLength > 16 * 1024 * 1024)
      )
        throw new Error('Invalid bounded script source')
      const original = freeze(target),
        source = scriptSource ? freeze(scriptSource) : undefined
      let material: PreparedMaterial | undefined
      try {
        if (signal?.aborted) throw new Error('Mapping restoration cancelled')
        material = await port.restore(original, source, signal)
        if (signal?.aborted) throw new Error('Mapping restoration cancelled')
        if (
          !sameDefinition(material.target, original) ||
          material.bytes.byteLength !== original.artifact.length
        )
          throw new Error('Wrong restored material')
        return freeze(material)
      } finally {
        if (material) new Uint8Array(material.bytes).fill(0)
        if (source && 'bytes' in source) new Uint8Array(source.bytes).fill(0)
      }
    },
  })
}
