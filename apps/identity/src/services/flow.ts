import { object, number, text, uuid } from './decode'
const KEY = 'rss.identity.pending-flow'
const LIFETIME = 300_000
export interface Pending {
  kind: 'sso' | 'step-up' | 'link'
  tenant: string
  created: number
}
export function createFlows(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  now = () => Date.now(),
) {
  function clear() {
    storage.removeItem(KEY)
  }
  function read(): Pending | null {
    try {
      const raw = storage.getItem(KEY)
      if (raw === null) return null
      const v = object(JSON.parse(raw) as unknown, ['kind', 'tenant', 'created'])
      if (!['sso', 'step-up', 'link'].includes(text(v['kind']))) throw new Error('Invalid flow')
      const created = number(v['created'])
      if (now() < created || now() - created >= LIFETIME) throw new Error('Expired flow')
      return {
        kind: v['kind'] as Pending['kind'],
        tenant: uuid(v['tenant']),
        created,
      }
    } catch {
      clear()
      return null
    }
  }
  function save(value: Omit<Pending, 'created'>) {
    storage.setItem(KEY, JSON.stringify({ ...value, created: now() }))
    if (!read()) throw new Error('Invalid flow')
  }
  function take() {
    const result = read()
    clear()
    return result
  }
  return { read, save, take, clear }
}
