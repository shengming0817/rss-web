import type { SessionOwner } from '@rss/auth-core'
import type { HttpTransport } from '@rss/api/identity'
import { bool, list, number, object, text, uuid } from './decode'

export interface Passkey {
  id: string
  label: string
}
function credential(value: unknown): Passkey {
  const v = object(value, ['id', 'label'])
  return { id: uuid(v['id']), label: text(v['label'], 128) }
}
function challenge(value: unknown) {
  const v = object(value, ['id', 'options', 'expires_at'])
  if (!v['options'] || typeof v['options'] !== 'object' || Array.isArray(v['options']))
    throw new Error('Invalid authenticator options')
  const options = v['options'] as Record<string, unknown>
  if (
    !options['publicKey'] ||
    typeof options['publicKey'] !== 'object' ||
    Array.isArray(options['publicKey'])
  )
    throw new Error('Invalid public-key options')
  return { id: uuid(v['id']), expiresAt: number(v['expires_at']), publicKey: options['publicKey'] }
}
/** The browser's native JSON parser owns WebAuthn option validation and conversion. */
export function createPasskeyClient(transport: HttpTransport, owner: SessionOwner) {
  function call<T>(
    method: 'GET' | 'POST',
    suffix: string,
    decode: (value: unknown) => T,
    body?: unknown,
  ) {
    return owner.business(({ tenant, csrf }) =>
      transport.request({
        method,
        path: `/api/v1/identity/tenants/{tenant}/webauthn/${suffix}`,
        pathParams: { tenant },
        ...(method === 'GET'
          ? {}
          : { headers: { 'X-Identity-Request': '1', 'X-CSRF-Token': csrf } }),
        ...(body === undefined ? {} : { body }),
        successStatus: 200,
        decode,
      }),
    )
  }
  function cancelled(value: unknown) {
    if (!bool(object(value, ['cancelled'])['cancelled']))
      throw new Error('Cancellation unconfirmed')
  }
  return {
    list: () => call('GET', 'credentials', (value) => list(value, credential, 32)),
    beginRegistration: (label: string) =>
      call('POST', 'register/begin', challenge, { label, recover: false }),
    finishRegistration: (id: string, response: PublicKeyCredentialJSON) =>
      call('POST', 'register/finish', credential, { id: uuid(id), response }),
    /** This proof authorizes adding a passkey only; no generic session-upgrade endpoint. */
    beginRegistrationAuthorization: () =>
      call('POST', 'authenticate/begin', challenge, { operation: { kind: 'register' } }),
    finishRegistrationAuthorization: (id: string, response: PublicKeyCredentialJSON) =>
      call(
        'POST',
        'authenticate/finish',
        (value) => number(object(value, ['expiresAt'])['expiresAt']),
        { id: uuid(id), response },
      ),
    cancelCeremony: (id: string) => call('POST', `${uuid(id)}/cancel`, cancelled),
    cancelAuthorization: () => call('POST', 'operation/cancel', cancelled),
  }
}
