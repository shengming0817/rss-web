import type { PolicyRead } from './clients/model'
export function policyDestination(policy: PolicyRead, tenant: string) {
  const kind = policy.definition.action.kind
  const name =
    kind === 'software'
      ? 'software-deployments'
      : kind === 'ensure_agent_installed' || kind === 'request_mdm_enrollment'
        ? 'software-bootstrap'
        : kind === 'unmanage_device'
          ? 'policy-lifecycle'
          : ['execution', 'configuration', 'native_collection', 'agent_collection'].includes(kind)
            ? 'policy-policies'
            : null
  return name ? { name, params: { tenant }, query: { id: policy.id } } : null
}
