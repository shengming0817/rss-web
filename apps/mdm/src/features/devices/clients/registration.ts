import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
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
export const channels = ['agent', 'windows_mdm', 'macos_mdm'] as const
export type Channel = (typeof channels)[number]
export type Limits = Record<Channel, number | null>
function limit(value: unknown) {
  const n = count(value)
  if (n > 4294967295) throw new Error('Invalid limit')
  return n
}
export function configuration(value: unknown) {
  const v = closed(value, ['revision', 'limits'])
  const raw = closed(v['limits'], channels)
  const limits: Limits = {
    agent: nullable(raw['agent'], limit),
    windows_mdm: nullable(raw['windows_mdm'], limit),
    macos_mdm: nullable(raw['macos_mdm'], limit),
  }
  return { revision: count(v['revision']), limits }
}
export function usage(value: unknown, tenant: string, expected?: User) {
  const v = closed(value, ['tenantId', 'instanceId', 'principalId', 'channels', 'asOf'])
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
      const c = closed(raw, [
        'channel',
        'limit',
        'active',
        'reserved',
        'used',
        'overLimit',
        'canEnroll',
      ])
      const result = {
        channel: enumeration(c['channel'], channels),
        limit: limit(c['limit']),
        active: count(c['active']),
        reserved: count(c['reserved']),
        used: count(c['used']),
        overLimit: count(c['overLimit']),
        canEnroll: boolean(c['canEnroll']),
      }
      if (
        result.used !== result.active + result.reserved ||
        result.overLimit !== Math.max(0, result.used - result.limit) ||
        result.canEnroll !== result.used < result.limit
      )
        throw new Error('Invalid usage accounting')
      return result
    }),
    (c) => c.channel,
  )
  if (items.length !== channels.length) throw new Error('Missing channel usage')
  return { ...identity, channels: items, asOf: integer(v['asOf']) }
}
export function createRegistrationClient(transport: HttpTransport, tenant: string) {
  const configurationPath = (target?: User) => {
    if (target) user(target, tenant)
    return target
      ? `/api/v1/registration-quotas/users/${target.instanceId}/${target.principalId}`
      : '/api/v1/registration-quotas/defaults'
  }
  const responsibility = (value: unknown) => {
    const v = closed(value, ['revision', 'user'])
    return { revision: count(v['revision']), user: nullable(v['user'], (v) => user(v, tenant)) }
  }
  return {
    me: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/registration-quotas/me',
        successStatus: 200,
        decode: (v) => usage(v, tenant),
      }),
    usage: (target: User) =>
      transport.request({
        method: 'GET',
        path: `${configurationPath(target)}/usage`,
        successStatus: 200,
        decode: (v) => usage(v, tenant, target),
      }),
    configuration: (target?: User) =>
      transport.request({
        method: 'GET',
        path: configurationPath(target),
        successStatus: 200,
        decode: configuration,
      }),
    change: (operation: string, expectedRevision: number, limits: Limits, target?: User) =>
      transport.request({
        method: 'PUT',
        path: configurationPath(target),
        headers: { 'Idempotency-Key': uuid(operation) },
        body: { expectedRevision: count(expectedRevision), limits },
        successStatus: 200,
        decode: (v) => {
          const result = configuration(v)
          if (
            result.revision !== expectedRevision + 1 ||
            channels.some((c) => result.limits[c] !== limits[c])
          )
            throw new Error('Wrong quota receipt')
          return result
        },
      }),
    responsibility: (device: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/registration-user',
        pathParams: { device: identifier(device) },
        successStatus: 200,
        decode: responsibility,
      }),
    assign: (device: string, operation: string, expectedRevision: number, target: User | null) =>
      transport.request({
        method: 'PUT',
        path: '/api/v1/devices/{device}/registration-user',
        pathParams: { device: identifier(device) },
        headers: { 'Idempotency-Key': uuid(operation) },
        body: { expectedRevision, user: target },
        successStatus: 200,
        decode: (v) => {
          const result = responsibility(v)
          if (
            result.revision !== expectedRevision + 1 ||
            JSON.stringify(result.user) !== JSON.stringify(target && user(target, tenant))
          )
            throw new Error('Wrong responsibility receipt')
          return result
        },
      }),
    enroll: (
      operation: string,
      password: string,
      source: 'mdm.windows' | 'mdm.apple',
      windowsProfile: 'Full' | 'Device',
    ) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/self-enrollments',
        headers: { 'Idempotency-Key': uuid(operation) },
        body: { password, source, ...(source === 'mdm.windows' ? { windowsProfile } : {}) },
        successStatus: 200,
        decode: (v) => {
          const raw = closed(v, [
            'deviceId',
            'operationId',
            'enrollmentId',
            'status',
            'expiresAt',
            'registrationId',
            'source',
          ])
          const { deviceId, operationId, ...status } = raw
          if (uuid(operationId) !== operation) throw new Error('Wrong self enrollment receipt')
          const result = decodeEnrollmentReceipt(status, uuid(raw['enrollmentId']))
          if (result.source !== source) throw new Error('Wrong source')
          return { deviceId: identifier(deviceId), operationId: operation, ...result }
        },
      }),
  }
}
