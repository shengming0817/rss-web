import { closed, enumeration, uuid } from '../../../services/decode'
/** Current security/support candidate. rss-mdm owns its eventual published contract. */
export function candidate(value: unknown, tenant: string, demo: boolean, keys: string[]) {
  const v = closed(value, ['contract', 'tenantId', 'source', ...keys])
  if (v['contract'] !== 'security-v1' || uuid(v['tenantId']) !== tenant)
    throw new Error('Wrong security contract')
  const source = enumeration(v['source'], ['real', 'mock'] as const)
  if (!demo && source === 'mock') throw new Error('Unexpected simulated data')
  return v
}
