export type * from './model'
export { setupPanes } from './model'
export {
  createAppleEnrollment,
  validateAdeCommand,
  validateAccountOrganization,
  validateAccountMapping,
  validateAdeConfiguration,
  type AppleEnrollment,
} from './apple'
export {
  configurationFilename,
  configurationIntent,
  nativeIntent,
  secret256,
  validateConfigurationUsage,
  validateAgentSettings,
  validateEntra,
  validateSetup,
  windowsEnrollmentLink,
} from './authoring'
import type {
  AgentSettingsValues,
  Channel,
  ChannelSetting,
  ConfigurationIntent,
  EnrollmentPort,
  EntraDetail,
  EntraPolicy,
  Limits,
  NativeIntent,
  PublicEnrollmentPort,
  QuotaConfiguration,
  User,
} from './model'
import {
  validateAgentSettings,
  channels,
  configurationIntent,
  nativeIntent,
  revision,
  secret256,
  uuid,
  validateEntra,
  validateLimits,
  validateUser,
} from './authoring'

export function createPublicEnrollment(port: PublicEnrollmentPort) {
  return Object.freeze({ ...port })
}
/** Secret-free intents and explicit submissions. Usage never becomes a browser admission decision. */
export function createEnrollment(port: EnrollmentPort, tenant: string, principal: string) {
  uuid(tenant)
  uuid(principal)
  return Object.freeze({
    ...port,
    prepareQuota(
      operationId: string,
      detail: QuotaConfiguration,
      limits: Limits,
      target: User | null,
    ) {
      uuid(operationId)
      revision(detail.revision)
      validateLimits(limits, target === null)
      if (target) validateUser(target, tenant)
      return Object.freeze({
        operationId,
        expectedRevision: detail.revision,
        limits: Object.freeze({ ...limits }),
        target: target && Object.freeze({ ...target }),
      })
    },
    async admission(
      channel: Channel,
      operationId: string,
      expectedRevision: number,
      admission: ChannelSetting['admission'],
    ) {
      uuid(operationId)
      revision(expectedRevision)
      if (!channels.includes(channel) || !['allowed', 'paused'].includes(admission))
        throw new Error('Invalid admission')
      const result = await port.admission(channel, operationId, expectedRevision, admission)
      if (
        result.channel !== channel ||
        result.revision !== expectedRevision + 1 ||
        result.admission !== admission
      )
        throw new Error('Wrong admission receipt')
      return result
    },
    async saveQuota(
      target: User | null,
      operationId: string,
      expectedRevision: number,
      limits: Limits,
    ) {
      uuid(operationId)
      revision(expectedRevision)
      validateLimits(limits, target === null)
      if (target) validateUser(target, tenant)
      const result = await port.saveQuota(target, operationId, expectedRevision, limits)
      if (
        result.revision !== expectedRevision + 1 ||
        channels.some((c) => result.limits[c] !== limits[c])
      )
        throw new Error('Wrong quota receipt')
      return result
    },
    async selfOptions() {
      const result = await port.selfOptions()
      validateUser(result.quotas, tenant)
      if (result.quotas.principalId !== principal) throw new Error('Wrong self enrollment user')
      return result
    },
    async createNative(intent: NativeIntent, password: string) {
      nativeIntent(intent.operationId, intent.source, intent.windowsProfile, intent.deviceId)
      secret256(password)
      const result = await port.createNative(intent, password)
      if (
        result.operationId !== intent.operationId ||
        result.source !== intent.source ||
        (intent.deviceId === undefined && !result.deviceId)
      )
        throw new Error('Wrong enrollment receipt')
      return result
    },
    async resume(id: string, operationId: string, password: string) {
      uuid(id)
      uuid(operationId)
      secret256(password)
      const result = await port.resume(id, operationId, password)
      if (result.enrollmentId !== id || result.operationId !== operationId)
        throw new Error('Wrong resumed enrollment')
      return result
    },
    async cancel(id: string, operationId: string) {
      uuid(id)
      uuid(operationId)
      const result = await port.cancel(id, operationId)
      if (
        result.enrollmentId !== id ||
        result.operationId !== operationId ||
        result.status !== 'cancelled'
      )
        throw new Error('Wrong cancellation receipt')
      return result
    },
    async issueConfiguration(intent: ConfigurationIntent, secret: string) {
      configurationIntent(intent)
      secret256(secret)
      const result = await port.issueConfiguration(intent, secret)
      try {
        const quantity = result.configuration.quantity,
          sameQuantity =
            quantity.kind === 'unlimited'
              ? intent.quantity.kind === 'unlimited'
              : intent.quantity.kind === 'finite' && quantity.count === intent.quantity.count
        if (
          result.configuration.tenantId !== tenant ||
          !sameQuantity ||
          result.configuration.targets.length !== intent.targets.length ||
          result.configuration.targets.some(
            (t, index) =>
              t.platform !== intent.targets[index]?.platform ||
              t.architecture !== intent.targets[index]?.architecture,
          )
        )
          throw new Error('Wrong issued configuration')
        return result
      } catch (error) {
        new Uint8Array(result.file.bytes).fill(0)
        throw error
      }
    },
    async saveAgentSettings(
      operationId: string,
      expectedRevision: number,
      values: AgentSettingsValues,
    ) {
      uuid(operationId)
      revision(expectedRevision)
      validateAgentSettings(values)
      const result = await port.saveAgentSettings(operationId, expectedRevision, values)
      if (
        result.revision !== expectedRevision + 1 ||
        JSON.stringify(result.values) !== JSON.stringify(values)
      )
        throw new Error('Wrong Agent settings receipt')
      return result
    },
    async saveEntra(operationId: string, expectedRevision: number, policy: EntraPolicy) {
      uuid(operationId)
      revision(expectedRevision)
      validateEntra(policy)
      const result = await port.saveEntra(operationId, expectedRevision, policy)
      if (result !== expectedRevision + 1) throw new Error('Wrong Entra policy receipt')
      return result
    },
    prepareEntra(operationId: string, detail: EntraDetail, policy: EntraPolicy) {
      uuid(operationId)
      revision(detail.revision)
      validateEntra(policy)
      if (
        detail.policy.termsText !== policy.termsText &&
        detail.policy.termsVersion === policy.termsVersion
      )
        throw new Error('Changed terms require a new version')
      return Object.freeze({
        operationId,
        expectedRevision: detail.revision,
        policy: Object.freeze({ ...policy, users: Object.freeze([...policy.users]) }),
      })
    },
  })
}
export type EnrollmentService = ReturnType<typeof createEnrollment>
