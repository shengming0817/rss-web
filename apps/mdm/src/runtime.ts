import { createAuthorization } from '@rss/mdm-authorization'
import { createTenantAdministration } from '@rss/mdm-tenant-administration'
import { createProfiles } from '@rss/mdm-user-profiles'
import { createDevices } from '@rss/mdm-devices'
import {
  createEnrollment,
  createAppleEnrollment,
  createPublicEnrollment,
} from '@rss/mdm-enrollment'
import { createConnections } from '@rss/mdm-connections'
import { createInventory, createMappings } from '@rss/mdm-inventory'
import { createGroups } from '@rss/mdm-groups'
import { createCompliance } from '@rss/mdm-compliance'
import { createInventoryAdapter } from '@rss/mdm-http/inventory'
import { createMappingVersionsAdapter } from '@rss/mdm-http/mapping-versions'
import { createGroupsAdapter } from '@rss/mdm-http/groups'
import { createComplianceAdapter } from '@rss/mdm-http/compliance'
import { createDevicesAdapter } from '@rss/mdm-http/devices'
import { createEnrollmentAdapter, createPublicEnrollmentAdapter } from '@rss/mdm-http/enrollment'
import { createAppleEnrollmentAdapter } from '@rss/mdm-http/apple-enrollment'
import { createConnectionsAdapters } from '@rss/mdm-http/connections'
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
    onboarding: createPublicEnrollment(createPublicEnrollmentAdapter(mdm, host.tenant)),
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
        devices: createDevices(createDevicesAdapter(transport, tenant), tenant),
        inventory: createInventory(createInventoryAdapter(transport, tenant)),
        mappings: createMappings(createMappingVersionsAdapter(transport)),
        groups: createGroups(createGroupsAdapter(transport)),
        compliance: createCompliance(createComplianceAdapter(transport)),
        enrollment: createEnrollment(
          createEnrollmentAdapter(transport, mdm, tenant, host.serviceId),
          tenant,
          state.identity.principalId,
        ),
        appleEnrollment: createAppleEnrollment(createAppleEnrollmentAdapter(transport)),
        connections: createConnections(
          createConnectionsAdapters(transport, tenant, host.serviceId),
          tenant,
          host.serviceId,
        ),
      })
    },
    passkeys: createPasskeyClient(identity, owner),
    flows: createFlows(storage),
    home: management ? '/platform' : '/',
    login: management ? '/platform/login' : '/login',
  })
}
export type Runtime = Awaited<ReturnType<typeof createRuntime>>
