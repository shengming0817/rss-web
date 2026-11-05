const KEY = 'rss.mdm.authentication-flow'
type Locator = { kind: 'sso' | 'step-up'; tenant: string; created: number }
/** The sole persistent flow value is a short-lived per-tab locator. */
export function createFlows(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  now = Date.now,
) {
  const clear = () => storage.removeItem(KEY)
  function read(): Locator | null {
    try {
      const raw = storage.getItem(KEY)
      if (!raw) return null
      const v: unknown = JSON.parse(raw)
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid flow')
      const r = v as Record<string, unknown>
      if (
        Object.keys(r).sort().join() !== 'created,kind,tenant' ||
        (r['kind'] !== 'sso' && r['kind'] !== 'step-up') ||
        typeof r['tenant'] !== 'string' ||
        !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(r['tenant']) ||
        r['tenant'] === '00000000-0000-0000-0000-000000000000' ||
        typeof r['created'] !== 'number' ||
        !Number.isSafeInteger(r['created']) ||
        now() < r['created'] ||
        now() - r['created'] >= 300_000
      )
        throw new Error('Expired flow')
      return { kind: r['kind'], tenant: r['tenant'], created: r['created'] }
    } catch {
      clear()
      return null
    }
  }
  return {
    clear,
    read,
    save(kind: Locator['kind'], tenant: string) {
      storage.setItem(KEY, JSON.stringify({ kind, tenant, created: now() }))
      if (!read()) throw new Error('Invalid flow')
    },
    take() {
      const value = read()
      clear()
      return value
    },
  }
}
