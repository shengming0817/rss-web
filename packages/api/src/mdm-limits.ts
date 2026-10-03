/** Shared browser/demo budget matching the MDM JSON ingress contract. */
export const MDM_JSON_BODY_LIMIT = 16_384
export const MDM_CONTENT_BODY_LIMIT = 16_777_216
export const isMdmContentRequest = (method: string, path: string) =>
  (method === 'POST' && /^\/api\/v3\/resources\/[^/]+\/content$/.test(path)) ||
  (method === 'PATCH' && /^\/api\/v3\/resources\/[^/]+\/uploads\/[^/]+$/.test(path))

/** Only the published authorization writes have a 2 MiB ingress contract. */
export function mdmJsonBodyLimit(method: string, path: string) {
  if (method === 'POST' && path === '/api/v1/certificate-archive/import') return 2 * 1024 * 1024
  return method === 'PUT' &&
    /^\/api\/v1\/authorization\/(?:rules|user-groups)\/(?:\{id\}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(
      path,
    )
    ? 2 * 1024 * 1024
    : MDM_JSON_BODY_LIMIT
}
