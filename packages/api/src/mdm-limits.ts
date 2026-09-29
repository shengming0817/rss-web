/** Shared browser/demo budget matching the MDM JSON ingress contract. */
export const MDM_JSON_BODY_LIMIT = 16_384
export const MDM_CONTENT_BODY_LIMIT = 16_777_216
export const isMdmContentRequest = (method: string, path: string) =>
  (method === 'POST' && /^\/api\/v3\/resources\/[^/]+\/content$/.test(path)) ||
  (method === 'PATCH' && /^\/api\/v3\/resources\/[^/]+\/uploads\/[^/]+$/.test(path))
