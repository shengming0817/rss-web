import { closed, count, enumeration, record } from '../../../services/decode'
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
export const taskStates = [
  'paused',
  'outside_window',
  'outside_scope',
  'scope_pending',
  'outside_stage',
  'scheduled',
  'success_gate',
  'missing_registration',
  'ambiguous_registration',
  'unsupported_capability',
  'missing_variant',
  'approval_withdrawn',
  'eligible',
] as const
export function taskAdmission(value: unknown) {
  const v = closed(value, ['state'], ['stage'])
  return {
    state: enumeration(v['state'], taskStates),
    ...('stage' in v ? { stage: count(v['stage']) } : {}),
  }
}
export function eligibility(value: unknown) {
  const state = enumeration(record(value)['state'], ['eligible', 'pending', 'excluded'] as const)
  const v = closed(value, state === 'eligible' ? ['state', 'entry'] : ['state'])
  return state === 'eligible' ? { state, entry: count(v['entry']) } : { state }
}
