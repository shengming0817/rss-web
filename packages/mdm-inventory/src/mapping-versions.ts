import { fieldKey, freeze, revision, uuid } from './authoring'
import { validateMapping } from './mapping'
import type {
  MappingDeclaration,
  MappingResourceRow,
  MappingDraft,
  MappingVariant,
  MappingVersionsPort,
  PreparedMapping,
  PreparedUpload,
  UploadSession,
} from './collection'
import type { DirectoryQuery } from '@rss/mdm-devices'

export function resourceId(value: string): string {
  if (
    !value ||
    value.length > 128 ||
    !/^[A-Za-z0-9._/-]+$/.test(value) ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error('Invalid resource identity')
  return value
}
export function variantKey(
  value: Pick<MappingVariant, 'key' | 'platform' | 'architecture'>,
): string {
  return JSON.stringify([value.platform, value.architecture, value.key])
}
export function validateDeclaration(value: MappingDeclaration): void {
  resourceId(value.artifact.reference)
  if (
    !Number.isSafeInteger(value.artifact.length) ||
    value.artifact.length < 1 ||
    value.artifact.sha256.length !== 32 ||
    value.artifact.sha256.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
  )
    throw new Error('Invalid mapping artifact')
  const mappings =
    value.kind === 'script'
      ? value.definition.purpose.kind === 'collection'
        ? value.definition.purpose.mappings
        : {}
      : value.definition.mappings
  for (const [key, binding] of Object.entries(mappings)) {
    fieldKey(key)
    validateMapping('mapping' in binding ? binding.mapping : binding)
  }
  if (value.kind === 'agent_collection')
    for (const binding of Object.values(value.definition.mappings)) {
      if (!Object.hasOwn(value.definition.plan.queries, binding.query))
        throw new Error('Mapping references an absent physical query')
    }
}
/** Native declarations share their platform definition; each artifact reference remains its own. */
export function replaceDeclaration(
  variants: readonly MappingVariant[],
  selected: Pick<MappingVariant, 'key' | 'platform' | 'architecture'>,
  declaration: MappingDeclaration,
): readonly MappingVariant[] {
  const source = variants.find((variant) => variantKey(variant) === variantKey(selected))
  if (!source || source.declaration.kind !== declaration.kind)
    throw new Error('Wrong mapping selection')
  return freeze(
    variants.map((variant): MappingVariant => {
      if (
        declaration.kind === 'native_collection' &&
        variant.declaration.kind === 'native_collection' &&
        variant.platform === selected.platform
      )
        return {
          ...variant,
          declaration: { ...variant.declaration, definition: declaration.definition },
        }
      if (variantKey(variant) !== variantKey(selected)) return variant
      if (
        declaration.kind === 'agent_collection' &&
        variant.declaration.kind === 'agent_collection'
      )
        return {
          ...variant,
          declaration: { ...variant.declaration, definition: declaration.definition },
        }
      if (declaration.kind === 'script' && variant.declaration.kind === 'script')
        return {
          ...variant,
          declaration: { ...variant.declaration, definition: declaration.definition },
        }
      return variant
    }),
  )
}
export function validateDraft(value: MappingDraft): void {
  resourceId(value.resource)
  resourceId(value.baseVersion)
  resourceId(value.version)
  uuid(value.operationId)
  revision(value.expectedRevision)
  if (
    value.version === value.baseVersion ||
    !value.variants.length ||
    value.variants.length > 64 ||
    new Set(value.variants.map(variantKey)).size !== value.variants.length ||
    new TextEncoder().encode(JSON.stringify(value)).byteLength > 8 * 1024 * 1024
  )
    throw new Error('Invalid fixed version selection')
  for (const variant of value.variants) {
    resourceId(variant.key)
    if (variant.declaration.kind !== value.kind) throw new Error('Mixed mapping version kinds')
    validateDeclaration(variant.declaration)
  }
}
function uploadIntent(value: PreparedUpload): void {
  uuid(value.id)
  resourceId(value.target.resource)
  resourceId(value.target.version)
  resourceId(value.target.variant)
  if (value.bytes.byteLength !== value.target.artifact.length)
    throw new Error('Wrong upload byte length')
}
function sameArtifact(
  a: PreparedUpload['target']['artifact'],
  b: PreparedUpload['target']['artifact'],
): boolean {
  return (
    a.reference === b.reference &&
    a.length === b.length &&
    a.sha256.length === b.sha256.length &&
    a.sha256.every((byte, index) => byte === b.sha256[index])
  )
}
function session(upload: PreparedUpload, value: UploadSession): UploadSession {
  if (
    value.id !== upload.id ||
    value.target.resource !== upload.target.resource ||
    value.target.version !== upload.target.version ||
    value.target.variant !== upload.target.variant ||
    value.target.platform !== upload.target.platform ||
    value.target.architecture !== upload.target.architecture ||
    !sameArtifact(value.target.artifact, upload.target.artifact) ||
    value.offset < 0 ||
    value.offset > upload.bytes.byteLength
  )
    throw new Error('Wrong original upload session')
  return value
}
function prepared(value: PreparedMapping): void {
  resourceId(value.resource)
  uuid(value.change.operationId)
  revision(value.change.expectedRevision)
  resourceId(value.change.input.version)
  if (!value.change.input.variants.length || value.change.input.variants.length > 64)
    throw new Error('Invalid prepared version')
  if (
    !value.uploads.length ||
    new Set(value.uploads.map((upload) => upload.id)).size !== value.uploads.length
  )
    throw new Error('Invalid prepared uploads')
  for (const variant of value.change.input.variants) {
    if (
      variant.declaration.kind !== value.change.input.kind ||
      !value.uploads.some((upload) =>
        sameArtifact(upload.target.artifact, variant.declaration.artifact),
      )
    )
      throw new Error('Missing fixed version artifact')
    validateDeclaration(variant.declaration)
  }
  for (const upload of value.uploads) {
    uploadIntent(upload)
    const target = value.change.input.variants.find(
      (variant) =>
        variant.key === upload.target.variant &&
        variant.platform === upload.target.platform &&
        variant.architecture === upload.target.architecture,
    )
    if (
      upload.target.resource !== value.resource ||
      upload.target.version !== value.change.input.version ||
      !target ||
      !sameArtifact(target.declaration.artifact, upload.target.artifact)
    )
      throw new Error('Upload is not part of the frozen version')
  }
}
/** Preparing bytes is separate from declaring a version and advancing its original upload sessions. */
export function createMappings(port: MappingVersionsPort) {
  return Object.freeze({
    resources: (query: DirectoryQuery<keyof MappingResourceRow> = {}) => port.resources(query),
    async resource(id: string) {
      const result = await port.resource(resourceId(id))
      if (result.id !== id) throw new Error('Wrong mapping resource')
      return result
    },
    async prepare(draft: MappingDraft) {
      validateDraft(draft)
      const result = await port.prepare(freeze(draft))
      try {
        if (
          result.resource !== draft.resource ||
          result.change.operationId !== draft.operationId ||
          result.change.expectedRevision !== draft.expectedRevision ||
          result.change.input.version !== draft.version ||
          result.change.input.kind !== draft.kind ||
          result.change.input.variants.length !== draft.variants.length
        )
          throw new Error('Wrong prepared mapping intent')
        prepared(result)
        return freeze(result)
      } finally {
        // freeze owns a copy; erase the port's temporary material before relinquishing it.
        for (const upload of result.uploads) new Uint8Array(upload.bytes).fill(0)
      }
    },
    async declare(value: PreparedMapping) {
      prepared(value)
      const result = await port.declare(value)
      if (
        result.request !== value.change.operationId ||
        result.resource !== value.resource ||
        result.storageRevision !== value.change.expectedRevision + 1
      )
        throw new Error('Wrong fixed version receipt')
      return result
    },
    async restore(
      resource: string,
      upload: string,
      scriptSource?: { readonly version: string } | { readonly bytes: ArrayBuffer },
    ) {
      resourceId(resource)
      uuid(upload)
      if (scriptSource && 'version' in scriptSource) resourceId(scriptSource.version)
      const result = await port.restore(resource, upload, scriptSource)
      try {
        uploadIntent(result)
        if (result.id !== upload || result.target.resource !== resource)
          throw new Error('Wrong restored upload')
        return freeze(result)
      } finally {
        new Uint8Array(result.bytes).fill(0)
      }
    },
    async begin(upload: PreparedUpload) {
      uploadIntent(upload)
      return session(upload, await port.begin(upload))
    },
    async upload(upload: PreparedUpload) {
      uploadIntent(upload)
      return session(upload, await port.upload(upload))
    },
    async append(upload: PreparedUpload, offset: number) {
      uploadIntent(upload)
      if (!Number.isSafeInteger(offset) || offset < 0 || offset >= upload.bytes.byteLength)
        throw new Error('Invalid original upload offset')
      return session(upload, await port.append(upload, offset))
    },
    async complete(upload: PreparedUpload) {
      uploadIntent(upload)
      await port.complete(upload)
    },
    async receipt(upload: PreparedUpload) {
      uploadIntent(upload)
      const value = await port.receipt(upload)
      if (
        value.operationId !== upload.id ||
        value.resource !== upload.target.resource ||
        value.version !== upload.target.version ||
        !value.committed ||
        !sameArtifact(value, upload.target.artifact)
      )
        throw new Error('Wrong original content receipt')
      return value
    },
  })
}
