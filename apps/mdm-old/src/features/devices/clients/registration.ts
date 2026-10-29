import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  count,
  enumeration,
  identifier,
  integer,
  nullable,
  unique,
  uuid,
} from '../../../services/decode'
import { user, type User } from '../../operations/clients/authorization'
import { decodeEnrollmentReceipt } from './enrollment'
import {
  registrationChannels,
  type RegistrationChannel,
} from '../../../services/registrationChannels'
export type Limits = Record<RegistrationChannel, number | null>
function limit(value: unknown) {
  const n = count(value)
  if (n > 4294967295) throw new Error('Invalid limit')
  return n
}
export function configuration(value: unknown) {
  if (!wireSchemas.getApiV1RegistrationQuotasDefaultsResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  const raw = v['limits']
  const limits: Limits = {
    agent: nullable(raw['agent'], limit),
    windows_mdm: nullable(raw['windows_mdm'], limit),
    macos_mdm: nullable(raw['macos_mdm'], limit),
  }
  return { revision: count(v['revision']), limits }
}
export function usage(value: unknown, tenant: string, expected?: User) {
  if (!wireSchemas.getApiV1SelfEnrollmentsResponse.validateUsage(value))
    throw new Error('Invalid contract value')

  const v = value
  const identity = user(
    { tenantId: v['tenantId'], instanceId: v['instanceId'], principalId: v['principalId'] },
    tenant,
  )
  if (
    expected &&
    (identity.instanceId !== expected.instanceId || identity.principalId !== expected.principalId)
  )
    throw new Error('Wrong usage user')
  const items = unique(
    array(v['channels'], (raw) => {
      const c = raw
      const result = {
        channel: enumeration(c['channel'], registrationChannels),
        limit: limit(c['limit']),
        active: count(c['active']),
        reserved: count(c['reserved']),
        used: count(c['used']),
        overLimit: count(c['overLimit']),
      }
      if (
        result.used !== result.active + result.reserved ||
        result.overLimit !== Math.max(0, result.used - result.limit)
      )
        throw new Error('Invalid usage accounting')
      return result
    }),
    (c) => c.channel,
  )
  if (items.length !== registrationChannels.length) throw new Error('Missing channel usage')
  return { ...identity, channels: items, asOf: integer(v['asOf']) }
}
export function createRegistrationClient(transport: HttpTransport, tenant: string) {
  const userParams = (target: User) => {
    const value = user(target, tenant)
    return { instance: value.instanceId, principal: value.principalId }
  }
  const responsibility = (value: unknown) => {
    if (!wireSchemas.getApiV1DevicesByDeviceRegistrationUserResponse.validateRoot(value))
      throw new Error('Invalid contract value')

    const v = value
    return { revision: count(v['revision']), user: nullable(v['user'], (v) => user(v, tenant)) }
  }
  return {
    me: () => api.getApiV1RegistrationQuotasMe(transport, {}, (v) => usage(v, tenant)),
    usage: (target: User) =>
      api.getApiV1RegistrationQuotasUsersByInstanceByPrincipalUsage(
        transport,
        { pathParams: userParams(target) },
        (v) => usage(v, tenant, target),
      ),
    configuration: (target?: User) =>
      target
        ? api.getApiV1RegistrationQuotasUsersByInstanceByPrincipal(
            transport,
            { pathParams: userParams(target) },
            configuration,
          )
        : api.getApiV1RegistrationQuotasDefaults(transport, {}, configuration),
    change: (operation: string, expectedRevision: number, limits: Limits, target?: User) => {
      const project = (v: unknown) => {
        const result = configuration(v)
        if (
          result.revision !== expectedRevision + 1 ||
          registrationChannels.some((c) => result.limits[c] !== limits[c])
        )
          throw new Error('Wrong quota receipt')
        return result
      }
      const input = {
        headers: { 'Idempotency-Key': uuid(operation) },
        body: { expectedRevision: count(expectedRevision), limits },
      }
      return target
        ? api.putApiV1RegistrationQuotasUsersByInstanceByPrincipal(
            transport,
            { ...input, pathParams: userParams(target) },
            project,
          )
        : api.putApiV1RegistrationQuotasDefaults(transport, input, project)
    },
    responsibility: (device: string) =>
      api.getApiV1DevicesByDeviceRegistrationUser(
        transport,
        { pathParams: { device: identifier(device) } },
        responsibility,
      ),
    assign: (device: string, operation: string, expectedRevision: number, target: User | null) =>
      api.putApiV1DevicesByDeviceRegistrationUser(
        transport,
        {
          pathParams: { device: identifier(device) },
          headers: { 'Idempotency-Key': uuid(operation) },
          body: { expectedRevision, user: target },
        },
        (v) => {
          const result = responsibility(v)
          if (
            result.revision !== expectedRevision + 1 ||
            JSON.stringify(result.user) !== JSON.stringify(target && user(target, tenant))
          )
            throw new Error('Wrong responsibility receipt')
          return result
        },
      ),
    enroll: (
      operation: string,
      password: string,
      source: 'mdm.windows' | 'mdm.apple',
      windowsProfile: 'Full' | 'Device',
    ) =>
      api.postApiV1SelfEnrollments(
        transport,
        {
          headers: { 'Idempotency-Key': uuid(operation) },
          body: { password, source, ...(source === 'mdm.windows' ? { windowsProfile } : {}) },
        },
        (v) => {
          const raw = v
          const { deviceId, operationId, ...status } = raw
          if (uuid(operationId) !== operation) throw new Error('Wrong self enrollment receipt')
          const result = decodeEnrollmentReceipt(status, uuid(raw['enrollmentId']))
          if (result.source !== source) throw new Error('Wrong source')
          return { deviceId: identifier(deviceId), operationId: operation, ...result }
        },
      ),
  }
}
