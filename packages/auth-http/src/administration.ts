import type {
  IdentityAdministrationPort,
  SessionOwner,
  LocalProfileChange,
  Account,
} from '@rss/auth-core'
import { isRssApiError, type HttpTransport } from '@rss/api/identity'
import {
  account,
  accounts,
  accountQuery,
  provider,
  providerTest,
  localProfile,
  localProfileReceipt,
} from './administration-decode'
import { object, list, uuid } from './decode'
/** Account/Provider administration reuses the existing application session, never a second controller. */
export function createIdentityAdministrationAdapter(
  transport: HttpTransport,
  owner: SessionOwner,
  oidcEnabled: boolean,
): IdentityAdministrationPort {
  const initial = owner.getSnapshot()
  if (
    initial.status !== 'authenticated' ||
    !initial.identity ||
    !initial.session ||
    !initial.tenant
  )
    throw new Error('Session required')
  const tenant = initial.tenant,
    principal = initial.identity.principalId,
    session = initial.session.id
  async function call<T>(
    method: 'GET' | 'POST' | 'PUT',
    suffix: string,
    decode: (v: unknown) => T,
    body?: unknown,
    status: 200 | 201 = 200,
    query?: Record<string, string>,
  ): Promise<T> {
    return owner.business((credential) => {
      const current = owner.getSnapshot()
      if (
        credential.tenant !== tenant ||
        current.identity?.principalId !== principal ||
        current.session?.id !== session
      )
        throw new Error('Mismatched administration session')
      return transport.request({
        method,
        path: `/api/v1/identity/tenants/{tenant}/${suffix}`,
        pathParams: { tenant },
        headers:
          method === 'GET' ? {} : { 'X-Identity-Request': '1', 'X-CSRF-Token': credential.csrf },
        ...(body === undefined ? {} : { body }),
        ...(query ? { query } : {}),
        successStatus: status,
        decode,
      })
    })
  }
  async function selfChange(work: () => Promise<Account>) {
    try {
      const result = await work()
      owner.invalidate()
      return result
    } catch (error) {
      if (!isRssApiError(error) || error.cause !== 'wire' || (error.status ?? 0) >= 500)
        owner.invalidate()
      throw error
    }
  }
  const boundAccount = (id: string) => (value: unknown) => {
    const result = account(value)
    if (result.principalId !== id) throw new Error('Wrong account')
    return result
  }
  const enabled = () => {
    if (!oidcEnabled) throw new Error('Provider management unavailable in this realm')
  }
  function profileWrite(id: string, change: LocalProfileChange) {
    return call(
      'PUT',
      `accounts/${uuid(id)}/profile`,
      (value) => {
        const r = localProfileReceipt(value, change.operationId)
        if (!r || r.revision !== change.expectedRevision + 1)
          throw new Error('Wrong local profile receipt')
        return r
      },
      change,
    )
  }
  return {
    accounts: (query = {}) =>
      call(
        'GET',
        'accounts',
        (v) => accounts(v, query.fields),
        undefined,
        200,
        accountQuery({ limit: 20, ...query }),
      ),
    account: (id) => call('GET', `accounts/${uuid(id)}`, boundAccount(id)),
    createAccount: (login, password) => call('POST', 'accounts', account, { login, password }, 201),
    setAccount: (id, field, value) => {
      const work = () =>
        call('POST', `accounts/${uuid(id)}/${field}`, boundAccount(id), { enabled: value })
      return id === principal ? selfChange(work) : work()
    },
    resetPassword: (id, password) => {
      const work = () =>
        call('POST', `accounts/${uuid(id)}/password`, boundAccount(id), { password })
      return id === principal ? selfChange(work) : work()
    },
    ownPassword: (currentPassword, password) =>
      selfChange(() =>
        call('POST', 'account/password', boundAccount(principal), { currentPassword, password }),
      ),
    providers: () => {
      enabled()
      return call('GET', 'providers', (v) => list(object(v, ['providers'])['providers'], provider))
    },
    createProvider: (settings, clientSecret, caPem) => {
      enabled()
      return call('POST', 'providers', provider, { settings, clientSecret, caPem }, 201)
    },
    updateProvider: (id, expectedVersion, settings, clientSecret, caPem) => {
      enabled()
      return call(
        'PUT',
        `providers/${uuid(id)}`,
        (value) => {
          const p = provider(value)
          if (p.id !== id || p.version !== expectedVersion + 1)
            throw new Error('Wrong provider version')
          return p
        },
        { expectedVersion, settings, clientSecret, caPem },
      )
    },
    enableProvider: (id, expectedVersion, value) => {
      enabled()
      return call(
        'POST',
        `providers/${uuid(id)}/enabled`,
        (v) => {
          const p = provider(v)
          if (p.id !== id || p.version !== expectedVersion + 1 || p.enabled !== value)
            throw new Error('Wrong provider transition')
          return p
        },
        { expectedVersion, enabled: value },
      )
    },
    testProvider: (id) => {
      enabled()
      return call('POST', `providers/${uuid(id)}/test`, providerTest)
    },
    localProfile: (id) => call('GET', `accounts/${uuid(id)}/profile`, localProfile),
    saveLocalProfile: profileWrite,
    localProfileOperation: (id, operationId) =>
      call('GET', `accounts/${uuid(id)}/profile/operations/${uuid(operationId)}`, (v) =>
        localProfileReceipt(v, operationId),
      ),
  }
}
