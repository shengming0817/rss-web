/** Shared browser/demo budget matching the MDM JSON ingress contract. */
export const MDM_JSON_BODY_LIMIT = 16_384
export const SNAPSHOT_JSON_BODY_LIMIT = 64 * 1024 * 1024
export const MDM_CONTENT_BODY_LIMIT = 16_777_216
// Allow the content owner's maximum 24h budget plus normal request setup time.
// The view's AbortSignal still cancels the request.
export const MDM_CONTENT_TIMEOUT_MS = 86_400_000 + 30_000
export const isMdmContentRequest = (method: string, path: string) =>
  (method === 'POST' && /^\/api\/v1\/tenants\/[^/]+\/resources\/[^/]+\/content$/.test(path)) ||
  (method === 'PATCH' && /^\/api\/v1\/tenants\/[^/]+\/resources\/[^/]+\/uploads\/[^/]+$/.test(path))

/** Current management ingress budgets, shared with the HTTP demo. */
export function mdmJsonBodyLimit(method: string, path: string) {
  if (method === 'POST') {
    if (path === '/api/v1/tenants/{tenant}/software/source-snapshots/{source}')
      return SNAPSHOT_JSON_BODY_LIMIT
    if (
      /^\/api\/v1\/tenants\/[^/]+\/apple\/materials\/(?:apns|profile|managed_account)\/(?:keys|certificates)$/.test(
        path,
      )
    )
      return 256 * 1024
    if (/^\/api\/v1\/tenants\/[^/]+\/(?:policies\/[^/]+|resources\/[^/]+)$/.test(path))
      return 8 * 1024 * 1024
    if (/^\/api\/v1\/tenants\/[^/]+\/devices\/[^/]+\/operations$/.test(path))
      return 16 * 1024 * 1024
    if (/^\/api\/v1\/tenants\/[^/]+\/pki\/(?:rotations|crls)$/.test(path)) return 64 * 1024 * 1024
    if (/^\/api\/v1\/tenants\/[^/]+\/pki\/signing\/recover$/.test(path)) return 256 * 1024
    if (/^\/api\/v1\/tenants\/[^/]+\/certificate-archive\/import$/.test(path))
      return 2 * 1024 * 1024
    if (
      /^\/api\/v1\/tenants\/[^/]+\/(?:agent-packages(?:\/[^/]+\/withdraw)?|software\/imports|software\/sources\/[^/]+\/revisions\/[^/]+|software\/resources\/[^/]+\/versions\/[^/]+)$/.test(
        path,
      )
    )
      return 1024 * 1024
  }
  if (method === 'PUT' && /^\/api\/v1\/tenants\/[^/]+\/windows\/entra-policy$/.test(path))
    return 128 * 1024
  return method === 'PUT' &&
    /^\/api\/v1\/(?:tenants\/[^/]+\/authorization\/(?:rules|user-groups)|tenant-administration\/authorization\/rules)\/(?:\{id\}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(
      path,
    )
    ? 2 * 1024 * 1024
    : MDM_JSON_BODY_LIMIT
}
