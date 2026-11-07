export type * from './model'
export {
  referenceKey,
  currentMember,
  validateAssociation,
  validateConfirmation,
  validateUser,
} from './authoring'
import type {
  AssignUser,
  Association,
  ConfirmAssociation,
  DevicesPort,
  DeviceRef,
  DirectoryQuery,
  Endpoint,
  ViewRow,
  AssociationRow,
  RevokeAssociation,
  RegistrationUser,
  User,
  WindowQuery,
  AssetState,
} from './model'
import {
  currentMember,
  deviceId,
  referenceKey,
  revision,
  sameMember,
  uuid,
  validateAssociation,
  validateConfirmation,
  validateUser,
  verificationText,
} from './authoring'

/** Explicit device use cases. No session, query cache, automatic replay or authority engine. */
export function createDevices(port: DevicesPort, tenant: string) {
  uuid(tenant)
  return Object.freeze({
    endpoints: (query: DirectoryQuery<keyof Endpoint> = {}, signal?: AbortSignal) =>
      port.endpoints(query, signal),
    endpoint: (id: string, signal?: AbortSignal) => port.endpoint(deviceId(id), signal),
    endpointStatistics: (filter?: string, signal?: AbortSignal) =>
      port.endpointStatistics(filter, signal),
    views: (query: DirectoryQuery<keyof ViewRow> = {}, signal?: AbortSignal) =>
      port.views(query, signal),
    view: (reference: DeviceRef, signal?: AbortSignal) => {
      referenceKey(reference)
      return port.view(reference, signal)
    },
    viewStatistics: (filter?: string, signal?: AbortSignal) => port.viewStatistics(filter, signal),
    associations: (query: DirectoryQuery<keyof AssociationRow> = {}, signal?: AbortSignal) =>
      port.associations(query, signal),
    association: (id: string, signal?: AbortSignal) => port.association(uuid(id), signal),
    changes: (query: WindowQuery = {}, signal?: AbortSignal) => port.changes(query, signal),
    candidates: (
      device: string,
      channel: 'mdm' | 'agent',
      query: WindowQuery = {},
      signal?: AbortSignal,
    ) => port.candidates(deviceId(device), channel, query, signal),
    async prepareConfirmation(
      operationId: string,
      mdmId: string,
      agentId: string,
      evidence: string,
      associationId: string | null = null,
    ): Promise<ConfirmAssociation> {
      uuid(operationId)
      verificationText(evidence)
      const [mdm, agent, prior] = await Promise.all([
        port.endpoint(deviceId(mdmId)),
        port.endpoint(deviceId(agentId)),
        associationId === null ? Promise.resolve(null) : port.association(uuid(associationId)),
      ])
      const change = Object.freeze({
        operationId,
        associationId,
        expectedVersion: prior?.version ?? 0,
        mdm: currentMember(mdm, 'mdm'),
        agent: currentMember(agent, 'agent'),
        evidence,
      })
      validateConfirmation(change)
      return change
    },
    async confirm(change: ConfirmAssociation): Promise<Association> {
      validateConfirmation(change)
      const result = await port.confirm(change)
      validateAssociation(result)
      if (
        (change.associationId !== null && result.id !== change.associationId) ||
        result.version !== change.expectedVersion + 1 ||
        result.state !== 'confirmed' ||
        [change.mdm, change.agent].some((m) => !result.members.some((x) => sameMember(m, x)))
      )
        throw new Error('Wrong association receipt')
      return result
    },
    async prepareRevocation(
      id: string,
      operationId: string,
      reason: string,
    ): Promise<RevokeAssociation> {
      uuid(operationId)
      verificationText(reason)
      const detail = await port.association(uuid(id))
      return Object.freeze({ operationId, expectedVersion: revision(detail.version), reason })
    },
    async revoke(id: string, change: RevokeAssociation) {
      uuid(id)
      uuid(change.operationId)
      revision(change.expectedVersion)
      verificationText(change.reason)
      const result = await port.revoke(id, change)
      validateAssociation(result)
      if (
        result.id !== id ||
        result.version !== change.expectedVersion + 1 ||
        result.state !== 'revoked'
      )
        throw new Error('Wrong revoke receipt')
      return result
    },
    registrationUser: (device: string) => port.registrationUser(deviceId(device)),
    prepareAssignment(
      operationId: string,
      current: RegistrationUser,
      user: User | null,
    ): AssignUser {
      uuid(operationId)
      if (user) validateUser(user, tenant)
      return Object.freeze({
        operationId,
        expectedRevision: revision(current.revision, true),
        user: user && Object.freeze({ ...user }),
      })
    },
    async assign(device: string, change: AssignUser) {
      uuid(change.operationId)
      revision(change.expectedRevision, true)
      if (change.user) validateUser(change.user, tenant)
      const result = await port.assign(deviceId(device), change)
      if (result.user) validateUser(result.user, tenant)
      const same =
        result.user === null
          ? change.user === null
          : change.user !== null &&
            result.user.tenantId === change.user.tenantId &&
            result.user.instanceId === change.user.instanceId &&
            result.user.principalId === change.user.principalId
      if (result.revision !== change.expectedRevision + 1 || !same)
        throw new Error('Wrong personnel receipt')
      return result
    },
    retirement: (id: string) => port.retirement(uuid(id)),
    async forceRetirement(id: string, operationId: string, reason: string) {
      uuid(id)
      uuid(operationId)
      verificationText(reason)
      const result = await port.forceRetirement(id, operationId, reason)
      if (
        result.retirementId !== id ||
        result.operationId !== operationId ||
        result.revocation !== 'pending'
      )
        throw new Error('Wrong retirement receipt')
      return result
    },
    async assetState(reference: DeviceRef, operationId: string, state: AssetState) {
      referenceKey(reference)
      uuid(operationId)
      if (!['active', 'archived', 'deleted'].includes(state)) throw new Error('Invalid asset state')
      const result = await port.assetState(reference, operationId, state)
      if (result.operationId !== operationId || result.state !== state)
        throw new Error('Wrong asset receipt')
      return result
    },
  })
}
export type Devices = ReturnType<typeof createDevices>
