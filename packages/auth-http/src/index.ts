import type { AuthPort, StepUpOperation } from '@rss/auth-core'
import { createIdentityTransport, isRssApiError, type HttpTransport } from '@rss/api/identity'
import {
  bool,
  hostContext,
  list,
  object,
  redirect,
  sessionResponse,
  sessionSecurity,
  text,
  uuid,
} from './decode'
export { createPasskeyClient, type Passkey } from './passkeys'

export interface HostConfig {
  canonicalOrigin: string
  oidcEnabled: boolean
}
export async function loadHostConfig(
  transport: HttpTransport,
  origin: string,
): Promise<HostConfig> {
  return transport.request({
    method: 'GET',
    path: '/api/v1/identity-host/config.json',
    successStatus: 200,
    decode(value) {
      const v = object(value, ['canonicalOrigin', 'oidcEnabled'])
      const canonicalOrigin = text(v['canonicalOrigin'])
      const url = new URL(canonicalOrigin)
      if (url.protocol !== 'https:' || url.origin !== canonicalOrigin || canonicalOrigin !== origin)
        throw new Error('Invalid Identity host configuration')
      return Object.freeze({ canonicalOrigin, oidcEnabled: bool(v['oidcEnabled']) })
    },
  })
}
export { createIdentityTransport }
export function createAuthPort(transport: HttpTransport): AuthPort {
  const headers = (csrf?: string) => ({
    'X-Identity-Request': '1',
    ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
  })
  function read<T>(tenant: string, suffix: string, decode: (value: unknown) => T) {
    return transport.request({
      method: 'GET',
      path: `/api/v1/identity/tenants/{tenant}/${suffix}`,
      pathParams: { tenant: uuid(tenant) },
      successStatus: 200,
      decode,
    })
  }
  function write<T>(
    tenant: string,
    suffix: string,
    csrf: string | undefined,
    body: unknown,
    decode: (value: unknown) => T,
  ) {
    return transport.request({
      method: 'POST',
      path: `/api/v1/identity/tenants/{tenant}/${suffix}`,
      pathParams: { tenant: uuid(tenant) },
      headers: headers(csrf),
      ...(body === undefined ? {} : { body }),
      successStatus: 200,
      decode,
    })
  }
  function operation(value: StepUpOperation) {
    switch (value.kind) {
      case 'register':
      case 'recover':
        return { kind: value.kind }
      case 'remove':
        return { kind: value.kind, credential: uuid(value.credential) }
    }
  }
  return {
    check: (tenant) => read(tenant, 'session', sessionResponse),
    login: (tenant, login, password, csrf) =>
      write(tenant, 'login', csrf, { login, password }, sessionResponse),
    refresh: (tenant, csrf) => write(tenant, 'session/refresh', csrf, undefined, sessionResponse),
    reauthenticate: (tenant, csrf, password) =>
      write(tenant, 'session/reauthenticate', csrf, { password }, sessionResponse),
    logout: (tenant, csrf, all) =>
      transport.request({
        method: 'POST',
        path: `/api/v1/identity/tenants/{tenant}/${all ? 'sessions/logout-all' : 'session/logout'}`,
        pathParams: { tenant: uuid(tenant) },
        headers: headers(csrf),
        successStatus: 204,
      }),
    context: (tenant) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/identity-host/tenants/{tenant}/context',
        pathParams: { tenant: uuid(tenant) },
        successStatus: 200,
        decode: hostContext,
      }),
    security: (tenant) => read(tenant, 'session/security', sessionSecurity),
    providers: (tenant) =>
      read(tenant, 'login-options', (value) =>
        list(object(value, ['providers'])['providers'], (value) => {
          const p = object(value, ['providerId', 'label'])
          return { id: uuid(p['providerId']), label: text(p['label'], 4096) }
        }),
      ),
    beginSso: (tenant, provider, csrf) =>
      write(tenant, `oidc/${uuid(provider)}/login`, csrf, { returnTarget: 'resume' }, (value) =>
        redirect(value, 'authorizationUrl'),
      ),
    stepUp: (tenant, csrf, provider, target) =>
      write(
        tenant,
        `oidc/${uuid(provider)}/step-up`,
        csrf,
        { returnTarget: 'resume', operation: operation(target) },
        (value) => redirect(value, 'authorizationUrl'),
      ),
    classify(error) {
      if (isRssApiError(error) && error.status === 401) return 'unauthenticated'
      return !isRssApiError(error) || error.cause !== 'wire' || error.status === 503
        ? 'unavailable'
        : 'rejected'
    },
  }
}
