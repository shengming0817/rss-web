import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { projectedPage, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import {
  configurationFilename,
  validateConfigurationUsage,
  type Channels,
  type Configuration,
  type ConfigurationDetail,
  type ConfigurationRow,
  type Enrollment,
  type EnrollmentPort,
  type EnrollmentReceipt,
  type Installer,
  type NativeInstructions,
  type Page,
  type PublicEnrollmentPort,
  type Quantity,
  type Registration,
  type Target,
  type Terms,
  type Usage,
  type User,
} from '@rss/mdm-enrollment'
import { base64url as canonicalBase64, count, enumeration, positive, text, uuid } from './decode'
import { attachment } from './download'

function identifier(value: unknown): string {
  const result = text(value)
  if (!result || result.trim() !== result || result.length > 256 || /\p{Cc}/u.test(result))
    throw new Error('Invalid identifier')
  return result
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('Invalid integer')
  return value
}
function https(value: string, originOnly = false): string {
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    (originOnly && url.origin !== value)
  )
    throw new Error('Invalid public endpoint')
  return value
}
function user(value: User, tenant: string): User {
  if (uuid(value.tenantId) !== tenant) throw new Error('Wrong registration tenant')
  uuid(value.instanceId)
  uuid(value.principalId)
  return value
}
function usage(value: unknown, tenant: string, expected?: User): Usage {
  if (!schema.getApiV1SelfEnrollmentsResponse.validateUsage(value))
    throw new Error('Invalid usage contract')
  user(value, tenant)
  if (
    expected &&
    (value.instanceId !== expected.instanceId || value.principalId !== expected.principalId)
  )
    throw new Error('Wrong quota user')
  const names = new Set(value.channels.map((c) => c.channel))
  if (names.size !== 3 || value.channels.length !== 3) throw new Error('Missing quota channels')
  for (const channel of value.channels) {
    for (const n of [
      channel.limit,
      channel.active,
      channel.reserved,
      channel.used,
      channel.overLimit,
    ])
      count(n)
    if (
      channel.used !== channel.active + channel.reserved ||
      channel.overLimit !== Math.max(0, channel.used - channel.limit)
    )
      throw new Error('Invalid quota accounting')
  }
  integer(value.asOf)
  return value
}
function channelStatus(value: unknown, tenant: string): Channels {
  if (!schema.getApiV1RegistrationChannelsResponse.validateRoot(value))
    throw new Error('Invalid registration channels')
  if (uuid(value.tenantId) !== tenant) throw new Error('Wrong registration tenant')
  uuid(value.instanceId)
  if (value.channels.length !== 3 || new Set(value.channels.map((c) => c.channel)).size !== 3)
    throw new Error('Missing registration channels')
  for (const c of value.channels) {
    count(c.revision)
    if (
      (c.availability === 'ready' && c.reason !== null) ||
      (c.availability === 'unconfigured' && c.reason !== 'not_configured') ||
      (c.availability === 'fault' && (c.reason === null || c.reason === 'not_configured'))
    )
      throw new Error('Invalid registration availability')
  }
  const endpoints = value.publicEndpoints
  for (const endpoint of [
    endpoints.console,
    ...endpoints.agent,
    ...endpoints.windowsManagement,
    endpoints.windowsEnrollment,
    endpoints.appleManagement,
  ])
    if (endpoint !== null) https(endpoint)
  return value
}
function receipt(
  value: unknown,
  operationId: string,
  source?: string,
  id?: string,
): EnrollmentReceipt {
  if (!schema.postApiV1EnrollmentsResponse.validateRoot(value))
    throw new Error('Invalid enrollment receipt')
  if (
    value.operationId !== operationId ||
    (id !== undefined && value.enrollmentId !== id) ||
    (source !== undefined && value.source !== source)
  )
    throw new Error('Wrong enrollment receipt')
  uuid(value.enrollmentId)
  if (value.registrationId !== null) uuid(value.registrationId)
  return {
    ...value,
    source: enumeration(value.source, ['mdm.windows', 'mdm.apple'] as const),
    status: enumeration(value.status, ['pending', 'bound', 'cancelled', 'expired'] as const),
  }
}
function native(value: unknown, id: string): Enrollment {
  if (!schema.getApiV1EnrollmentsByIdResponse.validateRoot(value) || value.enrollmentId !== id)
    throw new Error('Wrong enrollment detail')
  const raw = value.instructions
  let instructions: NativeInstructions
  switch (raw.platform) {
    case 'windows':
      instructions = {
        platform: raw.platform,
        server: https(raw.server),
        discoveryUrl: https(raw.discoveryUrl),
        username: identifier(raw.username),
        windowsProfile: raw.windowsProfile,
        requiresLocalAdministrator: raw.requiresLocalAdministrator,
      }
      break
    case 'windows_entra':
      if (raw.windowsProfile !== 'Full' || raw.enrollmentMethod !== 'entra_user_credential')
        throw new Error('Invalid enterprise native handoff')
      instructions = {
        platform: raw.platform,
        discoveryUrl: https(raw.discoveryUrl),
        windowsProfile: 'Full',
        enrollmentMethod: 'entra_user_credential',
      }
      break
    case 'macos':
      if (
        raw.profileUrl !== api.postApiV1EnrollmentsByIdProfile.url({ id }) ||
        raw.enrollmentMethod !== 'profile_based_device_enrollment'
      )
        throw new Error('Wrong profile locator')
      instructions = {
        platform: raw.platform,
        profileUrl: raw.profileUrl,
        enrollmentMethod: 'profile_based_device_enrollment',
      }
      break
    case 'macos_account':
      if (raw.enrollmentMethod !== 'account_driven_device_enrollment')
        throw new Error('Invalid account enrollment method')
      instructions = {
        platform: raw.platform,
        managedAccount: identifier(raw.managedAccount),
        enrollmentMethod: 'account_driven_device_enrollment',
      }
      break
    case 'macos_ade':
      if (raw.enrollmentMethod !== 'automated_device_enrollment')
        throw new Error('Invalid automated enrollment method')
      instructions = { platform: raw.platform, enrollmentMethod: 'automated_device_enrollment' }
      break
    case 'unavailable':
      instructions = { platform: raw.platform }
      break
  }
  return {
    ...value,
    source: enumeration(value.source, ['mdm.windows', 'mdm.apple'] as const),
    instructions,
  }
}
function quantity(value: unknown): Quantity {
  if (!schema.postApiV1AgentConfigurationsResponse.validateQuantity(value))
    throw new Error('Invalid configuration quantity')
  if (value.kind === 'finite' && (!positive(value.count) || value.count > 4294967295))
    throw new Error('Invalid configuration quantity')
  return value.kind === 'finite' ? { kind: value.kind, count: value.count } : { kind: value.kind }
}
function targets(value: unknown): Target[] {
  if (!Array.isArray(value) || !value.length || value.length > 4) throw new Error('Invalid targets')
  const result = value.map((t: unknown) => {
    if (!schema.getApiV1AgentPackagesResponse.validateTarget(t))
      throw new Error('Invalid installation target')
    return { platform: t.platform, architecture: t.architecture }
  })
  if (new Set(result.map((t) => `${t.platform}/${t.architecture}`)).size !== result.length)
    throw new Error('Duplicate installation target')
  return result
}
function configuration(value: unknown, tenant: string, service: string): Configuration {
  if (!schema.postApiV1AgentConfigurationsResponse.validateConfiguration(value))
    throw new Error('Invalid configuration')
  const signed = value.connections,
    connections = signed.configuration
  if (
    value.wireVersion !== 1 ||
    connections.wireVersion !== 1 ||
    value.tenantId !== tenant ||
    connections.tenantId !== tenant ||
    connections.serviceId !== service
  )
    throw new Error('Wrong configuration service or tenant')
  canonicalBase64(signed.signature, 64)
  if (
    !connections.origins.length ||
    connections.origins.length > 8 ||
    new Set(connections.origins).size !== connections.origins.length ||
    !connections.origins.includes(connections.preferredOrigin) ||
    connections.origins.some(
      (origin, index) =>
        origin.length > 2048 || (index > 0 && connections.origins[index - 1]! >= origin),
    ) ||
    !/^[A-Za-z0-9._-]{1,128}$/.test(connections.keyId) ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.keyId)
  )
    throw new Error('Invalid connection origins or key')
  connections.origins.forEach((origin) => https(origin, true))
  return {
    configurationId: uuid(value.configurationId),
    tenantId: tenant,
    serviceId: service,
    connectionRevision: positive(connections.revision),
    preferredOrigin: connections.preferredOrigin,
    origins: [...connections.origins],
    targets: targets(value.targets),
    expiresAt: positive(value.expiresAt),
    quantity: quantity(value.quantity),
    keyId: identifier(value.keyId),
  }
}
function configurationDetail(
  value: unknown,
  tenant: string,
  service: string,
  id?: string,
): ConfigurationDetail {
  if (!schema.getApiV1AgentConfigurationsByIdResponse.validateRoot(value))
    throw new Error('Invalid configuration detail')
  const result = {
    ...value,
    state: enumeration(value.state, ['available', 'revoked', 'expired'] as const),
    configuration: configuration(value.configuration, tenant, service),
    responsibleUser: value.responsibleUser === null ? null : user(value.responsibleUser, tenant),
  }
  if (id !== undefined && result.configuration.configurationId !== id)
    throw new Error('Wrong configuration')
  validateConfigurationUsage(result)
  return result
}
function installer(value: unknown, tenant: string): Installer {
  if (!schema.postApiV1AgentPackagesResponse.validateRoot(value))
    throw new Error('Invalid installer contract')
  if (
    value.tenantId !== tenant ||
    !positive(value.length) ||
    /[/\\\p{Cc}]/u.test(value.filename) ||
    !value.filename ||
    value.filename.length > 255 ||
    (value.target.platform === 'macos') !== (value.format === 'macos_pkg') ||
    !value.filename
      .toLowerCase()
      .endsWith(
        { windows_exe: '.exe', windows_msi: '.msi', windows_msix: '.msix', macos_pkg: '.pkg' }[
          value.format
        ],
      )
  )
    throw new Error('Invalid installer')
  uuid(value.releaseId)
  return value
}
export function createPublicEnrollmentAdapter(
  transport: HttpTransport,
  tenant: string,
): PublicEnrollmentPort {
  uuid(tenant)
  return {
    packages: () =>
      api.getApiV1AgentEnrollPackages(transport, {}, (value) => {
        const items = value.map((v) => installer(v, tenant))
        if (new Set(items.map((p) => p.releaseId)).size !== items.length)
          throw new Error('Duplicate installer')
        return items
      }),
    package: (id) =>
      api.getApiV1AgentEnrollPackagesById(transport, { pathParams: { id: uuid(id) } }, (value) => {
        const item = installer(value, tenant)
        if (item.releaseId !== id) throw new Error('Wrong installer')
        return item
      }),
    packageUrl: (id) => api.getApiV1AgentEnrollPackagesByIdContent.url({ id: uuid(id) }),
    terms: () =>
      api.getApiV1WindowsEntraTermsContext(transport, {}, (value) => {
        canonicalBase64(value.csrfToken, 32)
        if (
          !value.termsVersion ||
          !value.termsText.trim() ||
          value.canDecline !== (value.mode === null) ||
          !positive(value.expiresAt)
        )
          throw new Error('Invalid terms context')
        return value satisfies Terms
      }),
    termsFinishUrl: () => api.postApiV1WindowsEntraTermsFinish.url({}),
    appleBridgeUrl: () => api.getApiV1AppleAccountEnrollmentAuthenticate.url({}),
  }
}
/** Public profile-password failures do not invalidate the console's cookie session. */
export function createEnrollmentAdapter(
  transport: HttpTransport,
  publicTransport: HttpTransport,
  tenant: string,
  service: string,
): EnrollmentPort {
  uuid(tenant)
  uuid(service)
  const quotaParams = (target: User) => {
    user(target, tenant)
    return { instance: target.instanceId, principal: target.principalId }
  }
  const configurationFields = {
    configurationId: uuid,
    state: (v: unknown) => enumeration(v, ['available', 'expired', 'revoked'] as const),
    createdAt: integer,
    expiresAt: integer,
    createdBy: identifier,
    targets,
    quantity,
    reserved: count,
    consumed: count,
    remaining: (v: unknown) => (v === null ? null : count(v)),
  }
  return {
    channels: () =>
      api.getApiV1RegistrationChannels(transport, {}, (value) => channelStatus(value, tenant)),
    admission: (channel, operationId, expectedRevision, admission) =>
      api.putApiV1RegistrationChannelsByChannelAdmission(transport, {
        pathParams: { channel },
        headers: { 'Idempotency-Key': uuid(operationId) },
        body: { expectedRevision, admission },
      }),
    quota: (target) =>
      target
        ? api.getApiV1RegistrationQuotasUsersByInstanceByPrincipal(transport, {
            pathParams: quotaParams(target),
          })
        : api.getApiV1RegistrationQuotasDefaults(transport, {}),
    usage: (target) =>
      target
        ? api.getApiV1RegistrationQuotasUsersByInstanceByPrincipalUsage(
            transport,
            { pathParams: quotaParams(target) },
            (value) => usage(value, tenant, target),
          )
        : api.getApiV1RegistrationQuotasMe(transport, {}, (value) => usage(value, tenant)),
    saveQuota: (target, operationId, expectedRevision, limits) => {
      const input = {
        headers: { 'Idempotency-Key': uuid(operationId) },
        body: { expectedRevision, limits },
      }
      return target
        ? api.putApiV1RegistrationQuotasUsersByInstanceByPrincipal(transport, {
            ...input,
            pathParams: quotaParams(target),
          })
        : api.putApiV1RegistrationQuotasDefaults(transport, input)
    },
    selfOptions: () =>
      api.getApiV1SelfEnrollments(transport, {}, (value) => ({
        channels: value.channels.map((c) => ({
          ...c,
          source: enumeration(c.source, ['mdm.windows', 'mdm.apple'] as const),
        })),
        quotas: usage(value.quotas, tenant),
      })),
    createNative: (intent, password) => {
      const body = {
          password,
          source: intent.source,
          ...(intent.source === 'mdm.windows' ? { windowsProfile: intent.windowsProfile } : {}),
        },
        headers = { 'Idempotency-Key': uuid(intent.operationId) }
      return intent.deviceId === undefined
        ? api.postApiV1SelfEnrollments(transport, { headers, body }, (value) => {
            const { deviceId, ...status } = value
            return {
              ...receipt(status, intent.operationId, intent.source),
              deviceId: identifier(deviceId),
            }
          })
        : api.postApiV1Enrollments(
            transport,
            { headers, body: { ...body, deviceId: identifier(intent.deviceId) } },
            (value) => receipt(value, intent.operationId, intent.source),
          )
    },
    enrollment: (id) =>
      api.getApiV1EnrollmentsById(transport, { pathParams: { id: uuid(id) } }, (value) =>
        native(value, id),
      ),
    resume: (id, operationId, password) =>
      api.postApiV1EnrollmentsByIdResume(
        transport,
        {
          pathParams: { id: uuid(id) },
          headers: { 'Idempotency-Key': uuid(operationId) },
          body: { password },
        },
        (value) => receipt(value, operationId, undefined, id),
      ),
    cancel: (id, operationId) =>
      api.postApiV1EnrollmentsByIdCancel(
        transport,
        {
          pathParams: { id: uuid(id) },
          headers: { 'Idempotency-Key': uuid(operationId) },
          body: {},
        },
        (value) => receipt(value, operationId, undefined, id),
      ),
    profile: (id, password) =>
      api.postApiV1EnrollmentsByIdProfile(
        publicTransport,
        { pathParams: { id: uuid(id) }, body: { password } },
        (value) =>
          attachment(
            value,
            'application/x-apple-aspen-config',
            'RSS-MDM.mobileconfig',
            4 * 1024 * 1024,
          ),
      ),
    registrations: (device, query) => {
      if (query.fields && !query.fields.includes('registrationId'))
        throw new Error('Registration identity required')
      return api.getApiV1DevicesByDeviceRegistrations(
        transport,
        {
          pathParams: { device: identifier(device) },
          query: queryParameters({ limit: 20, ...query }),
        },
        (value) =>
          projectedPage(
            value,
            {
              registrationId: uuid,
              enrollmentId: (v: unknown) => (v === null ? null : uuid(v)),
              agentGrantId: (v: unknown) => (v === null ? null : uuid(v)),
              userContextId: (v: unknown) => (v === null ? null : uuid(v)),
              source: (v: unknown) =>
                enumeration(v, ['mdm.windows', 'mdm.apple', 'agent.builtin'] as const),
              generation: positive,
              status: (v: unknown) => enumeration(v, ['active', 'superseded', 'revoked'] as const),
            },
            query.fields,
            ['registrationId'],
          ) as Page<Registration>,
      )
    },
    revokeRegistration: (device, registration, operationId) =>
      api.postApiV1DevicesByDeviceRegistrationsByRegistrationRevoke(
        transport,
        {
          pathParams: { device: identifier(device), registration: uuid(registration) },
          headers: { 'Idempotency-Key': uuid(operationId) },
          body: {},
        },
        (value) => {
          if (value.operation_id !== operationId || value.registration !== registration)
            throw new Error('Wrong registration revocation')
          return { operationId, registration }
        },
      ),
    agentSettings: () => api.getApiV1AgentEnrollmentSettings(transport, {}),
    saveAgentSettings: (operationId, expectedRevision, values) =>
      api.putApiV1AgentEnrollmentSettings(transport, {
        body: {
          operationId: uuid(operationId),
          expectedRevision,
          values: { ...values, platforms: [...values.platforms] },
        },
      }),
    configurations: (query) => {
      if (query.fields && !query.fields.includes('configurationId'))
        throw new Error('Configuration identity required')
      return api.getApiV1AgentConfigurations(
        transport,
        { query: queryParameters({ limit: 20, ...query }) },
        (value) =>
          projectedPage(value, configurationFields, query.fields, [
            'configurationId',
          ]) as Page<ConfigurationRow>,
      )
    },
    configuration: (id) =>
      api.getApiV1AgentConfigurationsById(transport, { pathParams: { id: uuid(id) } }, (value) =>
        configurationDetail(value, tenant, service, id),
      ),
    configurationOperation: (id) =>
      api.getApiV1AgentConfigurationOperationsById(
        transport,
        { pathParams: { id: uuid(id) } },
        (value) => (value === null ? null : configurationDetail(value, tenant, service)),
      ),
    issueConfiguration: (intent, secret) =>
      api.postApiV1AgentConfigurations(
        transport,
        {
          body: {
            ...intent,
            quantity: { ...intent.quantity },
            targets: intent.targets.map((t) => ({ ...t })),
            secret,
          },
        },
        (value) => {
          const file = attachment(value, 'application/json', configurationFilename, 16384)
          try {
            const raw: unknown = JSON.parse(
              new TextDecoder('utf-8', { fatal: true }).decode(file.bytes),
            )
            if (!schema.postApiV1AgentConfigurationsResponse.validateRoot(raw))
              throw new Error('Invalid configuration document')
            canonicalBase64(raw.secret, 32)
            canonicalBase64(raw.signature, 64)
            if (raw.secret !== secret) throw new Error('Wrong configuration secret')
            return { file, configuration: configuration(raw.configuration, tenant, service) }
          } catch (error) {
            new Uint8Array(file.bytes).fill(0)
            throw error
          }
        },
      ),
    revokeConfiguration: (id, operationId) =>
      api.postApiV1AgentConfigurationsByIdRevoke(transport, {
        pathParams: { id: uuid(id) },
        body: { operationId: uuid(operationId) },
      }),
    entra: () => api.getApiV1WindowsEntraPolicy(transport, {}),
    saveEntra: (operationId, expectedRevision, policy) =>
      api.putApiV1WindowsEntraPolicy(
        transport,
        {
          body: {
            operationId: uuid(operationId),
            expectedRevision,
            policy: { ...policy, users: [...policy.users] },
          },
        },
        (value) => count(value.revision),
      ),
  }
}
