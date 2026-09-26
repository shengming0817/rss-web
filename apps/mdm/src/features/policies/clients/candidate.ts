import { closed, enumeration, uuid } from '../../../services/decode'
/** Candidate browser projection, owned by rss-mdm; never a live-backend fallback. */
export function candidate(value: unknown, tenant: string, demo: boolean, keys: string[]) {
  const v = closed(value, ['contract', 'tenantId', 'source', ...keys])
  if (v['contract'] !== 'policies-v1' || uuid(v['tenantId']) !== tenant)
    throw new Error('Wrong candidate contract')
  const source = enumeration(v['source'], ['real', 'mock'] as const)
  if (!demo && source === 'mock') throw new Error('Unexpected simulated data')
  return v
}
