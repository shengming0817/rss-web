import { closed, enumeration, uuid } from '../../../services/decode'
/** Candidate software projection owned by rss-mdm; it is never a production fallback. */
export function candidate(value: unknown, tenant: string, demo: boolean, keys: string[]) {
  const v = closed(value, ['contract', 'tenantId', 'source', ...keys])
  if (v['contract'] !== 'software-v1' || uuid(v['tenantId']) !== tenant)
    throw new Error('Wrong software contract')
  if (enumeration(v['source'], ['real', 'mock'] as const) === 'mock' && !demo)
    throw new Error('Unexpected simulated data')
  return v
}
