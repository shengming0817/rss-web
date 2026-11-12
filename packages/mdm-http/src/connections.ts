import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { windowParameters, windowPage } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import {
  httpsOrigin,
  type AgentDirectory,
  type AgentOperation,
  type AppleDirectory,
  type AppleMaterial,
  type AppleReceipt,
  type ConnectionConfiguration,
  type ConnectionObservation,
  type ConnectionsPorts,
  type MailReceipt,
  type Migration,
  type SignedConnections,
  type StorageReceipt,
  type WnsOperation,
  type WnsReceipt,
} from '@rss/mdm-connections'
import { base64url, count, enumeration, positive, uuid } from './decode'
import { attachment } from './download'

function storageReceipt(value: unknown): StorageReceipt {
  if (!schema.postApiV1StorageConnectionsResponse.validateRoot(value))
    throw new Error('Invalid storage receipt')
  uuid(value.operationId)
  positive(value.revision)
  return {
    ...value,
    state: enumeration(value.state, ['pending', 'qualified', 'rejected'] as const),
  }
}
function mailReceipt(value: unknown): MailReceipt {
  if (!schema.postApiV1SmtpResponse.validateRoot(value)) throw new Error('Invalid mail receipt')
  uuid(value.operationId)
  positive(value.revision)
  return value
}
function wnsReceipt(value: unknown): WnsReceipt {
  if (!schema.getApiV1WindowsWnsResponse.validateReceipt(value))
    throw new Error('Invalid Windows push receipt')
  uuid(value.operationId)
  positive(value.revision)
  return value
}
function wnsOperation(value: unknown, operationId: string): WnsOperation {
  if (!schema.postApiV1WindowsWnsResponse.validateRoot(value))
    throw new Error('Invalid Windows push operation')
  if (value.receipt.operationId !== operationId) throw new Error('Wrong Windows push operation')
  if (value.kind === 'material') wnsReceipt(value.receipt)
  else {
    positive(value.receipt.revision)
    positive(value.receipt.materialRevision)
  }
  return value
}
function migration(value: unknown, operationId?: string): Migration {
  if (!schema.getApiV1StorageMigrationsOperationsByIdResponse.validateRoot(value))
    throw new Error('Invalid storage migration')
  uuid(value.operationId)
  uuid(value.sourceGeneration)
  uuid(value.targetGeneration)
  if (operationId !== undefined && value.operationId !== operationId)
    throw new Error('Wrong storage migration operation')
  for (const n of [
    value.expectedStorageRevision,
    value.targetRevision,
    value.sourceObjects,
    value.verifiedObjects,
    value.verifiedBytes,
  ])
    count(n)
  return value
}
function appleMaterial(value: unknown): AppleMaterial {
  if (!schema.getApiV1AppleMaterialsByPurposeVersionsResponse.validatePublicVersion(value))
    throw new Error('Invalid Apple material')
  positive(value.revision)
  uuid(value.keyId)
  if (
    !/^[0-9a-f]{64}$/.test(value.publicKeyDigest) ||
    (value.certificateDigest !== null && !/^[0-9a-f]{64}$/.test(value.certificateDigest))
  )
    throw new Error('Invalid material digest')
  return value
}
function appleDirectory(value: unknown): AppleDirectory {
  if (!schema.getApiV1AppleMaterialsByPurposeResponse.validateRoot(value))
    throw new Error('Invalid Apple material directory')
  if (value.runtimeObservation !== 'separate')
    throw new Error('Invalid runtime observation boundary')
  for (const material of Object.values(value.materials)) appleMaterial(material)
  return value
}
function appleReceipt(value: unknown, operationId: string): AppleReceipt {
  if (!schema.getApiV1AppleMaterialOperationsByOperationResponse.validateRoot(value))
    throw new Error('Invalid Apple operation')
  if (value.operationId !== operationId) throw new Error('Wrong Apple material operation')
  positive(value.revision)
  return value
}
function connectionConfiguration(
  value: unknown,
  tenant: string,
  service: string,
): ConnectionConfiguration {
  if (!schema.getApiV1AgentConnectionsResponse.validateConfiguration(value))
    throw new Error('Invalid Agent connection configuration')
  if (value.wireVersion !== 1 || value.tenantId !== tenant || value.serviceId !== service)
    throw new Error('Wrong Agent connection binding')
  positive(value.revision)
  if (
    !value.origins.length ||
    value.origins.length > 8 ||
    !value.origins.includes(value.preferredOrigin) ||
    value.origins.some(
      (origin, index) =>
        origin !== httpsOrigin(origin) || (index > 0 && value.origins[index - 1]! >= origin),
    ) ||
    !/^[A-Za-z0-9._-]{1,128}$/.test(value.keyId)
  )
    throw new Error('Invalid connection origins or key')
  return value
}
function signedConnections(value: unknown, tenant: string, service: string): SignedConnections {
  if (!schema.postApiV1AgentConnectionsPublishResponse.validateRoot(value))
    throw new Error('Invalid signed connection contract')
  connectionConfiguration(value.configuration, tenant, service)
  base64url(value.signature, 64)
  return value
}
function agentDirectory(value: unknown, tenant: string, service: string): AgentDirectory {
  if (!schema.getApiV1AgentConnectionsResponse.validateRoot(value))
    throw new Error('Invalid Agent connection directory')
  if (value.serviceId !== service) throw new Error('Wrong connection service')
  if (value.draft) connectionConfiguration(value.draft.configuration, tenant, service)
  if (value.published) signedConnections(value.published, tenant, service)
  if (Object.keys(value.verificationKeys).length > 16) throw new Error('Invalid verification keys')
  for (const [key, publicKey] of Object.entries(value.verificationKeys)) {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(key)) throw new Error('Invalid verification key identity')
    base64url(publicKey, 32)
  }
  for (const deployment of value.deployments) {
    httpsOrigin(deployment.origin)
    uuid(deployment.hostId)
    positive(deployment.revision)
    count(deployment.configurationRevision)
  }
  if (
    new Set(value.deployments.map((d) => d.origin)).size !== value.deployments.length ||
    value.convergence.confirmedDevices > value.convergence.activeDevices ||
    value.convergence.targetRevision !== (value.published?.configuration.revision ?? null) ||
    (value.draft && !value.verificationKeys[value.draft.configuration.keyId]) ||
    (value.published && !value.verificationKeys[value.published.configuration.keyId])
  )
    throw new Error('Invalid connection convergence or trust binding')
  return value
}
function connectionObservation(value: unknown): ConnectionObservation | null {
  if (!schema.getApiV1AgentConnectionsDevicesByDeviceObservationResponse.validateRoot(value))
    throw new Error('Invalid connection observation')
  if (value === null) return null
  if ((value.acknowledgement === null) !== (value.receivedAt === null))
    throw new Error('Unpaired connection acknowledgement')
  if (value.acknowledgement) {
    uuid(value.acknowledgement.operationId)
    positive(value.acknowledgement.revision)
    httpsOrigin(value.acknowledgement.origin)
    if (!/^[0-9a-f]{64}$/.test(value.acknowledgement.digest))
      throw new Error('Invalid connection digest')
  }
  if (value.failure) {
    uuid(value.failure.report.operationId)
    positive(value.failure.report.revision)
    httpsOrigin(value.failure.origin)
    count(value.failure.receivedAt)
  }
  return value
}
/** Module-native versions remain distinct. All operations use generated contract admission. */
export function createConnectionsAdapters(
  transport: HttpTransport,
  tenant: string,
  service: string,
): ConnectionsPorts {
  uuid(tenant)
  uuid(service)
  return {
    storage: {
      read: () =>
        api.getApiV1StorageConnections(transport, {}, (value) => {
          return {
            ...value,
            current: value.current === null ? null : storageReceipt(value.current),
            latest: value.latest === null ? null : storageReceipt(value.latest),
            applied: value.applied === null ? null : storageReceipt(value.applied),
          }
        }),
      history: (query) =>
        api.getApiV1StorageConnectionsVersions(
          transport,
          { query: windowParameters({ limit: 20, ...query }) },
          (value) => windowPage(value, storageReceipt),
        ),
      operation: (id) =>
        api.getApiV1StorageConnectionsOperationsById(
          transport,
          { pathParams: { id: uuid(id) } },
          (value) => {
            const result = storageReceipt(value)
            if (result.operationId !== id) throw new Error('Wrong storage operation')
            return result
          },
        ),
      save: (intent, source) =>
        api.postApiV1StorageConnections(
          transport,
          {
            headers: { 'Idempotency-Key': uuid(intent.operationId) },
            body: { expectedRevision: intent.expectedRevision, profile: intent.profile, source },
          },
          storageReceipt,
        ),
      migrations: () =>
        api.getApiV1StorageMigrations(transport, {}, (value) => {
          uuid(value.activeGeneration)
          if (value.operation) migration(value.operation)
          value.history.forEach((entry) => migration(entry))
          return value
        }),
      requestMigration: (intent) =>
        api.postApiV1StorageMigrations(
          transport,
          {
            headers: { 'Idempotency-Key': uuid(intent.operationId) },
            body: {
              expectedStorageRevision: intent.expectedStorageRevision,
              targetRevision: intent.targetRevision,
            },
          },
          (value) => migration(value, intent.operationId),
        ),
      migration: (id) =>
        api.getApiV1StorageMigrationsOperationsById(
          transport,
          { pathParams: { id: uuid(id) } },
          (value) => migration(value, id),
        ),
      cancelMigration: (id) =>
        api.postApiV1StorageMigrationsOperationsByIdCancel(
          transport,
          { pathParams: { id: uuid(id) } },
          (value) => migration(value, id),
        ),
    },
    mail: {
      read: () =>
        api.getApiV1Smtp(transport, {}, (value) => {
          for (const receipt of [value.current, value.latest]) if (receipt) mailReceipt(receipt)
          return value
        }),
      history: (query) =>
        api.getApiV1SmtpVersions(
          transport,
          { query: windowParameters({ limit: 20, ...query }) },
          (value) => windowPage(value, mailReceipt),
        ),
      operation: (id) =>
        api.getApiV1SmtpOperationsById(transport, { pathParams: { id: uuid(id) } }, (value) => {
          const result = mailReceipt(value)
          if (result.operationId !== id) throw new Error('Wrong mail operation')
          return result
        }),
      save: (intent, password) =>
        api.postApiV1Smtp(
          transport,
          {
            headers: { 'Idempotency-Key': uuid(intent.operationId) },
            body: {
              expectedRevision: intent.expectedRevision,
              profile: intent.profile,
              sender: intent.sender,
              recipient: intent.recipient,
              username: intent.username,
              password,
            },
          },
          mailReceipt,
        ),
    },
    wns: {
      read: () =>
        api.getApiV1WindowsWns(transport, {}, (value) => {
          for (const receipt of [value.current, value.latest, value.applied])
            if (receipt) wnsReceipt(receipt)
          return value
        }),
      history: (query) =>
        api.getApiV1WindowsWnsVersions(
          transport,
          { query: windowParameters({ limit: 20, ...query }) },
          (value) => windowPage(value, wnsReceipt),
        ),
      operation: (id) =>
        api.getApiV1WindowsWnsOperationsById(transport, { pathParams: { id: uuid(id) } }, (value) =>
          wnsOperation(value, id),
        ),
      save: (intent, clientSecret) =>
        api.postApiV1WindowsWns(
          transport,
          {
            headers: { 'Idempotency-Key': uuid(intent.operationId) },
            body: {
              expectedRevision: intent.expectedRevision,
              packageFamilyName: intent.packageFamilyName,
              sid: intent.sid,
              clientSecret,
            },
          },
          (value) => wnsOperation(value, intent.operationId),
        ),
      revoke: (id, expectedRevision, materialRevision) =>
        api.postApiV1WindowsWnsRevoke(
          transport,
          {
            headers: { 'Idempotency-Key': uuid(id) },
            body: { expectedRevision, materialRevision },
          },
          (value) => wnsOperation(value, id),
        ),
    },
    apple: {
      read: (purpose) =>
        api.getApiV1AppleMaterialsByPurpose(transport, { pathParams: { purpose } }, appleDirectory),
      history: (purpose, query) =>
        api.getApiV1AppleMaterialsByPurposeVersions(
          transport,
          { pathParams: { purpose }, query: windowParameters({ limit: 20, ...query }) },
          (value) => windowPage(value, appleMaterial),
        ),
      operation: (id) =>
        api.getApiV1AppleMaterialOperationsByOperation(
          transport,
          { pathParams: { operation: uuid(id) } },
          (value) => appleReceipt(value, id),
        ),
      submit: (purpose, id, command, privateKeyPem) => {
        const pathParams = { purpose },
          headers = { 'Idempotency-Key': uuid(id) },
          expectedRevision = command.expectedRevision
        switch (command.kind) {
          case 'key':
            return api.postApiV1AppleMaterialsByPurposeKeys(
              transport,
              {
                pathParams,
                headers,
                body: {
                  expectedRevision,
                  source:
                    command.sourceKind === 'generate'
                      ? { kind: 'generate' }
                      : { kind: 'import', private_key_pem: privateKeyPem ?? '' },
                },
              },
              (value) => appleReceipt(value, id),
            )
          case 'certificate':
            return api.postApiV1AppleMaterialsByPurposeCertificates(
              transport,
              {
                pathParams,
                headers,
                body: {
                  expectedRevision,
                  keyRevision: command.keyRevision,
                  certificateChainPem: command.certificateChainPem,
                },
              },
              (value) => appleReceipt(value, id),
            )
          case 'apply':
            return api.postApiV1AppleMaterialsByPurposeApply(
              transport,
              {
                pathParams,
                headers,
                body: {
                  expectedRevision,
                  materialRevision: command.materialRevision,
                  accountAlias: command.accountAlias,
                },
              },
              (value) => appleReceipt(value, id),
            )
          case 'revoke':
            return api.postApiV1AppleMaterialsByPurposeRevoke(
              transport,
              {
                pathParams,
                headers,
                body: { expectedRevision, materialRevision: command.materialRevision },
              },
              (value) => appleReceipt(value, id),
            )
        }
      },
    },
    agent: {
      read: () =>
        api.getApiV1AgentConnections(transport, {}, (value) =>
          agentDirectory(value, tenant, service),
        ),
      save: (intent) =>
        api.putApiV1AgentConnections(
          transport,
          { body: { ...intent, origins: [...intent.origins] } },
          (value) => ({
            configuration: connectionConfiguration(value.configuration, tenant, service),
          }),
        ),
      publish: (id, expectedRevision) =>
        api.postApiV1AgentConnectionsPublish(
          transport,
          { body: { operationId: uuid(id), expectedRevision } },
          (value) => signedConnections(value, tenant, service),
        ),
      operation: (id) =>
        api.getApiV1AgentConnectionOperationsById(
          transport,
          { pathParams: { id: uuid(id) } },
          (value): AgentOperation | null => {
            if (value === null) return null
            return value.action === 'saved'
              ? {
                  action: value.action,
                  draft: {
                    configuration: connectionConfiguration(
                      value.draft.configuration,
                      tenant,
                      service,
                    ),
                  },
                }
              : {
                  action: value.action,
                  configuration: signedConnections(value.configuration, tenant, service),
                }
          },
        ),
      download: () =>
        api.getApiV1AgentConnectionsConfiguration(transport, {}, (value) => {
          const file = attachment(value, 'application/json', 'rss-agent-connections.json', 65536)
          try {
            const document = signedConnections(
              JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes)),
              tenant,
              service,
            )
            return { file, document }
          } catch (error) {
            new Uint8Array(file.bytes).fill(0)
            throw error
          }
        }),
      devices: (revision, after) =>
        api.getApiV1AgentConnectionsDevices(
          transport,
          {
            query: {
              revision: positive(revision),
              ...(after === undefined ? {} : { after: uuid(after) }),
            },
          },
          (value) => {
            if (value.targetRevision !== revision) throw new Error('Wrong convergence target')
            if (new Set(value.items.map((item) => item.device)).size !== value.items.length)
              throw new Error('Duplicate device registration')
            for (const item of value.items) {
              text(item.device)
              if (item.origin !== null) httpsOrigin(item.origin)
            }
            return value
          },
        ),
      observation: (device) =>
        api.getApiV1AgentConnectionsDevicesByDeviceObservation(
          transport,
          { pathParams: { device } },
          connectionObservation,
        ),
    },
    evidence: {
      catalog: () =>
        api.getApiV1SettingsCatalog(transport, {}, (value) =>
          value.items
            .filter((item) =>
              [
                's3-key',
                'storage',
                'prefix',
                'smtp',
                'wns',
                'apns-key',
                'apns-cert',
                'profile-key',
                'profile-cert',
                'managed-key',
                'agent-connections',
              ].includes(item.id),
            )
            .map((item) => ({
              id: item.id,
              status: item.status,
              revision: item.revision,
              desiredRevision: item.desiredRevision,
              appliedRevision: item.appliedRevision,
              reason: item.reason,
            })),
        ),
      loaded: () =>
        api.getApiV1RuntimeDiagnostics(transport, {}, (value) =>
          value.channels
            .filter((channel) => channel.name !== 'signing')
            .map((channel) => ({
              name: channel.name,
              state: channel.state,
              mounted: channel.mounted,
              loadedMaterials: { ...channel.loadedMaterials },
              reasons: [...channel.reasons],
            })),
        ),
    },
  }
}
