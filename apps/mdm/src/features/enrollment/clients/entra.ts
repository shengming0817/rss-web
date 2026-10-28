import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import { array, count, nullable, unique, uuid } from '../../../services/decode'
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
  if (!wireSchemas.putApiV1WindowsEntraPolicyBody.validatePolicy(value))
    throw new Error('Invalid contract value')

  const v = value
  const result = {
    enabled: v['enabled'],
    allUsers: v['allUsers'],
    users: unique(array(v['users'], uuid), (v) => v),
    termsVersion: text(v['termsVersion'], 128),
    termsText: text(v['termsText'], 32768, true),
    allowBackground: v['allowBackground'],
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
  if (!wireSchemas.getApiV1WindowsEntraTermsContextResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  const result = {
    termsText: text(v['termsText'], 32768, true),
    termsVersion: text(v['termsVersion'], 128),
    mode: nullable(v['mode'], (v) => v),
    canDecline: v['canDecline'],
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
      api.getApiV1WindowsEntraPolicy(transport, {}, (v) => {
        const raw = v
        return { revision: count(raw['revision']), policy: entraPolicy(raw['policy']) }
      }),
    save: (expectedRevision: number, operationId: string, policy: ReturnType<typeof entraPolicy>) =>
      api.putApiV1WindowsEntraPolicy(
        transport,
        { body: { expectedRevision, operationId: uuid(operationId), policy: entraPolicy(policy) } },
        (v) => {
          const revision = count(v['revision'])
          if (revision !== expectedRevision + 1) throw new Error('Wrong revision')
          return revision
        },
      ),
    context: () => api.getApiV1WindowsEntraTermsContext(publicTransport, {}, termsContext),
  }
}
