import { fieldKey, identifier, revision } from '@rss/mdm-inventory'
import { validateMapping } from './mapping'
import {
  resourceKinds,
  type Artifact,
  type Declaration,
  type ResourceChange,
  type Variant,
} from './model'

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
export function digest(value: readonly number[]): void {
  if (
    value.length !== 32 ||
    value.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
  )
    throw new Error('Invalid artifact digest')
}
export function positive(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid positive value')
  return value
}
export function validateArtifact(value: Artifact): void {
  resourceId(value.reference)
  positive(value.length)
  digest(value.sha256)
}
export function sameArtifact(a: Artifact, b: Artifact): boolean {
  return (
    a.reference === b.reference &&
    a.length === b.length &&
    a.sha256.length === b.sha256.length &&
    a.sha256.every((value, index) => value === b.sha256[index])
  )
}
export function sameDefinition(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => sameDefinition(value, b[index]))
    )
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) => Object.hasOwn(b, key) && sameDefinition(Reflect.get(a, key), Reflect.get(b, key)),
    )
  )
}
export function boundedDocument(value: unknown, maximumBytes: number): void {
  let nodes = 0
  function visit(node: unknown, depth: number): void {
    if (++nodes > 65536 || depth > 32) throw new Error('Definition exceeds structural budget')
    if (typeof node === 'number' && !Number.isFinite(node))
      throw new Error('Invalid definition number')
    if (typeof node === 'string' && node.includes('\0')) throw new Error('Invalid definition text')
    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        if (key.includes('\0')) throw new Error('Invalid definition key')
        visit(child, depth + 1)
      }
    } else if (node !== null && !['string', 'number', 'boolean'].includes(typeof node))
      throw new Error('Invalid definition value')
  }
  visit(value, 0)
  if (new TextEncoder().encode(JSON.stringify(value)).length > maximumBytes)
    throw new Error('Definition exceeds byte budget')
}
export function validatePresentation(value: Readonly<Record<string, unknown>>): void {
  let nodes = 0
  function visit(node: unknown, depth: number): void {
    if (++nodes > 4096 || depth > 16) throw new Error('Presentation exceeds structural budget')
    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        identifier(key, 256)
        visit(child, depth + 1)
      }
    }
  }
  visit(value, 0)
  boundedDocument(value, 65536)
}
export function variantKey(value: Pick<Variant, 'key' | 'platform' | 'architecture'>): string {
  return JSON.stringify([value.platform, value.architecture, value.key])
}
export function primaryArtifact(value: Declaration): Artifact {
  if (value.kind !== 'software') return value.artifact
  const artifact = value.definition.artifacts[value.definition.material.installer]
  if (!artifact) throw new Error('Missing primary software material')
  return artifact
}
export function declarationMaterials(value: Declaration): readonly Artifact[] {
  if (value.kind !== 'software') return [value.artifact]
  const definition = value.definition,
    materials = [
      ...Object.values(definition.artifacts),
      ...(definition.provenance.kind === 'imported'
        ? definition.provenance.files.map((file) => file.content)
        : []),
      ...definition.signatures.flatMap((signature) =>
        signature.evidence ? [signature.evidence] : [],
      ),
    ],
    byReference = new Map<string, Artifact>()
  for (const material of materials) {
    const previous = byReference.get(material.reference)
    if (previous && !sameArtifact(previous, material))
      throw new Error('Conflicting immutable material reference')
    byReference.set(material.reference, material)
  }
  return [...byReference.values()]
}
export function validateDeclaration(value: Declaration): void {
  if (!resourceKinds.includes(value.kind)) throw new Error('Invalid resource kind')
  validateArtifact(primaryArtifact(value))
  declarationMaterials(value).forEach(validateArtifact)
  if (value.kind === 'software') {
    const definition = value.definition
    resourceId(definition.source.id)
    resourceId(definition.source.revision)
    digest(definition.source.sha256)
    identifier(definition.package, 1024)
    identifier(definition.version, 1024)
    for (const [key, artifact] of Object.entries(definition.artifacts)) {
      resourceId(key)
      validateArtifact(artifact)
    }
    for (const dependency of definition.dependencies) {
      resourceId(dependency.resource)
      resourceId(dependency.version)
      digest(dependency.sha256)
    }
  } else if (value.kind === 'telemetry_profile') {
    const definition = value.definition
    resourceId(definition.template.resource)
    resourceId(definition.template.version)
    resourceId(definition.template.variant)
    for (const field of definition.fields) {
      fieldKey(field.key)
      positive(field.version)
    }
    positive(definition.sampleMillis)
    positive(definition.uploadMillis)
    if (definition.uploadMillis < definition.sampleMillis)
      throw new Error('Upload cadence precedes sampling')
    Object.values(definition.budget).forEach(positive)
    positive(definition.backfillSeconds)
  } else if (value.kind !== 'configuration') {
    const mappings =
      value.kind === 'script'
        ? value.definition.purpose.kind === 'collection'
          ? value.definition.purpose.mappings
          : {}
        : value.definition.mappings
    for (const [key, mapping] of Object.entries(mappings)) {
      fieldKey(key)
      validateMapping('mapping' in mapping ? mapping.mapping : mapping)
    }
    if (value.kind === 'agent_collection')
      for (const mapping of Object.values(value.definition.mappings)) {
        if (!Object.hasOwn(value.definition.plan.queries, mapping.query))
          throw new Error('Mapping references absent query')
      }
  }
  boundedDocument(value, 8 * 1024 * 1024)
}
export function validateVariants(kind: Declaration['kind'], variants: readonly Variant[]): void {
  boundedDocument(variants, 8 * 1024 * 1024)
  if (
    !variants.length ||
    variants.length > 64 ||
    new Set(variants.map(variantKey)).size !== variants.length
  )
    throw new Error('Invalid resource variants')
  for (const variant of variants) {
    resourceId(variant.key)
    if (
      !['windows', 'macos'].includes(variant.platform) ||
      !['x86_64', 'aarch64'].includes(variant.architecture) ||
      variant.declaration.kind !== kind
    )
      throw new Error('Wrong resource variant kind or target')
    validateDeclaration(variant.declaration)
    if (
      kind === 'native_collection' &&
      !variants.some(
        (peer) =>
          peer.platform === variant.platform &&
          peer.architecture !== variant.architecture &&
          sameDefinition(peer.declaration, variant.declaration),
      )
    )
      throw new Error('Native definition requires an exact cross-architecture pair')
  }
}
export function validateChange(change: ResourceChange, expectedRevision: number): void {
  revision(expectedRevision)
  if (
    !['create', 'present', 'instantiate', 'version', 'activate', 'deprecate', 'archive'].includes(
      change.action,
    )
  )
    throw new Error('Invalid resource action')
  if (change.action === 'create' || change.action === 'instantiate') {
    if (expectedRevision !== 0) throw new Error('Creation requires absence revision')
    if (change.action === 'create') {
      if (!resourceKinds.includes(change.kind)) throw new Error('Invalid resource kind')
    } else {
      resourceId(change.blueprint)
      resourceId(change.version)
    }
  } else if (change.action === 'present') validatePresentation(change.presentation)
  else {
    resourceId(change.version)
    if (change.action === 'version') validateVariants(change.kind, change.variants)
  }
}

/** Replace the selected full declaration and only its exact native cross-architecture pair. */
export function replaceDeclaration<V extends Variant>(
  variants: readonly V[],
  selected: Pick<Variant, 'key' | 'platform' | 'architecture'>,
  declaration: V['declaration'],
): readonly V[] {
  const source = variants.find((variant) => variantKey(variant) === variantKey(selected))
  if (!source || source.declaration.kind !== declaration.kind)
    throw new Error('Wrong declaration selection')
  return variants.map((variant) =>
    (declaration.kind === 'native_collection' &&
      variant.platform === source.platform &&
      sameDefinition(variant.declaration, source.declaration)) ||
    variantKey(variant) === variantKey(selected)
      ? { ...variant, declaration }
      : variant,
  )
}
