import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  nullable,
  unique,
  uuid,
} from '../../../services/decode'
import { base64url } from './packages'
export function text(value: unknown, max: number, multiline = false) {
  if (
    typeof value !== 'string' ||
    new TextEncoder().encode(value).byteLength > max ||
    [...value].some(
      (c) =>
        (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) &&
        !(multiline && ['\n', '\r', '\t'].includes(c)),
    )
  )
    throw new Error('Invalid text')
  return value
}
export function entraPolicy(value: unknown) {
  const v = closed(value, [
    'enabled',
    'allUsers',
    'users',
    'termsVersion',
    'termsText',
    'allowBackground',
  ])
  const result = {
    enabled: boolean(v['enabled']),
    allUsers: boolean(v['allUsers']),
    users: unique(array(v['users'], uuid), (v) => v),
    termsVersion: text(v['termsVersion'], 128),
    termsText: text(v['termsText'], 32768, true),
    allowBackground: boolean(v['allowBackground']),
  }
  if (
    result.users.length > 256 ||
    (result.allUsers && result.users.length) ||
    (result.enabled &&
      (!result.termsVersion ||
        !result.termsText.trim() ||
        (!result.allUsers && !result.users.length)))
  )
    throw new Error('Invalid policy')
  return result
}
export function termsContext(value: unknown) {
  const v = closed(value, [
    'termsText',
    'termsVersion',
    'mode',
    'canDecline',
    'csrfToken',
    'expiresAt',
  ])
  const result = {
    termsText: text(v['termsText'], 32768, true),
    termsVersion: text(v['termsVersion'], 128),
    mode: nullable(v['mode'], (v) => enumeration(v, ['azureadjoin'] as const)),
    canDecline: boolean(v['canDecline']),
    csrfToken: base64url(v['csrfToken'], 32),
    expiresAt: count(v['expiresAt']),
  }
  if (
    !result.termsVersion ||
    !result.termsText.trim() ||
    result.canDecline !== (result.mode === null) ||
    !result.expiresAt
  )
    throw new Error('Invalid terms context')
  return result
}
export function createEntraClient(transport: HttpTransport, publicTransport: HttpTransport) {
  return {
    policy: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/windows/entra-policy',
        successStatus: 200,
        decode: (v) => {
          const raw = closed(v, ['revision', 'policy'])
          return { revision: count(raw['revision']), policy: entraPolicy(raw['policy']) }
        },
      }),
    save: (expectedRevision: number, operationId: string, policy: ReturnType<typeof entraPolicy>) =>
      transport.request({
        method: 'PUT',
        path: '/api/v1/windows/entra-policy',
        body: { expectedRevision, operationId: uuid(operationId), policy: entraPolicy(policy) },
        successStatus: 200,
        decode: (v) => {
          const revision = count(closed(v, ['revision'])['revision'])
          if (revision !== expectedRevision + 1) throw new Error('Wrong revision')
          return revision
        },
      }),
    context: () =>
      publicTransport.request({
        method: 'GET',
        path: '/api/v1/windows/entra/terms/context',
        successStatus: 200,
        decode: termsContext,
      }),
  }
}
