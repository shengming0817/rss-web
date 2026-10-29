import { validateDeclaration, validateResourceResponse } from '@rss/api/mdm-validators'
import type * as Wire from '@rss/api/mdm-types'
import type {
  AgentDefinition,
  Applicability,
  Artifact,
  Declaration,
  NativeDefinition,
  PhysicalRead,
  Resource,
  ScriptDefinition,
  SoftwareBehavior,
  SoftwareDefinition,
  Variant,
} from '@rss/mdm-resources'
import { resourceId, resourceKinds, validatePresentation } from '@rss/mdm-resources'
import { count, enumeration, list, nullable, positive, text } from './decode'

export function resourceDigest(value: unknown): readonly number[] {
  const bytes = list(value, count, 32)
  if (bytes.length !== 32 || bytes.some((byte) => byte > 255))
    throw new Error('Invalid resource digest')
  return bytes
}
export function resourceArtifact(value: Wire.Artifact): Artifact {
  return {
    reference: resourceId(value.reference),
    length: positive(value.length),
    sha256: resourceDigest(value.sha256),
  }
}
export function resourcePresentation(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  validatePresentation(value)
  return structuredClone(value)
}
function applicability(value: Wire.Applicability): Applicability {
  return {
    minimumOsVersion: value.minimumOsVersion ?? null,
    minimumBuild: value.minimumBuild ?? null,
    editions: [...value.editions],
    enrollments: [...value.enrollments],
    tools: { ...value.tools },
    capabilities: [...value.capabilities],
  }
}
function physical(value: Wire.NativeQueryDefinition): PhysicalRead {
  return value.kind === 'windows_wmi'
    ? { ...value, filter: value.filter ?? null }
    : structuredClone(value)
}
export function agentDefinition(value: Wire.AgentCollectionDefinition): AgentDefinition {
  return {
    applicability: applicability(value.applicability),
    mappings: structuredClone(value.mappings),
    plan: {
      ...value.plan,
      queries: Object.fromEntries(
        Object.entries(value.plan.queries).map(([key, query]) => [
          key,
          { ...query, definition: physical(query.definition) },
        ]),
      ),
    },
  }
}
export function nativeDefinition(value: Wire.NativeCollectionDefinition): NativeDefinition {
  return {
    ...value,
    applicability: applicability(value.applicability),
    mappings: structuredClone(value.mappings),
  }
}
function scriptDefinition(value: Wire.ScriptDefinition): ScriptDefinition {
  const purpose = value.purpose
  return {
    ...value,
    sql: value.sql ?? null,
    parameters: structuredClone(value.parameters),
    output: structuredClone(value.output),
    bindings: structuredClone(value.bindings),
    purpose:
      purpose.kind === 'action'
        ? { kind: 'action' }
        : {
            ...purpose,
            applicability: applicability(purpose.applicability),
            mappings: structuredClone(purpose.mappings),
          },
  }
}
function four(value: readonly number[]): readonly [number, number, number, number] {
  if (
    value.length !== 4 ||
    value.some((number) => !Number.isInteger(number) || number < 0 || number > 65535)
  )
    throw new Error('Invalid four-part native version')
  return [value[0]!, value[1]!, value[2]!, value[3]!]
}
export function softwareBehavior(value: Wire.SoftwareBehavior): SoftwareBehavior {
  if (value.kind === 'msix') {
    const identity = (value: Wire.MsixIdentity) => ({ ...value, version: four(value.version) })
    return {
      ...structuredClone(value),
      minimumOs: four(value.minimumOs),
      identity: identity(value.identity),
      dependencies: value.dependencies.map(identity),
      container:
        value.container.kind === 'package'
          ? { ...value.container }
          : {
              ...value.container,
              members: value.container.members.map((member) => ({
                ...member,
                identity: identity(member.identity),
                length: positive(member.length),
                sha256: resourceDigest(member.sha256),
              })),
            },
    }
  }
  if (value.kind === 'bundle') {
    if (value.manifest.schema !== 1) throw new Error('Invalid bundle schema')
    return { ...structuredClone(value), manifest: { ...value.manifest, schema: 1 } }
  }
  return structuredClone(value)
}
function software(value: Wire.SoftwareDefinition): SoftwareDefinition {
  return {
    ...structuredClone(value),
    source: {
      id: resourceId(value.source.id),
      revision: resourceId(value.source.revision),
      sha256: resourceDigest(value.source.sha256),
    },
    artifacts: Object.fromEntries(
      Object.entries(value.artifacts).map(([key, artifact]) => [
        resourceId(key),
        { ...resourceArtifact(artifact), origin: artifact.origin ?? null },
      ]),
    ),
    material: {
      bundleId: value.material.bundle_id ?? null,
      format: value.material.format,
      installer: value.material.installer,
    },
    behavior: value.behavior == null ? null : softwareBehavior(value.behavior),
    provenance:
      value.provenance.kind === 'private'
        ? structuredClone(value.provenance)
        : {
            ...structuredClone(value.provenance),
            files: value.provenance.files.map((file) => ({
              ...file,
              content: { ...resourceArtifact(file.content), origin: file.content.origin ?? null },
            })),
          },
    signatures: value.signatures.map((signature) => ({
      ...signature,
      evidence: signature.evidence
        ? { ...resourceArtifact(signature.evidence), origin: signature.evidence.origin ?? null }
        : null,
    })),
  }
}
export function resourceDeclaration(value: unknown): Declaration {
  if (!validateDeclaration(value)) throw new Error('Invalid resource declaration')
  if (value.kind === 'software') return { kind: value.kind, definition: software(value.definition) }
  const artifact = resourceArtifact(value.artifact)
  switch (value.kind) {
    case 'configuration':
      return { kind: value.kind, artifact }
    case 'script':
      return { kind: value.kind, artifact, definition: scriptDefinition(value.definition) }
    case 'native_collection':
      return { kind: value.kind, artifact, definition: nativeDefinition(value.definition) }
    case 'agent_collection':
      return { kind: value.kind, artifact, definition: agentDefinition(value.definition) }
    case 'telemetry_profile':
      return {
        kind: value.kind,
        artifact,
        definition: { ...structuredClone(value.definition), boost: value.definition.boost ?? null },
      }
  }
}
export function resourceVariant(value: Wire.Variant): Variant {
  return {
    key: resourceId(value.key),
    platform: value.platform,
    architecture: value.architecture,
    declaration: resourceDeclaration(value.declaration),
  }
}
export function resourceRead(value: unknown, id: string): Resource {
  if (!validateResourceResponse(value) || !('versions' in value) || value.id !== id)
    throw new Error('Wrong resource detail')
  const kind = enumeration(value.kind, resourceKinds),
    versions = value.versions.map((version) => ({
      id: resourceId(version.id),
      digest: resourceDigest(version.digest),
      state: enumeration(version.state, ['frozen', 'active', 'deprecated', 'archived'] as const),
      variants: version.variants.map(resourceVariant),
    }))
  if (
    new Set(versions.map((version) => version.id)).size !== versions.length ||
    versions.some(
      (version) =>
        new Set(
          version.variants.map((variant) =>
            JSON.stringify([variant.key, variant.platform, variant.architecture]),
          ),
        ).size !== version.variants.length ||
        version.variants.some((variant) => variant.declaration.kind !== kind),
    )
  )
    throw new Error('Wrong resource version kind')
  return {
    id,
    kind,
    revision: count(value.revision),
    presentation: resourcePresentation(value.presentation),
    origin: nullable(value.origin ?? null, (origin) => {
      if (!origin || typeof origin !== 'object') throw new Error('Invalid blueprint origin')
      return {
        blueprint: resourceId(text(Reflect.get(origin, 'blueprint'))),
        version: resourceId(text(Reflect.get(origin, 'version'))),
        digest: resourceDigest(Reflect.get(origin, 'digest')),
      }
    }),
    versions,
  }
}
/** Current domain fields bind to the one generated wire definition at the HTTP boundary. */
export function declarationInput(value: Declaration): unknown {
  if (value.kind !== 'software') return value
  return {
    kind: value.kind,
    definition: {
      ...value.definition,
      material: {
        bundle_id: value.definition.material.bundleId,
        format: value.definition.material.format,
        installer: value.definition.material.installer,
      },
    },
  }
}
