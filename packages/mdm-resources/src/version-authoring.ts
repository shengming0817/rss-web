import { freeze, operation, revision, uuid } from '@rss/mdm-inventory'
import type { PreparedResourceVersion, ResourceVersionDraft } from './model'
import {
  declarationMaterials,
  resourceId,
  sameArtifact,
  sameDefinition,
  validateVariants,
  variantKey,
} from './authoring'

export function validateVersionDraft(draft: ResourceVersionDraft): void {
  resourceId(draft.resource)
  resourceId(draft.version)
  uuid(draft.operationId)
  revision(draft.expectedRevision)
  validateVariants(draft.kind, draft.variants)
  const seen = new Set<string>()
  for (const content of draft.contents) {
    const key = variantKey({
        key: content.variant,
        platform: content.platform,
        architecture: content.architecture,
      }),
      variant = draft.variants.find((variant) => variantKey(variant) === key)
    if (
      seen.has(key) ||
      !variant ||
      !['script', 'configuration'].includes(variant.declaration.kind) ||
      !(content.bytes instanceof ArrayBuffer) ||
      content.bytes.byteLength < 1 ||
      content.bytes.byteLength > 16 * 1024 * 1024
    )
      throw new Error('Wrong bounded authored content')
    seen.add(key)
  }
}
export function validatePreparedVersion(value: PreparedResourceVersion): void {
  resourceId(value.resource)
  operation(value.change)
  resourceId(value.change.input.version)
  validateVariants(value.change.input.kind, value.change.input.variants)
  for (const variant of value.change.input.variants) {
    if (
      ['native_collection', 'agent_collection', 'telemetry_profile'].includes(
        variant.declaration.kind,
      ) &&
      !value.materials.some((material) =>
        sameArtifact(material.target.artifact, declarationMaterials(variant.declaration)[0]!),
      )
    )
      throw new Error('Missing fixed version material')
  }
  for (const material of value.materials) {
    const selected = value.change.input.variants.find(
      (variant) =>
        variantKey(variant) ===
        variantKey({
          key: material.target.variant,
          platform: material.target.platform,
          architecture: material.target.architecture,
        }),
    )
    if (
      material.target.resource !== value.resource ||
      material.target.version !== value.change.input.version ||
      !selected ||
      !declarationMaterials(selected.declaration).some((artifact) =>
        sameArtifact(artifact, material.target.artifact),
      ) ||
      material.bytes.byteLength !== material.target.artifact.length
    )
      throw new Error('Material is outside the fixed version intent')
  }
}
export function preparedVersion<P extends PreparedResourceVersion>(
  draft: ResourceVersionDraft,
  result: P,
): P {
  try {
    if (
      result.resource !== draft.resource ||
      result.change.operationId !== draft.operationId ||
      result.change.expectedRevision !== draft.expectedRevision ||
      result.change.input.kind !== draft.kind ||
      result.change.input.version !== draft.version ||
      result.change.input.variants.length !== draft.variants.length
    )
      throw new Error('Wrong prepared resource version')
    for (const original of draft.variants) {
      const next = result.change.input.variants.find(
        (variant) => variantKey(variant) === variantKey(original),
      )
      if (!next) throw new Error('Missing authored variant')
      if (
        (original.declaration.kind === 'script' || original.declaration.kind === 'configuration') &&
        !draft.contents.some(
          (content) =>
            variantKey({
              key: content.variant,
              platform: content.platform,
              architecture: content.architecture,
            }) === variantKey(original),
        ) &&
        !sameArtifact(
          declarationMaterials(original.declaration)[0]!,
          declarationMaterials(next.declaration)[0]!,
        )
      )
        throw new Error('Unedited source material changed')
      if (
        draft.contents.some(
          (content) =>
            variantKey({
              key: content.variant,
              platform: content.platform,
              architecture: content.architecture,
            }) === variantKey(original),
        ) &&
        !result.materials.some((material) =>
          sameArtifact(material.target.artifact, declarationMaterials(next.declaration)[0]!),
        )
      )
        throw new Error('Missing authored source material')

      const definition = (value: typeof original.declaration) =>
        value.kind === 'configuration'
          ? { kind: value.kind }
          : { kind: value.kind, definition: value.definition }
      if (!sameDefinition(definition(original.declaration), definition(next.declaration)))
        throw new Error('Prepared version changed its authored definition')
    }
    validatePreparedVersion(result)
    return freeze(result)
  } finally {
    for (const material of result.materials) new Uint8Array(material.bytes).fill(0)
  }
}
