export * from './model'
export * from './authoring'
import type {
  AuthorizationPort,
  Change,
  Realm,
  Revision,
  Rule,
  UserGroup,
  Receipt,
  KeyIntent,
} from './model'
import { uuid, revision, validateRule, validateGroup, validateKey } from './authoring'

/** A full detail, rather than a directory projection, is required to edit or delete. */
export function prepareChange<T>(
  operationId: string,
  detail: Revision<T>,
  value: T | null,
): Change<T> {
  uuid(operationId)
  uuid(detail.id)
  revision(detail.revision)
  if (!detail.revision || detail.value === null)
    throw new Error('A tombstone cannot be edited or recreated')
  return { operationId, expectedRevision: detail.revision, value: structuredClone(value) }
}
export function confirmChange<T>(id: string, change: Change<T>, receipt: Receipt): Receipt {
  if (
    receipt.id !== id ||
    receipt.revision !== change.expectedRevision + 1 ||
    receipt.deleted !== (change.value === null)
  )
    throw new Error('Wrong authorization receipt')
  return receipt
}
/** No session, retry queue, cache or persistence. Explicit calls are never automatically replayed. */
export function createAuthorization(port: AuthorizationPort, tenant: string, realm: Realm) {
  uuid(tenant)
  const tenantOnly = () => {
    if (realm !== 'tenant') throw new Error('Business tenant operation required')
  }
  return {
    ...port,
    async changeRule(id: string, change: Change<Rule>) {
      uuid(id)
      uuid(change.operationId)
      revision(change.expectedRevision)
      if (change.value !== null) validateRule(change.value, tenant, realm)
      else if (!change.expectedRevision) throw new Error('Cannot delete an absent rule')
      return confirmChange(id, change, await port.changeRule(id, change))
    },
    async changeGroup(id: string, change: Change<UserGroup>) {
      tenantOnly()
      uuid(id)
      uuid(change.operationId)
      revision(change.expectedRevision)
      if (change.value !== null) validateGroup(change.value, tenant)
      else if (!change.expectedRevision) throw new Error('Cannot delete an absent group')
      return confirmChange(id, change, await port.changeGroup(id, change))
    },
    async changeKey(operationId: string, intent: KeyIntent) {
      tenantOnly()
      uuid(operationId)
      uuid(intent.id)
      revision(intent.revision)
      if ((intent.kind === 'create') !== (intent.revision === 0))
        throw new Error('Wrong key revision')
      if ('metadata' in intent) validateKey(intent.metadata)
      const result = await port.changeKey(operationId, intent)
      if (
        result.receipt.id !== intent.id ||
        result.receipt.revision !== intent.revision + 1 ||
        result.receipt.deleted !== (intent.kind === 'revoke') ||
        (result.secret !== null && intent.kind !== 'create' && intent.kind !== 'rotate')
      )
        throw new Error('Wrong API key receipt')
      return result
    },
    async changeNetwork(
      operationId: string,
      expectedRevision: number,
      networks: readonly string[],
    ) {
      if (realm !== 'management') throw new Error('Management realm required')
      uuid(operationId)
      revision(expectedRevision)
      // The backend parses and normalizes CIDR; this is only the authoring budget.
      if (
        networks.length > 256 ||
        networks.some((n) => !n || n.length > 128 || /[\s\p{Cc}]/u.test(n))
      )
        throw new Error('Invalid network list')
      const result = await port.changeNetwork(operationId, expectedRevision, networks)
      if (result.revision !== expectedRevision + 1) throw new Error('Wrong network receipt')
      return result
    },
  }
}
