import { createAgentPackages } from '@rss/mdm-software/agent-packages'
import { createAgentPackagesAdapter } from '@rss/mdm-http/agent-packages'
import { createRequestHistory } from '@rss/mdm-enrollment/requests'
import { createRequestHistoryAdapter } from '@rss/mdm-http/enrollment-requests'
import { directoryCapabilities } from '@rss/mdm-http/directories'
import { createOperationDiagnostics, createAudit, createAuditPolicyLookup } from '@rss/mdm-audit'
import { createOperationDiagnosticsAdapter } from '@rss/mdm-http/operation-diagnostics'
import { createTenantSetup } from '@rss/mdm-tenant-setup'
import { createRuntimeDiagnostics } from '@rss/mdm-runtime-diagnostics'
import { createTenantSetupAdapter, createCatalogAdapter } from '@rss/mdm-http/tenant-setup'
import { createRuntimeDiagnosticsAdapter } from '@rss/mdm-http/runtime-diagnostics'
import { createTelemetry } from '@rss/mdm-telemetry'
import { createTelemetryAdapter } from '@rss/mdm-http/telemetry'
import { createOperations } from '@rss/mdm-operations'
import { createTaskTrust } from '@rss/mdm-task-trust'
import { createDeviceControl } from '@rss/mdm-devices/control'
import { createDeviceDeclarations } from '@rss/mdm-devices/declarations'
import { createDeviceAccess } from '@rss/mdm-device-access'
import { createOperationsAdapter } from '@rss/mdm-http/operations'
import { createDeviceControlAdapter } from '@rss/mdm-http/device-control'
import { createDeviceDeclarationsAdapter } from '@rss/mdm-http/device-declarations'
import { createTaskTrustAdapter } from '@rss/mdm-http/task-trust'
import { createDeviceAccessAdapter } from '@rss/mdm-http/device-access'
import { createPolicies, createPolicyEvents } from '@rss/mdm-policies'
import { createPoliciesAdapter } from '@rss/mdm-http/policies'
import { createPolicyEventsAdapter } from '@rss/mdm-http/policy-events'
import { createWebhookMaterialRecovery } from './webhook-material-recovery'
import { createCeremonyHandoff } from './ceremony-handoff'
import { createAuthorization } from '@rss/mdm-authorization'
import { createTenantAdministration } from '@rss/mdm-tenant-administration'
import { createProfiles } from '@rss/mdm-user-profiles'
import { createDevices } from '@rss/mdm-devices'
import { createEnrollment, createAppleEnrollment } from '@rss/mdm-enrollment'
import { createConnections } from '@rss/mdm-connections'
import { createInventory, createSoftwareAssets } from '@rss/mdm-inventory'
import { createMappings, createResources } from '@rss/mdm-resources'
import { createContent } from '@rss/mdm-content'
import { createSoftware, createSoftwareSnapshots } from '@rss/mdm-software'
import { createPublications } from '@rss/mdm-software/publications'
import { createScopes } from '@rss/mdm-scopes'
import { createScopesAdapter } from '@rss/mdm-http/scopes'
import { createGroups } from '@rss/mdm-groups'
import { createCompliance } from '@rss/mdm-compliance'
import { createDevicePki } from '@rss/mdm-certificates/device-pki'
import { createCertificateArchive } from '@rss/mdm-certificates/archive'
import { createRecoveryCredentials } from '@rss/mdm-recovery-credentials'
import { createWebhooks } from '@rss/mdm-webhooks'
import { createWebhooksAdapter } from '@rss/mdm-http/webhooks'
import { createAuditAdapter, createAuditPolicyLookupAdapter } from '@rss/mdm-http/audit'
import { createDevicePkiAdapter } from '@rss/mdm-http/device-pki'
import { createCertificateArchiveAdapter } from '@rss/mdm-http/certificate-archive'
import { createRecoveryCredentialsAdapter } from '@rss/mdm-http/recovery-credentials'
import { createSoftwareAssetsAdapter } from '@rss/mdm-http/software-assets'
import { createInventoryAdapter } from '@rss/mdm-http/inventory'
import { createResourceMappingsAdapter } from '@rss/mdm-http/resource-mappings'
import { createResourcesAdapter } from '@rss/mdm-http/resources'
import { createContentAdapter } from '@rss/mdm-http/content'
import { createSoftwareSnapshotsAdapter } from '@rss/mdm-http/software-snapshots'
import { createSoftwareAdapter } from '@rss/mdm-http/software'
import { createPublicationsAdapter } from '@rss/mdm-http/software-publications'
import { createGroupsAdapter } from '@rss/mdm-http/groups'
import { createComplianceAdapter } from '@rss/mdm-http/compliance'
import { createDevicesAdapter } from '@rss/mdm-http/devices'
import {
  appleBridgeUrl,
  createEntraTermsAdapter,
  createEnrollmentAdapter,
  createAgentPackageDownloadAdapter,
} from '@rss/mdm-http/enrollment'
import { createAppleEnrollmentAdapter } from '@rss/mdm-http/apple-enrollment'
import { createConnectionsAdapters } from '@rss/mdm-http/connections'
import { createAuthorizationAdapter } from '@rss/mdm-http/authorization'
import { createTenantAdministrationAdapter } from '@rss/mdm-http/tenant-administration'
import { createProfilesAdapter } from '@rss/mdm-http/user-profiles'
import {
  createFlows,
  createSession,
  createIdentityAdministration,
  createOperationAuthorization,
} from '@rss/auth-core'
import {
  createAuthPort,
  createIdentityAdministrationAdapter,
  createIdentityTransport,
  createPasskeyClient,
  createOperationAuthorizationPort,
  loadHostConfig,
} from '@rss/auth-http'
import { bindSession } from '@rss/mdm-http'
import {
  createMdmTransport,
  loadMdmHostConfig,
  mdmTenantFromPath,
  type MdmHostConfig,
} from '@rss/api/mdm'

export async function startRuntime(
  origin: string,
  pathname: string,
  storage: Storage,
  search: string,
) {
  const identity = createIdentityTransport(),
    mdm = createMdmTransport()
  const [identityHost, host] = await Promise.all([
    loadHostConfig(identity, origin),
    loadMdmHostConfig(mdm, origin),
  ])
  const flows = createFlows(storage)
  const management = pathname === '/platform' || pathname.startsWith('/platform/')
  const callback = pathname === '/auth/resume' || pathname === '/auth/error'
  const pending = callback ? flows.take() : null
  const target =
    pending && identityHost.oidcEnabled && (pending.kind === 'sso' || pending.kind === 'step-up')
      ? mdmTenantFromPath(`/tenants/${pending.tenant}`, host.managementTenant)
      : null
  const tenant = management
    ? host.managementTenant
    : callback
      ? target
      : mdmTenantFromPath(pathname, host.managementTenant)
  const login = target ? `/tenants/${target}/login` : '/'
  if (pathname === '/auth/error') {
    const reason = new URLSearchParams(search).get('reason')
    return {
      kind: 'entry',
      message:
        reason === 'cancelled'
          ? 'callbackCancelled'
          : reason === 'unavailable'
            ? 'callbackUnavailable'
            : 'callbackFailed',
      login,
    } as const
  }
  if (pathname === '/enrollment/windows/entra/terms')
    return { kind: 'terms', terms: createEntraTermsAdapter(mdm) } as const
  if (!tenant) {
    if (callback) return { kind: 'entry', message: 'resumeFailed', login } as const
    return { kind: 'entry', message: pathname === '/' ? 'tenantEntry' : 'notFound' } as const
  }
  const base = management ? '' : `/tenants/${tenant}`
  if (!management && pathname === base + '/downloads/agent')
    return { kind: 'downloads', downloads: createAgentPackageDownloadAdapter(mdm, tenant) } as const
  const runtime = createRuntime(
    identity,
    mdm,
    host,
    tenant,
    management,
    identityHost.oidcEnabled && !management,
    flows,
  )
  if (callback) {
    await runtime.owner.check(tenant).catch(() => undefined)
    const state = runtime.owner.getSnapshot()
    if (state.status !== 'authenticated' || state.tenant !== tenant) {
      runtime.owner.dispose()
      return { kind: 'entry', message: 'resumeFailed', login } as const
    }
    const stepUp = pending?.kind === 'step-up'
    return {
      kind: 'console',
      runtime,
      base,
      resumed: stepUp ? base + '/security' : base,
      stepUp,
    } as const
  }
  return { kind: 'console', runtime, base } as const
}
function createRuntime(
  identity: ReturnType<typeof createIdentityTransport>,
  mdm: ReturnType<typeof createMdmTransport>,
  host: MdmHostConfig,
  tenant: string,
  management: boolean,
  oidcEnabled: boolean,
  flows: ReturnType<typeof createFlows>,
) {
  const owner = createSession(createAuthPort(identity), { oidcEnabled })
  const operationAuthorization = createOperationAuthorization(
    createOperationAuthorizationPort(identity, owner),
    () => {
      const state = owner.getSnapshot()
      return state.status === 'authenticated' && state.tenant && state.identity && state.session
        ? `${state.tenant}/${state.identity.principalId}/${state.session.id}`
        : null
    },
  )
  const passkeys = createPasskeyClient(identity, owner)
  let setupBinding = ''
  let setup: ReturnType<typeof createTenantSetup> | undefined
  return Object.freeze({
    owner,
    directoryCapabilities,
    webhookMaterialRecovery: createWebhookMaterialRecovery(owner),
    operationAuthorization,
    ...createCeremonyHandoff(operationAuthorization, passkeys.cancelAuthorization),
    host,
    tenant,
    management,
    oidcEnabled,
    appleBridgeUrl,
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
      const binding = `${tenant}/${state.identity.principalId}/${state.session.id}`
      if (setupBinding !== binding) {
        setupBinding = binding
        setup = management
          ? undefined
          : createTenantSetup(createTenantSetupAdapter(transport, tenant), tenant)
      }
      const content = createContent(createContentAdapter(transport, tenant))
      return Object.freeze({
        tenantSetup: setup,
        settingsCatalog: createCatalogAdapter(transport, management, tenant),
        diagnostics: createRuntimeDiagnostics(createRuntimeDiagnosticsAdapter(transport, tenant)),
        operationDiagnostics: management
          ? {
              management: createOperationDiagnostics(
                createOperationDiagnosticsAdapter(transport, 'management', tenant),
              ),
            }
          : {
              mdm: createOperationDiagnostics(
                createOperationDiagnosticsAdapter(transport, 'mdm', tenant),
              ),
              da: createOperationDiagnostics(
                createOperationDiagnosticsAdapter(transport, 'da', tenant),
              ),
            },
        telemetry: createTelemetry(createTelemetryAdapter(transport, tenant), tenant),
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
        profiles: createProfiles(
          createProfilesAdapter(transport, tenant),
          state.identity.principalId,
        ),
        devices: createDevices(createDevicesAdapter(transport, tenant), tenant),
        inventory: createInventory(createInventoryAdapter(transport, tenant)),
        softwareAssets: createSoftwareAssets(createSoftwareAssetsAdapter(transport, tenant)),
        resources: createResources(createResourcesAdapter(transport, tenant)),
        content,
        mappings: createMappings(createResourceMappingsAdapter(transport, content, tenant)),
        agentPackages: createAgentPackages(createAgentPackagesAdapter(transport, tenant), tenant),
        software: createSoftware(createSoftwareAdapter(transport, tenant)),
        softwareSnapshots: createSoftwareSnapshots(
          createSoftwareSnapshotsAdapter(transport, tenant),
        ),
        publications: createPublications(createPublicationsAdapter(transport, tenant)),
        operations: createOperations(createOperationsAdapter(transport, tenant)),
        deviceControl: createDeviceControl(createDeviceControlAdapter(transport, tenant)),
        deviceDeclarations: createDeviceDeclarations(
          createDeviceDeclarationsAdapter(transport, tenant),
        ),
        taskTrust: createTaskTrust(createTaskTrustAdapter(transport, tenant, host.serviceId)),
        deviceAccess: createDeviceAccess(createDeviceAccessAdapter(transport, tenant)),
        policies: createPolicies(createPoliciesAdapter(transport, tenant)),
        policyEvents: createPolicyEvents(createPolicyEventsAdapter(transport, tenant)),
        scopes: createScopes(createScopesAdapter(transport, tenant)),
        groups: createGroups(createGroupsAdapter(transport, tenant)),
        compliance: createCompliance(createComplianceAdapter(transport, tenant)),
        devicePki: createDevicePki(
          createDevicePkiAdapter(transport, tenant, host.serviceId),
          tenant,
          host.serviceId,
        ),
        certificateArchive: createCertificateArchive(
          createCertificateArchiveAdapter(transport, tenant),
          tenant,
        ),
        recoveryCredentials: createRecoveryCredentials(
          createRecoveryCredentialsAdapter(transport, tenant),
        ),
        audit: createAudit(createAuditAdapter(transport, tenant)),
        webhooks: createWebhooks(createWebhooksAdapter(transport, tenant)),
        auditPolicyLookup: createAuditPolicyLookup(
          createAuditPolicyLookupAdapter(transport, tenant, host.serviceId),
        ),
        requestHistory: createRequestHistory(createRequestHistoryAdapter(transport, tenant)),
        enrollment: createEnrollment(
          createEnrollmentAdapter(transport, mdm, tenant, host.serviceId),
          tenant,
          state.identity.principalId,
        ),
        appleEnrollment: createAppleEnrollment(createAppleEnrollmentAdapter(transport, tenant)),
        connections: createConnections(
          createConnectionsAdapters(transport, tenant, host.serviceId),
          tenant,
          host.serviceId,
        ),
      })
    },
    passkeys,
    flows,
    home: management ? '/platform' : '/',
    login: management ? '/platform/login' : '/login',
  })
}
export type Runtime = ReturnType<typeof createRuntime>

export type Startup = Awaited<ReturnType<typeof startRuntime>>
