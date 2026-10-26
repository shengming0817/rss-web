import type { HttpTransport } from '@rss/api/identity'
import type { Credential } from '../model'
import { CapabilityUnavailable } from '../model'
import { closed, object, text, count, uuid, list, same } from '../model/decode'
import type { SecurityClient } from '../client'
export interface Challenge {
  id: string
  options: Record<string, unknown>
  expiresAt: number | null
}
export function challenge(value: unknown): Challenge {
  const v = closed(value, ['id', 'options'], ['expires_at'])
  return {
    id: uuid(v['id']),
    options: object(v['options']),
    expiresAt: v['expires_at'] === undefined ? null : count(v['expires_at']),
  }
}
interface JsonCredential extends PublicKeyCredential {
  toJSON(): unknown
}
interface BrowserCodec {
  parseCreationOptionsFromJSON(value: unknown): PublicKeyCredentialCreationOptions
  parseRequestOptionsFromJSON(value: unknown): PublicKeyCredentialRequestOptions
}
/** ref: W3C WebAuthn Level 3 §5.1.8/5.1.9/5.1.10; browser owns JSON/buffer conversion. */
export function createSecurityClient(transport: HttpTransport, tenant: string): SecurityClient {
  let active: string | null = null
  let busy = false
  const root = '/api/v1/identity/tenants/{tenant}/webauthn'
  const params = { tenant: uuid(tenant) }
  function codec() {
    if (typeof PublicKeyCredential === 'undefined' || !navigator.credentials)
      throw new CapabilityUnavailable('webauthn_browser')
    const api = PublicKeyCredential as unknown as BrowserCodec
    if (
      typeof api.parseCreationOptionsFromJSON !== 'function' ||
      typeof api.parseRequestOptionsFromJSON !== 'function'
    )
      throw new CapabilityUnavailable('webauthn_browser')
    return api
  }
  async function cancel() {
    const id = active
    active = null
    if (id)
      await transport.request({
        method: 'POST',
        path: root + '/{ceremony}/cancel',
        pathParams: { ...params, ceremony: id },
        successStatus: 200,
        decode: (v) => {
          same(closed(v, ['cancelled'])['cancelled'], true)
        },
      })
  }
  async function serialize<T>(work: () => Promise<T>) {
    if (busy) throw new Error('Ceremony busy')
    busy = true
    try {
      return await work()
    } finally {
      busy = false
    }
  }
  async function prove(value: Challenge, signal: AbortSignal) {
    codec()
    active = value.id
    let sent = false
    try {
      if (value.expiresAt !== null && value.expiresAt <= Date.now() / 1000)
        throw new Error('Ceremony expired')
      const cred = await navigator.credentials.get({
        publicKey: codec().parseRequestOptionsFromJSON(value.options['publicKey']),
        signal,
      })
      if (!cred || signal.aborted) throw new Error('Ceremony cancelled')
      if (typeof (cred as JsonCredential).toJSON !== 'function')
        throw new CapabilityUnavailable('webauthn_browser')
      sent = true
      await transport.request({
        method: 'POST',
        path: root + '/authenticate/finish',
        pathParams: params,
        body: { id: value.id, response: (cred as JsonCredential).toJSON() },
        signal,
        successStatus: 200,
        decode: (v) => count(closed(v, ['expiresAt'])['expiresAt']),
      })
      active = null
    } catch (error) {
      if (!sent) await cancel().catch(() => undefined)
      else active = null
      throw error
    }
  }
  async function authenticate(
    operation: { kind: 'register' } | { kind: 'remove'; credential: string },
    signal: AbortSignal,
  ) {
    codec()
    const value = await transport.request({
      method: 'POST',
      path: root + '/authenticate/begin',
      pathParams: params,
      body: { operation },
      signal,
      successStatus: 200,
      decode: challenge,
    })
    await prove(value, signal)
  }
  return {
    list: (signal) =>
      transport.request({
        method: 'GET',
        path: root + '/credentials',
        pathParams: params,
        signal,
        successStatus: 200,
        decode: (v) =>
          list(v, (raw) => {
            const r = closed(raw, ['id', 'label'])
            return { id: uuid(r['id']), label: text(r['label']) }
          }),
      }),
    register: (label, signal) =>
      serialize(async () => {
        codec()
        const value = await transport.request({
          method: 'POST',
          path: root + '/register/begin',
          pathParams: params,
          body: { label: text(label, 128), recover: false },
          signal,
          successStatus: 200,
          decode: challenge,
        })
        active = value.id
        let sent = false
        try {
          if (value.expiresAt !== null && value.expiresAt <= Date.now() / 1000)
            throw new Error('Ceremony expired')
          const cred = await navigator.credentials.create({
            publicKey: codec().parseCreationOptionsFromJSON(value.options['publicKey']),
            signal,
          })
          if (!cred || signal.aborted) throw new Error('Ceremony cancelled')
          if (typeof (cred as JsonCredential).toJSON !== 'function')
            throw new CapabilityUnavailable('webauthn_browser')
          sent = true
          const result = await transport.request({
            method: 'POST',
            path: root + '/register/finish',
            pathParams: params,
            body: { id: value.id, response: (cred as JsonCredential).toJSON() },
            signal,
            successStatus: 200,
            decode(v): Credential {
              const r = closed(v, ['id', 'label'])
              return { id: uuid(r['id']), label: text(r['label']) }
            },
          })
          active = null
          return result
        } catch (error) {
          if (!sent) await cancel().catch(() => undefined)
          else active = null
          throw error
        }
      }),
    remove: (id, signal) =>
      serialize(async () => {
        await authenticate({ kind: 'remove', credential: uuid(id) }, signal)
        await transport.request({
          method: 'POST',
          path: root + '/credentials/{credential}/remove',
          pathParams: { ...params, credential: id },
          signal,
          successStatus: 200,
          decode: (v) => {
            same(closed(v, ['removed'])['removed'], true)
          },
        })
      }),
    reauthenticate: (signal) => serialize(() => authenticate({ kind: 'register' }, signal)),
    prove: (value, signal) => serialize(() => prove(value, signal)),
    cancel,
  }
}
