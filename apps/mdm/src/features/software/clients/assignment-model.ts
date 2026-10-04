import { decodePolicy, policyDefinition, type PolicyDefinition } from '../../policies/clients/model'
export function softwarePolicyDefinition(value: unknown) {
  const d = policyDefinition(value)
  if (d.action.kind !== 'software') throw new Error('Wrong action')
  return { ...d, action: d.action }
}
export type SoftwarePolicyDefinition = PolicyDefinition & {
  action: Extract<PolicyDefinition['action'], { kind: 'software' }>
}
export function softwarePolicy(value: unknown, id?: string) {
  const p = decodePolicy(value, id)
  return { ...p, definition: softwarePolicyDefinition(p.definition) }
}
export type SoftwarePolicy = ReturnType<typeof softwarePolicy>
