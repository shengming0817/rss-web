export type * from './model'
import { freeze, identifier, operation, revision, type Operation } from '@rss/mdm-inventory'
import {
  boundedDocument,
  digest,
  positive,
  resourceId,
  sameDefinition,
  validateArtifact,
} from '@rss/mdm-resources'
import type { DirectoryQuery } from '@rss/mdm-devices'
import type {
  ImportInput,
  Lifecycle,
  SoftwarePort,
  SourceChange,
  SourceDefinition,
  SourceRow,
  SourceView,
  VersionRow,
} from './model'

export function validateSource(value: SourceDefinition): void {
  resourceId(value.id)
  resourceId(value.revision)
  const protocol = value.protocol
  function url(value: string): void {
    const parsed = new URL(value)
    if (
      parsed.protocol !== 'https:' ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      value.length > 2048
    )
      throw new Error('Invalid credential-free source location')
  }
  if (protocol.kind === 'private') return
  if (protocol.kind === 'winget_rest') {
    url(protocol.location)
    resourceId(protocol.identifier)
  } else if (protocol.kind === 'winget_community' || protocol.kind === 'brew_tap') {
    url(protocol.repository)
    if (!/^[a-f0-9]{40}$/.test(protocol.commit)) throw new Error('Source requires an exact commit')
    if (
      protocol.kind === 'brew_tap' &&
      (protocol.tap.length > 255 ||
        !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(protocol.tap) ||
        protocol.tap
          .split('/')
          .some((part) => part === '.' || part === '..' || part.startsWith('-')))
    )
      throw new Error('Invalid source tap')
  } else throw new Error('Invalid source protocol')
}
export function validateImport(value: ImportInput): void {
  if (!Number.isSafeInteger(value.asOfUnixSeconds)) throw new Error('Invalid import time')
  resourceId(value.source.id)
  resourceId(value.source.revision)
  digest(value.source.sha256)
  resourceId(value.resource)
  resourceId(value.resourceVersion)
  resourceId(value.variant)
  identifier(value.package, 1024)
  identifier(value.packageVersion, 1024)
  positive(value.installerLength)
  for (const [key, material] of Object.entries(value.additionalArtifacts)) {
    resourceId(key)
    validateArtifact(material)
  }
  if (value.dependencies.length > 32) throw new Error('Too many exact dependencies')
  for (const dependency of value.dependencies) {
    identifier(dependency.package, 1024)
    identifier(dependency.packageVersion, 1024)
    resourceId(dependency.resource)
    resourceId(dependency.version)
    digest(dependency.sha256)
  }
  boundedDocument(value, 8 * 1024 * 1024)
}
function source(value: SourceView, id: string, revision: string): SourceView {
  if (
    value.source.id !== id ||
    value.source.revision !== revision ||
    value.snapshot.id !== id ||
    value.snapshot.revision !== revision
  )
    throw new Error('Wrong software source')
  digest(value.snapshot.sha256)
  return value
}
function settled(value: Lifecycle, change: Operation<unknown>): void {
  if (value.operation !== change.operationId || revision(value.revision) < change.expectedRevision)
    throw new Error('Wrong lifecycle operation receipt')
}
/** Source conversion and admission only; Resource content/activation and publications stay separate. */
export function createSoftware(port: SoftwarePort) {
  return Object.freeze({
    sources: (query: DirectoryQuery<keyof SourceRow> = {}) => port.sources(query),
    async source(id: string, sourceRevision: string) {
      resourceId(id)
      resourceId(sourceRevision)
      return source(await port.source(id, sourceRevision), id, sourceRevision)
    },
    async changeSource(id: string, sourceRevision: string, change: Operation<SourceChange>) {
      resourceId(id)
      resourceId(sourceRevision)
      operation(change)
      if (!['register', 'enable', 'disable'].includes(change.input.action))
        throw new Error('Invalid source action')
      if (change.input.action === 'register') {
        validateSource(change.input.definition)
        if (
          change.expectedRevision !== 0 ||
          change.input.definition.id !== id ||
          change.input.definition.revision !== sourceRevision
        )
          throw new Error('Wrong new source coordinates')
      }
      const original = freeze(change)
      const value = source(
        await port.changeSource(id, sourceRevision, original),
        id,
        sourceRevision,
      )
      settled(value.lifecycle, original)
      if (
        value.lifecycle.state !== (original.input.action === 'disable' ? 'disabled' : 'enabled') ||
        (original.input.action === 'register' &&
          !sameDefinition(value.source, original.input.definition))
      )
        throw new Error('Wrong source change receipt')
      return value
    },
    async import(change: Operation<ImportInput>) {
      operation(change)
      validateImport(change.input)
      const original = freeze(change),
        value = await port.import(original)
      if (
        value.resource !== original.input.resource ||
        value.version !== original.input.resourceVersion ||
        revision(value.storageRevision) < original.expectedRevision
      )
        throw new Error('Wrong exact import receipt')
      digest(value.resourceDigest)
      return value
    },
    versions: (resource: string, query: DirectoryQuery<keyof VersionRow> = {}) =>
      port.versions(resourceId(resource), query),
    async version(resource: string, version: string) {
      resourceId(resource)
      resourceId(version)
      const value = await port.version(resource, version)
      if (value.resource !== resource || value.version !== version)
        throw new Error('Wrong admitted version detail')
      return value
    },
    async changeVersion(
      resource: string,
      version: string,
      change: Operation<{ readonly action: 'enable' | 'withdraw' }>,
    ) {
      resourceId(resource)
      resourceId(version)
      operation(change)
      if (!['enable', 'withdraw'].includes(change.input.action))
        throw new Error('Invalid admission action')
      const original = freeze(change),
        value = await port.changeVersion(resource, version, original)
      if (value.resource !== resource || value.version !== version)
        throw new Error('Wrong software version receipt')
      settled(value.lifecycle, original)
      if (value.lifecycle.state !== (original.input.action === 'enable' ? 'enabled' : 'withdrawn'))
        throw new Error('Wrong admission state receipt')
      return value
    },
  })
}

export * from './snapshots'
