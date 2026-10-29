import type { PolicyRead } from './clients/model'
/** All Policy action editors consume the same Policy identity and route. */
export function policyDestination(policy: Pick<PolicyRead, 'id' | 'definition'>, tenant: string) {
  const kind = policy.definition.action.kind
  if (kind === 'telemetry_profile')
    return {
      name: 'policy-telemetry',
      params: { tenant },
      query: { policy: policy.id, resource: policy.definition.action.resource.id },
    }
  return {
    name: 'policy-policies',
    params: { tenant },
    query: {
      id: policy.id,
      ...(['execution', 'configuration', 'native_collection', 'agent_collection'].includes(kind)
        ? {}
        : { action: kind }),
    },
  }
}
