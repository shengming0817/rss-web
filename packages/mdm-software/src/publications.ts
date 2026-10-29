import type { DirectoryQuery, Page, WindowQuery } from '@rss/mdm-devices'
import { freeze, identifier, operation, revision, uuid, type Operation } from '@rss/mdm-inventory'
import { digest, positive, resourceId } from '@rss/mdm-resources'

export interface PublicationTarget {
  readonly id: string
  readonly protocol: 'winget' | 'brew'
  readonly digest: readonly number[]
}
export interface PublicationTargetRow extends Partial<PublicationTarget> {
  readonly id: string
}
/** Native export documents are read-only business data, never a second editable recipe. */
export type ExportDocument =
  | { readonly kind: 'winget'; readonly manifest: Readonly<Record<string, unknown>> }
  | { readonly kind: 'brew'; readonly recipe: Readonly<Record<string, unknown>> }
export interface Publication {
  readonly id: string
  readonly revision: number
  readonly target: string
  readonly resource: string
  readonly version: string
  readonly publication: readonly number[]
  readonly contentDigest: readonly number[]
  readonly manifestDigest: readonly number[]
  readonly targetDigest: readonly number[]
  readonly attempt: number
  readonly outcome: 'pending' | 'unknown' | 'not_applied' | 'published'
  readonly withdrawn: boolean
  readonly withdrawal:
    | 'withdrawn'
    | 'not_published'
    | 'waiting_publication'
    | 'preflight_retryable'
    | 'unknown'
    | null
  readonly document?: ExportDocument
}
export interface PublicationRow extends Partial<Omit<Publication, 'document'>> {
  readonly id: string
}
export interface PublishInput {
  readonly action: 'publish'
  readonly resource: string
  readonly version: string
  readonly expectedResourceRevision: number
  readonly resourceDigest: readonly number[]
  readonly target: string
  readonly targetDigest: readonly number[]
}
export interface PublicationChange {
  readonly action: 'recover' | 'retry' | 'withdraw'
}
export interface PublicationsPort {
  targets(query: DirectoryQuery<keyof PublicationTargetRow>): Promise<Page<PublicationTargetRow>>
  target(id: string): Promise<PublicationTarget | null>
  original(operationId: string, query: WindowQuery): Promise<Page<PublicationRow>>
  list(query: DirectoryQuery<keyof PublicationRow>): Promise<Page<PublicationRow>>
  read(id: string): Promise<Publication>
  publish(change: Operation<PublishInput>): Promise<Publication>
  change(id: string, change: Operation<PublicationChange>): Promise<Publication>
}
export function validatePublish(value: Operation<PublishInput>): void {
  operation(value)
  if (value.input.action !== 'publish') throw new Error('Invalid publication action')
  if (value.expectedRevision !== 0)
    throw new Error('Publication creation requires absence revision')
  resourceId(value.input.resource)
  resourceId(value.input.version)
  revision(value.input.expectedResourceRevision)
  digest(value.input.resourceDigest)
  identifier(value.input.target)
  digest(value.input.targetDigest)
}
function validPublication(value: Publication): Publication {
  uuid(value.id)
  identifier(value.target)
  resourceId(value.resource)
  resourceId(value.version)
  revision(value.revision)
  positive(value.attempt)
  for (const hash of [
    value.publication,
    value.contentDigest,
    value.manifestDigest,
    value.targetDigest,
  ])
    digest(hash)
  if (
    !['pending', 'unknown', 'not_applied', 'published'].includes(value.outcome) ||
    typeof value.withdrawn !== 'boolean' ||
    (value.withdrawal !== null &&
      ![
        'withdrawn',
        'not_published',
        'waiting_publication',
        'preflight_retryable',
        'unknown',
      ].includes(value.withdrawal))
  )
    throw new Error('Invalid publication state')
  return value
}
/** No source deployment, Scope ownership, automatic recover or automatic retry. */
export function createPublications(port: PublicationsPort) {
  return Object.freeze({
    targets: (query: DirectoryQuery<keyof PublicationTargetRow> = {}) => port.targets(query),
    async target(id: string) {
      identifier(id)
      const value = await port.target(id)
      if (value !== null) {
        if (value.id !== id || !['winget', 'brew'].includes(value.protocol))
          throw new Error('Wrong publication target')
        digest(value.digest)
      }
      return value
    },
    original: (operationId: string, query: WindowQuery = {}) =>
      port.original(uuid(operationId), query),
    list: (query: DirectoryQuery<keyof PublicationRow> = {}) => port.list(query),
    async read(id: string) {
      uuid(id)
      const value = validPublication(await port.read(id))
      if (value.id !== id) throw new Error('Wrong publication')
      return value
    },
    async publish(change: Operation<PublishInput>) {
      validatePublish(change)
      const original = freeze(change),
        value = validPublication(await port.publish(original))
      if (
        value.id !== original.operationId ||
        value.resource !== original.input.resource ||
        value.version !== original.input.version ||
        value.target !== original.input.target ||
        !value.targetDigest.every((byte, index) => byte === original.input.targetDigest[index])
      )
        throw new Error('Wrong publication receipt')
      return value
    },
    async change(id: string, change: Operation<PublicationChange>) {
      uuid(id)
      operation(change)
      if (!['recover', 'retry', 'withdraw'].includes(change.input.action))
        throw new Error('Invalid publication action')
      const original = freeze(change),
        value = validPublication(await port.change(id, original))
      if (value.id !== id || revision(value.revision) < original.expectedRevision)
        throw new Error('Wrong publication mutation receipt')
      return value
    },
  })
}
