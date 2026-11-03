export type * from './model'
export type * from './software'
export type * from './collections'
export type * from './mapping'
export type * from './mappings'
export { createMappings, validateDraft } from './mappings'
export { resourceKinds } from './model'
export { validateMapping } from './mapping'
export {
  boundedDocument,
  declarationMaterials,
  digest,
  positive,
  primaryArtifact,
  resourceId,
  replaceDeclaration,
  sameArtifact,
  sameDefinition,
  validateArtifact,
  validateChange,
  validateDeclaration,
  validatePresentation,
  validateVariants,
  variantKey,
} from './authoring'

import { freeze, operation, revision, type Operation } from '@rss/mdm-inventory'
import type { DirectoryQuery, WindowQuery } from '@rss/mdm-devices'
import type {
  MaterialTarget,
  Resource,
  ResourceChange,
  ResourceKind,
  PreparedMaterial,
  ResourceRow,
  ResourceVersionDraft,
  ResourcesPort,
} from './model'
import {
  declarationMaterials,
  digest,
  primaryArtifact,
  resourceId,
  sameDefinition,
  validateArtifact,
  validateChange,
  variantKey,
} from './authoring'

import { resourceKinds } from './model'
import { preparedVersion, validateVersionDraft } from './version-authoring'
export { validateVersionDraft } from './version-authoring'

/** Reads and explicit resource writes; no content, admission or device-effect authority. */
export function createResources(port: ResourcesPort) {
  return Object.freeze({
    references: (id: string, version: string, query: WindowQuery = {}) =>
      port.references(resourceId(id), resourceId(version), query),
    list: (query: DirectoryQuery<keyof ResourceRow> = {}, kind?: ResourceKind) => {
      if (kind !== undefined && !resourceKinds.includes(kind))
        throw new Error('Invalid resource kind filter')
      return port.list(query, kind)
    },
    async read(id: string) {
      const value = await port.read(resourceId(id))
      if (value.id !== id) throw new Error('Wrong resource detail')
      return value
    },
    blueprints: () => port.blueprints(),
    async reconstruct(target: MaterialTarget): Promise<PreparedMaterial> {
      resourceId(target.resource)
      resourceId(target.version)
      resourceId(target.variant)
      validateArtifact(target.artifact)
      const fixed = freeze(target),
        material = await port.reconstruct(fixed)
      try {
        if (
          !sameDefinition(material.target, fixed) ||
          material.bytes.byteLength !== fixed.artifact.length
        )
          throw new Error('Wrong reconstructed resource material')
        return freeze(material)
      } finally {
        new Uint8Array(material.bytes).fill(0)
      }
    },
    async prepareVersion(draft: ResourceVersionDraft) {
      validateVersionDraft(draft)
      const fixed = freeze(draft)
      try {
        return preparedVersion(fixed, await port.prepareVersion(fixed))
      } finally {
        for (const content of fixed.contents) new Uint8Array(content.bytes).fill(0)
      }
    },
    async change(id: string, change: Operation<ResourceChange>) {
      resourceId(id)
      operation(change)
      validateChange(change.input, change.expectedRevision)
      const original = freeze(change),
        result = await port.change(id, original)
      if (original.input.action === 'instantiate') {
        if (
          !('versions' in result) ||
          result.id !== id ||
          result.origin?.blueprint !== original.input.blueprint ||
          result.origin.version !== original.input.version
        )
          throw new Error('Wrong instantiated resource')
      } else if (
        !('request' in result) ||
        result.request !== original.operationId ||
        result.resource !== id ||
        revision(result.storageRevision) < original.expectedRevision
      )
        throw new Error('Wrong resource receipt')
      return result
    },
  })
}
export function materialTarget(
  resource: Resource,
  selection: {
    readonly version: string
    readonly variant: string
    readonly platform: MaterialTarget['platform']
    readonly architecture: MaterialTarget['architecture']
    readonly artifact?: string
  },
): MaterialTarget {
  const version = resource.versions.find((version) => version.id === selection.version)
  if (!version) throw new Error('Missing exact resource version')
  digest(version.digest)
  const variant = version.variants.find(
    (variant) =>
      variantKey(variant) ===
      variantKey({
        key: selection.variant,
        platform: selection.platform,
        architecture: selection.architecture,
      }),
  )
  if (!variant) throw new Error('Missing exact resource variant')
  const artifact =
    selection.artifact && variant.declaration.kind === 'software'
      ? declarationMaterials(variant.declaration).find(
          (artifact) => artifact.reference === selection.artifact,
        )
      : primaryArtifact(variant.declaration)
  if (!artifact || (selection.artifact !== undefined && selection.artifact !== artifact.reference))
    throw new Error('Missing exact material reference')
  return freeze({
    resource: resource.id,
    version: version.id,
    variant: variant.key,
    platform: variant.platform,
    architecture: variant.architecture,
    artifact: { reference: artifact.reference, length: artifact.length, sha256: artifact.sha256 },
  })
}
