import { createFlows, createSession } from '@rss/auth-core'
import {
  createAuthPort,
  createIdentityTransport,
  createPasskeyClient,
  loadHostConfig,
} from '@rss/auth-http'
import { bindSession, createMdmTransport, loadMdmHostConfig } from '@rss/mdm-http'

export async function createRuntime(origin: string, pathname: string, storage: Storage) {
  const identity = createIdentityTransport(),
    mdm = createMdmTransport()
  const [identityHost, host] = await Promise.all([
    loadHostConfig(identity, origin),
    loadMdmHostConfig(mdm, origin),
  ])
  const management =
    pathname === '/platform' ||
    pathname.startsWith('/platform/') ||
    pathname.startsWith(`/tenants/${host.managementTenant}/`)
  const tenant = management ? host.managementTenant : host.tenant
  const oidcEnabled = !management && identityHost.oidcEnabled
  const owner = createSession(createAuthPort(identity), { oidcEnabled })
  return Object.freeze({
    owner,
    host,
    tenant,
    management,
    oidcEnabled,
    transport: bindSession(mdm, owner, tenant),
    passkeys: createPasskeyClient(identity, owner),
    flows: createFlows(storage),
    home: management ? '/platform' : '/',
    login: management ? '/platform/login' : '/login',
  })
}
export type Runtime = Awaited<ReturnType<typeof createRuntime>>
