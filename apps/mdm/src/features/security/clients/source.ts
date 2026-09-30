import { closed, enumeration, uuid } from '../../../services/decode'
import { positive } from './compliance-model'
export function securitySource(value: unknown) {
  const v = closed(value, ['registrationId', 'generation', 'source'])
  return {
    registrationId: uuid(v['registrationId']),
    generation: positive(v['generation']),
    source: enumeration(v['source'], ['agent.builtin', 'mdm.windows', 'mdm.apple'] as const),
  }
}
export type SecuritySource = ReturnType<typeof securitySource>
