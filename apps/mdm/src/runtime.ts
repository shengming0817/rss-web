import { createPolicies, createPolicyEvents } from '@rss/mdm-policies'
import { createPoliciesAdapter } from '@rss/mdm-http/policies'
import { createPolicyEventsAdapter } from '@rss/mdm-http/policy-events'
import { createWebhookMaterialRecovery } from './webhook-material-recovery'
import { createCeremonyHandoff } from './ceremony-handoff'
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
import { createInventory } from '@rss/mdm-inventory'
import { createMappings, createResources } from '@rss/mdm-resources'
import { createContent } from '@rss/mdm-content'
import { createSoftware } from '@rss/mdm-software'
import { createPublications } from '@rss/mdm-software/publications'
import { createScopes } from '@rss/mdm-scopes'
import { createScopesAdapter } from '@rss/mdm-http/scopes'
import { createGroups } from '@rss/mdm-groups'
import { createCompliance } from '@rss/mdm-compliance'
import { createDevicePki } from '@rss/mdm-certificates/device-pki'
import { createCertificateArchive } from '@rss/mdm-certificates/archive'
import { createRecoveryCredentials } from '@rss/mdm-recovery-credentials'
import { createAudit, createAuditPolicyLookup } from '@rss/mdm-audit'
import { createWebhooks } from '@rss/mdm-webhooks'
import { createWebhooksAdapter } from '@rss/mdm-http/webhooks'
import { createAuditAdapter, createAuditPolicyLookupAdapter } from '@rss/mdm-http/audit'
import { createDevicePkiAdapter } from '@rss/mdm-http/device-pki'
import { createCertificateArchiveAdapter } from '@rss/mdm-http/certificate-archive'
import { createRecoveryCredentialsAdapter } from '@rss/mdm-http/recovery-credentials'
import { createInventoryAdapter } from '@rss/mdm-http/inventory'
import { createResourceMappingsAdapter } from '@rss/mdm-http/resource-mappings'
import { createResourcesAdapter } from '@rss/mdm-http/resources'
import { createContentAdapter } from '@rss/mdm-http/content'
import { createSoftwareAdapter } from '@rss/mdm-http/software'
import { createPublicationsAdapter } from '@rss/mdm-http/software-publications'
import { createGroupsAdapter } from '@rss/mdm-http/groups'
import { createComplianceAdapter } from '@rss/mdm-http/compliance'
import { createDevicesAdapter } from '@rss/mdm-http/devices'
import { createEnrollmentAdapter, createPublicEnrollmentAdapter } from '@rss/mdm-http/enrollment'
import { createAppleEnrollmentAdapter } from '@rss/mdm-http/apple-enrollment'
import { createConnectionsAdapters } from '@rss/mdm-http/connections'
import { createAuthorizationAdapter } from '@rss/mdm-http/authorization'
import { createTenantAdministrationAdapter } from '@rss/mdm-http/tenant-administration'
import { createProfilesAdapter } from '@rss/mdm-http/user-profiles'
import {
  createFlows,
  createSession,
  createIdentityAdministration,
  createMaterialAuthorization,
} from '@rss/auth-core'
import {
  createAuthPort,
  createIdentityAdministrationAdapter,
  createIdentityTransport,
  createPasskeyClient,
  createOperationAuthorizationPort,
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
  const materialAuthorization = createMaterialAuthorization(
    createOperationAuthorizationPort(identity, owner),
    () => {
      const state = owner.getSnapshot()
      return state.status === 'authenticated' && state.tenant && state.identity && state.session
        ? `${state.tenant}/${state.identity.principalId}/${state.session.id}`
        : null
    },
  )
  const passkeys = createPasskeyClient(identity, owner)
  return Object.freeze({
    owner,
    webhookMaterialRecovery: createWebhookMaterialRecovery(owner),
    materialAuthorization,
    ...createCeremonyHandoff(materialAuthorization, passkeys.cancelAuthorization),
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
      const content = createContent(createContentAdapter(transport))
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
        resources: createResources(createResourcesAdapter(transport)),
        content,
        mappings: createMappings(createResourceMappingsAdapter(transport, content)),
        software: createSoftware(createSoftwareAdapter(transport)),
        publications: createPublications(createPublicationsAdapter(transport)),
        policies: createPolicies(createPoliciesAdapter(transport)),
        policyEvents: createPolicyEvents(createPolicyEventsAdapter(transport)),
        scopes: createScopes(createScopesAdapter(transport)),
        groups: createGroups(createGroupsAdapter(transport)),
        compliance: createCompliance(createComplianceAdapter(transport)),
        devicePki: createDevicePki(
          createDevicePkiAdapter(transport, tenant, host.serviceId),
          tenant,
          host.serviceId,
        ),
        certificateArchive: createCertificateArchive(
          createCertificateArchiveAdapter(transport, tenant),
          tenant,
        ),
        recoveryCredentials: createRecoveryCredentials(createRecoveryCredentialsAdapter(transport)),
        audit: createAudit(createAuditAdapter(transport)),
        webhooks: createWebhooks(createWebhooksAdapter(transport)),
        auditPolicyLookup: createAuditPolicyLookup(
          createAuditPolicyLookupAdapter(transport, tenant, host.serviceId),
        ),
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
    passkeys,
    flows: createFlows(storage),
    home: management ? '/platform' : '/',
    login: management ? '/platform/login' : '/login',
  })
}
export type Runtime = Awaited<ReturnType<typeof createRuntime>>
