import {
  declarationMaterials,
  sameArtifact,
  validateVariants,
  variantKey,
  type MaterialTarget,
  type Resource,
  type PreparedMaterial,
  type PreparedResourceVersion,
  type ResourceVersionDraft,
  type Variant,
} from '@rss/mdm-resources'
import { encodeCollectionContent } from './resource-content'

const sameHash = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

/** One canonical material preparation path for full authoring and mapping-only edits. No transfer or write. */
export async function prepareVersionMaterials(
  draft: ResourceVersionDraft,
): Promise<PreparedResourceVersion> {
  const owned: ArrayBuffer[] = []
  let delivered = false
  try {
    const staged: { variant: Variant; bytes: ArrayBuffer; sha256: readonly number[] }[] = []
    for (const variant of draft.variants) {
      const declaration = variant.declaration
      if (declaration.kind === 'software') continue
      let bytes: ArrayBuffer
      if (declaration.kind === 'script' || declaration.kind === 'configuration') {
        const supplied = draft.contents.find(
          (content) =>
            variantKey({
              key: content.variant,
              platform: content.platform,
              architecture: content.architecture,
            }) === variantKey(variant),
        )
        if (!supplied) continue
        if (!supplied.bytes.byteLength || supplied.bytes.byteLength > 16 * 1024 * 1024)
          throw new Error('Explicit bounded content required')
        bytes = supplied.bytes.slice(0)
      } else bytes = encodeCollectionContent(declaration)
      owned.push(bytes)
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      staged.push({ variant, bytes, sha256 })
    }
    const variants: Variant[] = [],
      materials: PreparedMaterial[] = [],
      reserved = new Set(
        draft.variants.flatMap((variant) =>
          declarationMaterials(variant.declaration).map((artifact) => artifact.reference),
        ),
      ),
      assigned = new Map<string, string>(),
      preserved = draft.variants.flatMap((variant) =>
        variant.declaration.kind !== 'software' &&
        !staged.some((item) => variantKey(item.variant) === variantKey(variant))
          ? [variant.declaration.artifact]
          : [],
      )
    let sequence = 0
    for (const variant of draft.variants) {
      if (variant.declaration.kind === 'software') {
        variants.push(variant)
        continue
      }
      const item = staged.find((item) => variantKey(item.variant) === variantKey(variant))
      if (!item) {
        variants.push(variant)
        continue
      }
      const original = variant.declaration.artifact,
        peers = staged.filter(
          (peer) =>
            peer.variant.declaration.kind !== 'software' &&
            peer.variant.declaration.artifact.reference === original.reference,
        ),
        retained = peers.find((peer) => sameHash(peer.sha256, original.sha256)) ?? peers[0]!,
        key = JSON.stringify([original.reference, item.sha256])
      let reference = assigned.get(key)
      if (reference === undefined) {
        if (
          sameHash(item.sha256, retained.sha256) &&
          preserved.every(
            (artifact) =>
              artifact.reference !== original.reference || sameHash(artifact.sha256, item.sha256),
          )
        )
          reference = original.reference
        else {
          do {
            reference = `content/${draft.operationId}/${++sequence}.json`
          } while (reserved.has(reference))
          reserved.add(reference)
        }
        assigned.set(key, reference)
      }
      const artifact = { reference, length: item.bytes.byteLength, sha256: item.sha256 }
      variants.push({ ...variant, declaration: { ...variant.declaration, artifact } })
      if (materials.some((material) => sameArtifact(material.target.artifact, artifact)))
        new Uint8Array(item.bytes).fill(0)
      else
        materials.push({
          target: {
            resource: draft.resource,
            version: draft.version,
            variant: variant.key,
            platform: variant.platform,
            architecture: variant.architecture,
            artifact,
          },
          bytes: item.bytes,
        })
    }
    validateVariants(draft.kind, variants)
    delivered = true
    return {
      resource: draft.resource,
      change: {
        operationId: draft.operationId,
        expectedRevision: draft.expectedRevision,
        input: { action: 'version', version: draft.version, kind: draft.kind, variants },
      },
      materials,
    }
  } finally {
    if (!delivered) for (const bytes of owned) new Uint8Array(bytes).fill(0)
  }
}

/** Recreate only structured canonical content; arbitrary original files remain with the content/File owner. */
export async function reconstructResourceMaterial(
  source: Resource,
  target: MaterialTarget,
): Promise<PreparedMaterial> {
  const variant = source.versions
    .find((version) => version.id === target.version)
    ?.variants.find(
      (variant) =>
        variantKey(variant) ===
        variantKey({
          key: target.variant,
          platform: target.platform,
          architecture: target.architecture,
        }),
    )
  if (
    source.id !== target.resource ||
    !variant ||
    !declarationMaterials(variant.declaration).some((artifact) =>
      sameArtifact(artifact, target.artifact),
    )
  )
    throw { cause: 'client', code: 'input_changed' }
  const declaration = variant.declaration
  if (
    declaration.kind !== 'native_collection' &&
    declaration.kind !== 'agent_collection' &&
    declaration.kind !== 'telemetry_profile'
  )
    throw { cause: 'client', code: 'material_source_required' }
  const bytes = encodeCollectionContent(declaration)
  let delivered = false
  try {
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    if (bytes.byteLength !== target.artifact.length || !sameHash(digest, target.artifact.sha256))
      throw { cause: 'client', code: 'input_changed' }
    delivered = true
    return { target, bytes }
  } finally {
    if (!delivered) new Uint8Array(bytes).fill(0)
  }
}
