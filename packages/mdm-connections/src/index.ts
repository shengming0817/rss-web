export type * from './model'
import type {
  AgentIntent,
  AppleCommand,
  ApplePurpose,
  ConnectionsPorts,
  MailIntent,
  MigrationIntent,
  StorageIntent,
  StorageSource,
  WnsIntent,
} from './model'
export function uuid(value: string): string {
  if (
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value) ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)
  )
    throw new Error('Invalid identifier')
  return value
}
function revision(value: number, positive = false): number {
  if (
    !Number.isSafeInteger(value) ||
    value < (positive ? 1 : 0) ||
    value >= Number.MAX_SAFE_INTEGER
  )
    throw new Error('Invalid revision')
  return value
}
function bounded(value: string, maximum = 4096, multiline = false): string {
  if (
    new TextEncoder().encode(value).length > maximum ||
    [...value].some((c) => /\p{Cc}/u.test(c) && !(multiline && ['\n', '\r', '\t'].includes(c)))
  )
    throw new Error('Invalid connection text')
  return value
}
export function httpsOrigin(value: string): string {
  bounded(value, 2048)
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password)
    throw new Error('Invalid HTTPS origin')
  return value
}
export function agentIntent(
  operationId: string,
  expectedRevision: number,
  preferredOrigin: string,
  origins: readonly string[],
): AgentIntent {
  uuid(operationId)
  revision(expectedRevision)
  httpsOrigin(preferredOrigin)
  if (
    !origins.length ||
    origins.length > 8 ||
    new Set(origins).size !== origins.length ||
    !origins.includes(preferredOrigin)
  )
    throw new Error('Invalid connection origins')
  const ordered = origins.map(httpsOrigin).sort()
  return Object.freeze({
    operationId,
    expectedRevision,
    preferredOrigin,
    origins: Object.freeze(ordered),
  })
}
function validateStorageSource(source: StorageSource): void {
  if (source.kind === 'generate') return
  if (
    source.kind !== 'import' ||
    !source.access_key ||
    !source.secret_key ||
    (source.expires_at !== null &&
      (!Number.isSafeInteger(source.expires_at) || source.expires_at < 1))
  )
    throw new Error('Invalid storage credential')
  bounded(source.access_key)
  bounded(source.secret_key)
  if (source.session_token !== null) bounded(source.session_token, 16384)
}
function mailIntent(intent: MailIntent, password: string): MailIntent {
  uuid(intent.operationId)
  revision(intent.expectedRevision)
  for (const value of [intent.profile, intent.sender, intent.recipient, intent.username, password])
    bounded(value)
  if (!intent.profile || !intent.sender || !intent.recipient)
    throw new Error('Incomplete mail configuration')
  return Object.freeze({ ...intent })
}
function wnsIntent(intent: WnsIntent, secret: string): WnsIntent {
  uuid(intent.operationId)
  revision(intent.expectedRevision)
  for (const value of [intent.packageFamilyName, intent.sid, secret]) {
    bounded(value)
    if (!value) throw new Error('Missing Windows push credential')
  }
  return Object.freeze({ ...intent })
}
function appleInput(
  purpose: ApplePurpose,
  id: string,
  command: AppleCommand,
  privateKeyPem?: string,
): AppleCommand {
  uuid(id)
  revision(command.expectedRevision)
  if (!['apns', 'profile', 'managed_account'].includes(purpose))
    throw new Error('Invalid Apple material purpose')
  switch (command.kind) {
    case 'key':
      if (command.sourceKind === 'import') {
        if (!privateKeyPem?.trim()) throw new Error('Missing private key')
        bounded(privateKeyPem, 262144, true)
      } else if (command.sourceKind !== 'generate' || privateKeyPem)
        throw new Error('Invalid key source')
      break
    case 'certificate':
      revision(command.keyRevision, true)
      bounded(command.certificateChainPem, 262144, true)
      if (!command.certificateChainPem.trim()) throw new Error('Missing certificate chain')
      break
    case 'apply':
      revision(command.materialRevision, true)
      if (command.accountAlias !== null) bounded(command.accountAlias, 256)
      break
    case 'revoke':
      revision(command.materialRevision, true)
      break
    default:
      throw new Error('Invalid Apple material action')
  }
  return structuredClone(command)
}
/** Material submission, qualification, selection, loading and device convergence remain separate facts. */
export function createConnections(ports: ConnectionsPorts, tenant: string, service: string) {
  uuid(tenant)
  uuid(service)
  return Object.freeze({
    evidence: ports.evidence,
    storage: Object.freeze({
      ...ports.storage,
      prepare(
        operationId: string,
        expectedRevision: number,
        profile: string,
        source: StorageSource,
      ): StorageIntent {
        uuid(operationId)
        revision(expectedRevision)
        bounded(profile)
        const sourceKind = source.kind
        validateStorageSource(source)
        if (!profile.trim() || !['generate', 'import'].includes(sourceKind))
          throw new Error('Invalid storage input')
        return Object.freeze({ operationId, expectedRevision, profile, sourceKind })
      },
      async save(intent: StorageIntent, source: StorageSource) {
        uuid(intent.operationId)
        revision(intent.expectedRevision)
        if (source.kind !== intent.sourceKind) throw new Error('Changed storage source')
        validateStorageSource(source)
        const result = await ports.storage.save(intent, source)
        if (
          result.operationId !== intent.operationId ||
          result.revision !== intent.expectedRevision + 1 ||
          result.profile !== intent.profile
        )
          throw new Error('Wrong storage receipt')
        return result
      },
      async requestMigration(intent: MigrationIntent) {
        uuid(intent.operationId)
        revision(intent.expectedStorageRevision)
        revision(intent.targetRevision, true)
        const result = await ports.storage.requestMigration(intent)
        if (
          result.operationId !== intent.operationId ||
          result.expectedStorageRevision !== intent.expectedStorageRevision ||
          result.targetRevision !== intent.targetRevision
        )
          throw new Error('Wrong migration receipt')
        return result
      },
      async cancelMigration(id: string) {
        uuid(id)
        const result = await ports.storage.cancelMigration(id)
        if (result.operationId !== id || result.phase !== 'cancelled')
          throw new Error('Wrong migration cancellation')
        return result
      },
    }),
    mail: Object.freeze({
      ...ports.mail,
      prepare: mailIntent,
      async save(intent: MailIntent, password: string) {
        mailIntent(intent, password)
        const result = await ports.mail.save(intent, password)
        if (
          result.operationId !== intent.operationId ||
          result.revision !== intent.expectedRevision + 1 ||
          result.profile !== intent.profile
        )
          throw new Error('Wrong mail receipt')
        return result
      },
    }),
    wns: Object.freeze({
      ...ports.wns,
      prepare: wnsIntent,
      async save(intent: WnsIntent, secret: string) {
        wnsIntent(intent, secret)
        const result = await ports.wns.save(intent, secret)
        if (
          result.kind !== 'material' ||
          result.receipt.operationId !== intent.operationId ||
          result.receipt.revision !== intent.expectedRevision + 1 ||
          result.receipt.packageFamilyName !== intent.packageFamilyName
        )
          throw new Error('Wrong Windows push receipt')
        return result
      },
      async revoke(id: string, expectedRevision: number, materialRevision: number) {
        uuid(id)
        revision(expectedRevision)
        revision(materialRevision, true)
        const result = await ports.wns.revoke(id, expectedRevision, materialRevision)
        if (
          result.kind !== 'revocation' ||
          result.receipt.operationId !== id ||
          result.receipt.revision !== expectedRevision + 1 ||
          result.receipt.materialRevision !== materialRevision
        )
          throw new Error('Wrong Windows push revoke receipt')
        return result
      },
    }),
    apple: Object.freeze({
      ...ports.apple,
      prepare: appleInput,
      async submit(
        purpose: ApplePurpose,
        id: string,
        command: AppleCommand,
        privateKeyPem?: string,
      ) {
        appleInput(purpose, id, command, privateKeyPem)
        const result = await ports.apple.submit(purpose, id, command, privateKeyPem)
        const state = {
          key: 'awaiting_certificate',
          certificate: 'validated',
          apply: 'pending_application',
          revoke: 'revoked',
        }[command.kind]
        if (
          result.operationId !== id ||
          result.revision !== command.expectedRevision + 1 ||
          result.state !== state
        )
          throw new Error('Wrong Apple material receipt')
        return result
      },
    }),
    agent: Object.freeze({
      ...ports.agent,
      async save(intent: AgentIntent) {
        const expected = agentIntent(
            intent.operationId,
            intent.expectedRevision,
            intent.preferredOrigin,
            intent.origins,
          ),
          result = await ports.agent.save(expected),
          configuration = result.configuration
        if (
          configuration.tenantId !== tenant ||
          configuration.serviceId !== service ||
          configuration.revision !== expected.expectedRevision + 1 ||
          configuration.preferredOrigin !== expected.preferredOrigin ||
          configuration.origins.join() !== expected.origins.join()
        )
          throw new Error('Wrong saved connection receipt')
        return result
      },
      async publish(id: string, expectedRevision: number) {
        uuid(id)
        revision(expectedRevision, true)
        const result = await ports.agent.publish(id, expectedRevision)
        if (
          result.configuration.tenantId !== tenant ||
          result.configuration.serviceId !== service ||
          result.configuration.revision !== expectedRevision
        )
          throw new Error('Wrong published connection receipt')
        return result
      },
      async devices(targetRevision: number, after?: string) {
        revision(targetRevision, true)
        if (after !== undefined) uuid(after)
        const result = await ports.agent.devices(targetRevision, after)
        if (result.targetRevision !== targetRevision)
          throw new Error('Wrong connection convergence target')
        return result
      },
      async observation(
        device: string,
        expected?: { readonly registrationId: string; readonly generation: number },
      ) {
        const result = await ports.agent.observation(device)
        if (
          result &&
          expected &&
          (result.registration !== expected.registrationId ||
            result.generation !== expected.generation)
        )
          throw new Error('Changed connection registration')
        return result
      },
    }),
  })
}
export type Connections = ReturnType<typeof createConnections>
