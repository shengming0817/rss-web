export function readListLocation(query: Record<string, unknown>) {
  return {
    search: typeof query['q'] === 'string' ? query['q'] : '',
    platform:
      query['platform'] === 'windows' || query['platform'] === 'macos' ? query['platform'] : 'all',
    cursor:
      typeof query['cursor'] === 'string' && query['cursor'].length <= 4096
        ? query['cursor']
        : null,
  }
}
export function listLocation(search: string, platform: string, cursor: string | null) {
  return {
    ...(search ? { q: search } : {}),
    ...(['windows', 'macos'].includes(platform) ? { platform } : {}),
    ...(cursor ? { cursor } : {}),
  }
}
