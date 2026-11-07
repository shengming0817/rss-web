// ref: remix-run/react-router packages/react-router/lib/router/utils.ts@react-router@7.9.6
/** Only public locators on existing owner pages may be carried through result navigation. */
export function resultReturnPath(value: string | null, expected: string): string | null {
  if (!value || value.length > 16384 || !value.startsWith('/') || /[\\\p{Cc}]/u.test(value))
    return null
  const url = new URL(value, 'https://mdm.invalid')
  if (url.origin !== 'https://mdm.invalid' || url.pathname !== expected || url.hash) return null
  const fields =
    expected === '/policies'
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
        ]
      : expected === '/operations'
        ? ['filter', 'cursor', 'operation', 'kind', 'policy', 'returnTo']
        : /^\/devices\/(endpoint|association)\/[^/]+$/.test(expected)
          ? ['tab', 'endpoint', 'returnTo']
          : []
  if (!fields.length || [...url.searchParams.keys()].some((key) => !fields.includes(key)))
    return null
  return url.pathname + url.search
}

export function resultSourcePath(value: string | null): string | null {
  if (
    !value ||
    value.length > 16384 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\p{Cc}]/u.test(value)
  )
    return null
  try {
    const url = new URL(value, 'https://mdm.invalid')
    return resultReturnPath(value, url.pathname)
  } catch {
    return null
  }
}
