import { auditHref, readAuditContext } from './audit-context'
// ref: remix-run/react-router packages/react-router/lib/router/utils.ts@react-router@7.9.6
/** Only public locators on existing owner pages may be carried through result navigation. */
export function resultReturnPath(value: string | null, expected?: string): string | null {
  if (
    !value ||
    value.length > 16384 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\p{Cc}]/u.test(value)
  )
    return null
  try {
    const url = new URL(value, 'https://mdm.invalid'),
      path = url.pathname
    if (
      url.origin !== 'https://mdm.invalid' ||
      (expected !== undefined && expected !== path) ||
      url.hash
    )
      return null
    if (path === '/audit') return auditHref(readAuditContext(url.searchParams))
    const fields =
      path === '/policies'
        ? [
            'policy',
            'tab',
            'state',
            'filter',
            'sort',
            'field',
            'limit',
            'cursor',
            'runCursor',
            'assignmentCursor',
            'eventDevice',
            'batch',
            'member',
            'batchCursor',
            'memberCursor',
            'returnTo',
          ]
        : path === '/operations'
          ? ['filter', 'cursor', 'operation', 'kind', 'policy', 'returnTo']
          : /^\/devices\/(endpoint|association)\/[^/]+$/.test(path)
            ? ['tab', 'endpoint', 'retirement', 'returnTo']
            : []
    if (!fields.length || [...url.searchParams.keys()].some((key) => !fields.includes(key)))
      return null
    return path + url.search
  } catch {
    return null
  }
}
export function eventBatchPath(
  device: string,
  batch?: string,
  member?: string,
  returnTo?: string,
): string {
  return `/policies?${new URLSearchParams({ tab: 'events', eventDevice: device, ...(batch ? { batch } : {}), ...(member ? { member } : {}), ...(returnTo ? { returnTo } : {}) })}`
}
export function retirementPath(device: string, retirement: string, returnTo?: string): string {
  return `/devices/endpoint/${encodeURIComponent(device)}?${new URLSearchParams({ tab: 'retirement', retirement, ...(returnTo ? { returnTo } : {}) })}`
}
