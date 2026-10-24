/** Shared browser/demo budget matching the MDM JSON ingress contract. */
export const MDM_JSON_BODY_LIMIT = 16_384
export const MDM_CONTENT_BODY_LIMIT = 16_777_216
// Allow the content owner's maximum 24h budget plus normal request setup time.
// The view's AbortSignal still cancels the request.
export const MDM_CONTENT_TIMEOUT_MS = 86_400_000 + 30_000
export const isMdmContentRequest = (method: string, path: string) =>
  (method === 'POST' && /^\/api\/v1\/resources\/[^/]+\/content$/.test(path)) ||
  (method === 'PATCH' && /^\/api\/v1\/resources\/[^/]+\/uploads\/[^/]+$/.test(path))

/** Current management ingress budgets, shared with the HTTP demo. */
export function mdmJsonBodyLimit(method: string, path: string) {
  if (method === 'POST') {
    if (
      /^\/api\/v1\/apple\/materials\/(?:apns|profile|managed_account)\/(?:keys|certificates)$/.test(
        path,
      )
    )
      return 256 * 1024
    if (/^\/api\/v1\/(?:policies\/[^/]+|resources\/[^/]+)$/.test(path)) return 8 * 1024 * 1024
    if (/^\/api\/v1\/devices\/[^/]+\/operations$/.test(path)) return 16 * 1024 * 1024
    if (/^\/api\/v1\/pki\/(?:rotations|crls)$/.test(path)) return 64 * 1024 * 1024
    if (path === '/api/v1/pki/signing/recover') return 256 * 1024
    if (path === '/api/v1/certificate-archive/import') return 2 * 1024 * 1024
    if (
      /^\/api\/v1\/(?:agent-packages(?:\/[^/]+\/withdraw)?|software\/imports|software\/sources\/[^/]+\/revisions\/[^/]+|software\/resources\/[^/]+\/versions\/[^/]+)$/.test(
        path,
      )
    )
      return 1024 * 1024
  }
  if (method === 'PUT' && path === '/api/v1/windows/entra-policy') return 128 * 1024
  return method === 'PUT' &&
    /^\/api\/v1\/(?:authorization\/(?:rules|user-groups)|tenant-administration\/authorization\/rules)\/(?:\{id\}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(
      path,
    )
    ? 2 * 1024 * 1024
    : MDM_JSON_BODY_LIMIT
}
