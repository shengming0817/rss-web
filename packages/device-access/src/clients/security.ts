import type { HttpTransport } from '@rss/api/identity'
import type { Credential } from '../model'
import { CapabilityUnavailable, CredentialWriteNotDispatched } from '../model'
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
interface Task {
  controller: AbortController
  epoch: number
  credentialWriteSent: boolean
  proofFinishSent: boolean
}
/** ref: W3C WebAuthn Level 3 §5.1.8/5.1.9/5.1.10. One cancellable browser ceremony owner. */
export function createSecurityClient(transport: HttpTransport, tenant: string): SecurityClient {
  let task: Task | null = null,
    active: string | null = null,
    epoch = 0,
    grantMayExist = false
  const root = '/api/v1/identity/tenants/{tenant}/webauthn',
    params = { tenant: uuid(tenant) }
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
  function check(t: Task) {
    if (t.epoch !== epoch || t.controller.signal.aborted)
      throw new DOMException('Ceremony cancelled', 'AbortError')
  }
  async function cancelCeremony(id: string) {
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
  async function cancelGrant() {
    await transport.request({
      method: 'POST',
      path: root + '/operation/cancel',
      pathParams: params,
      successStatus: 200,
      decode: (v) => {
        same(closed(v, ['cancelled'])['cancelled'], true)
      },
    })
    grantMayExist = false
  }
  async function cancel() {
    epoch++
    task?.controller.abort()
    const id = active,
      grant = grantMayExist
    active = null
    grantMayExist = false
    try {
      if (id) await cancelCeremony(id)
    } finally {
      if (grant) await cancelGrant()
    }
  }
  async function run<T>(external: AbortSignal, work: (t: Task) => Promise<T>): Promise<T> {
    if (task) throw new CredentialWriteNotDispatched('busy')
    const t: Task = {
      controller: new AbortController(),
      epoch,
      credentialWriteSent: false,
      proofFinishSent: false,
    }
    task = t
    const abort = () => t.controller.abort()
    external.addEventListener('abort', abort, { once: true })
    if (external.aborted) abort()
    try {
      check(t)
      codec()
      return await work(t)
    } catch (error) {
      const pending = active
      active = null
      if (!t.credentialWriteSent) {
        if (pending) await cancelCeremony(pending).catch(() => undefined)
        if (t.proofFinishSent) await cancelGrant().catch(() => undefined)
        throw new CredentialWriteNotDispatched(
          error instanceof CapabilityUnavailable
            ? 'unsupported'
            : error instanceof DOMException
              ? 'cancelled'
              : 'precondition',
          error,
        )
      }
      throw error
    } finally {
      external.removeEventListener('abort', abort)
      if (task === t) task = null
    }
  }
  async function prove(value: Challenge, t: Task) {
    active = value.id
    check(t)
    if (value.expiresAt !== null && value.expiresAt <= Date.now() / 1000)
      throw new DOMException('Ceremony expired', 'NotAllowedError')
    const cred = await navigator.credentials.get({
      publicKey: codec().parseRequestOptionsFromJSON(value.options['publicKey']),
      signal: t.controller.signal,
    })
    check(t)
    if (!cred) throw new DOMException('Ceremony cancelled', 'NotAllowedError')
    if (typeof (cred as JsonCredential).toJSON !== 'function')
      throw new CapabilityUnavailable('webauthn_browser')
    grantMayExist = true
    t.proofFinishSent = true
    await transport.request({
      method: 'POST',
      path: root + '/authenticate/finish',
      pathParams: params,
      body: { id: value.id, response: (cred as JsonCredential).toJSON() },
      signal: t.controller.signal,
      successStatus: 200,
      decode: (v) => count(closed(v, ['expiresAt'])['expiresAt']),
    })
    check(t)
    active = null
  }
  async function authenticate(
    operation: { kind: 'register' } | { kind: 'remove'; credential: string },
    t: Task,
  ) {
    const value = await transport.request({
      method: 'POST',
      path: root + '/authenticate/begin',
      pathParams: params,
      body: { operation },
      signal: t.controller.signal,
      successStatus: 200,
      decode: challenge,
    })
    await prove(value, t)
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
      run(signal, async (t) => {
        const value = await transport.request({
          method: 'POST',
          path: root + '/register/begin',
          pathParams: params,
          body: { label: text(label, 128), recover: false },
          signal: t.controller.signal,
          successStatus: 200,
          decode: challenge,
        })
        active = value.id
        check(t)
        if (value.expiresAt !== null && value.expiresAt <= Date.now() / 1000)
          throw new DOMException('Ceremony expired', 'NotAllowedError')
        const cred = await navigator.credentials.create({
          publicKey: codec().parseCreationOptionsFromJSON(value.options['publicKey']),
          signal: t.controller.signal,
        })
        check(t)
        if (!cred) throw new DOMException('Ceremony cancelled', 'NotAllowedError')
        if (typeof (cred as JsonCredential).toJSON !== 'function')
          throw new CapabilityUnavailable('webauthn_browser')
        t.credentialWriteSent = true
        const result = await transport.request({
          method: 'POST',
          path: root + '/register/finish',
          pathParams: params,
          body: { id: value.id, response: (cred as JsonCredential).toJSON() },
          signal: t.controller.signal,
          successStatus: 200,
          decode(v): Credential {
            const r = closed(v, ['id', 'label'])
            return { id: uuid(r['id']), label: text(r['label']) }
          },
        })
        check(t)
        active = null
        return result
      }),
    remove: (id, signal) =>
      run(signal, async (t) => {
        await authenticate({ kind: 'remove', credential: uuid(id) }, t)
        check(t)
        t.credentialWriteSent = true
        await transport.request({
          method: 'POST',
          path: root + '/credentials/{credential}/remove',
          pathParams: { ...params, credential: id },
          signal: t.controller.signal,
          successStatus: 200,
          decode: (v) => {
            same(closed(v, ['removed'])['removed'], true)
          },
        })
        check(t)
        grantMayExist = false
      }),
    reauthenticate: (signal) => run(signal, (t) => authenticate({ kind: 'register' }, t)),
    prove: async (value, signal) => {
      if (signal.aborted) {
        await cancelCeremony(value.id).catch(() => undefined)
        throw new CredentialWriteNotDispatched('cancelled')
      }
      return run(signal, (t) => prove(value, t))
    },
    cancel,
  }
}
