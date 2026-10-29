import { createAuthorization } from '@rss/mdm-authorization'
import { createTenantAdministration } from '@rss/mdm-tenant-administration'
import { createProfiles } from '@rss/mdm-user-profiles'
import { createAuthorizationAdapter } from '@rss/mdm-http/authorization'
import { createTenantAdministrationAdapter } from '@rss/mdm-http/tenant-administration'
import { createProfilesAdapter } from '@rss/mdm-http/user-profiles'
import { createFlows, createSession, createIdentityAdministration } from '@rss/auth-core'
import {
  createAuthPort,
  createIdentityAdministrationAdapter,
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
    administration() {
      const state = owner.getSnapshot()
      if (
        state.status !== 'authenticated' ||
        !state.identity ||
        !state.session ||
        state.tenant !== tenant
      )
        throw new Error('Session required')
      const realm = management ? 'management' : 'tenant'
      const transport = bindSession(mdm, owner, {
        realm,
        credentialTenant: tenant,
        principalId: state.identity.principalId,
        sessionId: state.session.id,
      })
      return Object.freeze({
        binding: `${tenant}/${state.identity.principalId}/${state.session.id}`,
        identity: createIdentityAdministration(
          createIdentityAdministrationAdapter(identity, owner, oidcEnabled),
        ),
        authorization: createAuthorization(
          createAuthorizationAdapter(transport, tenant, realm, state.identity.principalId),
          tenant,
          realm,
        ),
        tenants: createTenantAdministration(createTenantAdministrationAdapter(transport)),
        profiles: createProfiles(createProfilesAdapter(transport), state.identity.principalId),
      })
    },
    passkeys: createPasskeyClient(identity, owner),
    flows: createFlows(storage),
    home: management ? '/platform' : '/',
    login: management ? '/platform/login' : '/login',
  })
}
export type Runtime = Awaited<ReturnType<typeof createRuntime>>
