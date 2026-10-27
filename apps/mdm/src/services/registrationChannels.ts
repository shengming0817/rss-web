import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import { array, closed, count, enumeration, nullable, string, unique, uuid } from './decode'

export const registrationChannels = ['agent', 'windows_mdm', 'macos_mdm'] as const
export type RegistrationChannel = (typeof registrationChannels)[number]
export function nativeChannel(source: 'mdm.windows' | 'mdm.apple'): RegistrationChannel {
  return source === 'mdm.windows' ? 'windows_mdm' : 'macos_mdm'
}
export type Admission = 'allowed' | 'paused'
function setting(value: unknown) {
  const v = closed(value, ['channel', 'revision', 'admission'])
  return {
    channel: enumeration(v['channel'], registrationChannels),
    revision: count(v['revision']),
    admission: enumeration(v['admission'], ['allowed', 'paused'] as const),
  }
}
export function decodeChannels(value: unknown, tenant: string, instance: string) {
  const v = closed(value, ['tenantId', 'instanceId', 'publicEndpoints', 'channels'])
  if (uuid(v['tenantId']) !== tenant || uuid(v['instanceId']) !== instance)
    throw new Error('Wrong registration binding')
  const channels = unique(
    array(v['channels'], (item) => {
      const c = closed(item, ['channel', 'revision', 'admission', 'availability', 'reason'])
      const result = {
        ...setting({ channel: c['channel'], revision: c['revision'], admission: c['admission'] }),
        availability: enumeration(c['availability'], ['unconfigured', 'ready', 'fault'] as const),
        reason: nullable(c['reason'], (r) =>
          enumeration(r, [
            'not_configured',
            'certificate_unavailable',
            'push_unavailable',
            'clock_unavailable',
          ] as const),
        ),
      }
      if (
        (result.availability === 'ready' && result.reason !== null) ||
        (result.availability === 'unconfigured' && result.reason !== 'not_configured') ||
        (result.availability === 'fault' &&
          (result.reason === null || result.reason === 'not_configured'))
      )
        throw new Error('Invalid registration readiness')
      return result
    }),
    (c) => c.channel,
  )
  if (channels.length !== registrationChannels.length)
    throw new Error('Missing registration channel')
  const e = closed(v['publicEndpoints'], [
    'console',
    'agent',
    'windowsEnrollment',
    'windowsManagement',
    'appleManagement',
  ])
  function endpoint(value: unknown) {
    const text = string(value),
      url = new URL(text)
    if (url.protocol !== 'https:' || url.username || url.password || url.hash)
      throw new Error('Invalid public endpoint')
    return text
  }
  return {
    channels,
    publicEndpoints: {
      console: endpoint(e['console']),
      agent: unique(array(e['agent'], endpoint), (v) => v),
      windowsEnrollment: nullable(e['windowsEnrollment'], endpoint),
      windowsManagement: unique(array(e['windowsManagement'], endpoint), (v) => v),
      appleManagement: nullable(e['appleManagement'], endpoint),
    },
  }
}
export type ChannelStatus = ReturnType<typeof decodeChannels>['channels'][number]
export function createRegistrationChannelsClient(transport: HttpTransport, tenant: string) {
  return {
    read: (instance: string) =>
      api.getApiV1RegistrationChannels(transport, {}, (v) => decodeChannels(v, tenant, instance)),
    change: (
      channel: RegistrationChannel,
      operationId: string,
      expectedRevision: number,
      admission: Admission,
    ) =>
      api.putApiV1RegistrationChannelsByChannelAdmission(
        transport,
        {
          pathParams: { channel: enumeration(channel, registrationChannels) },
          headers: { 'Idempotency-Key': uuid(operationId) },
          body: {
            expectedRevision: count(expectedRevision),
            admission: admission,
          },
        },
        (v) => {
          const result = setting(v)
          if (
            result.channel !== channel ||
            result.revision !== expectedRevision + 1 ||
            result.admission !== admission
          )
            throw new Error('Wrong admission receipt')
          return result
        },
      ),
  }
}
