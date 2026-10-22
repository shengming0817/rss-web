import { closed, enumeration, uuid } from '../../../../src/services/decode'
import { positive } from '../../../../src/features/security/clients/compliance-model'
export function securitySource(value: unknown) {
  const v = closed(value, ['registrationId', 'generation', 'source'])
  return {
    registrationId: uuid(v['registrationId']),
    generation: positive(v['generation']),
    source: enumeration(v['source'], ['agent.builtin', 'mdm.windows', 'mdm.apple'] as const),
  }
}
export type SecuritySource = ReturnType<typeof securitySource>
