/**
 * flags.ts — feature flag API (configcore slice).
 *
 * Provides list/get/create/update/toggle/evaluate/delete over the
 * /api/v1/flags/ collection. Mutations (update/toggle) carry CAS
 * expectedVersion; 409 ERR_VERSION_CONFLICT is re-thrown for callers.
 *
 * Flag `type` field is a free string (e.g., "boolean"). Variant
 * configuration is not available via the current API — the `type` field
 * is read-only in the UI (BR-007 pending: flag variant schema).
 *
 * evaluate endpoint: POST /{key}/evaluate returns { key, enabled } only.
 * It is an admin endpoint and NOT suitable for high-frequency polling.
 * useFlag() composable uses the list cache for runtime flag checks instead.
 */
import { http } from '@gocell/request'
import type {
  HttpConfigFlagsListV1Response,
  HttpConfigFlagsCreateV1Request,
  HttpConfigFlagsUpdateV1Request,
  HttpConfigFlagsToggleV1Request,
  HttpConfigFlagsEvaluateV1Request,
  HttpConfigFlagsEvaluateV1Response,
  HttpConfigFlagsGetV1Response,
} from '@gocell/contracts'

/** Collection endpoint for feature flags. */
export const FLAGS_URL = '/api/v1/flags/'

/** Item endpoint for a single flag (GET/PUT/DELETE + sub-resources). */
const flagItemUrl = (key: string): string => `${FLAGS_URL}${encodeURIComponent(key)}`

/**
 * A single feature flag row, codegen-derived from the list contract.
 * Flag `type` is a free string — variant config is not available (BR-007 pending).
 */
export type FeatureFlag = HttpConfigFlagsListV1Response['data'][number]

export interface ListFlagsParams {
  cursor?: string
  limit?: number
}

/** GET /api/v1/flags/ — cursor-paginated feature flag list. */
export async function listFlags(
  params: ListFlagsParams = {},
): Promise<HttpConfigFlagsListV1Response> {
  const res = await http.get<HttpConfigFlagsListV1Response>(FLAGS_URL, { params })
  return res.data
}

/** GET /api/v1/flags/{key} — single flag. */
export async function getFlag(key: string): Promise<FeatureFlag> {
  const res = await http.get<HttpConfigFlagsGetV1Response>(flagItemUrl(key))
  return res.data.data
}

/**
 * POST /api/v1/flags/ — create a new feature flag.
 * Resolves void on success; rejects for the caller to surface inline.
 * Note: `type` is NOT accepted in the create payload (BR-007 pending).
 */
export async function createFlag(body: HttpConfigFlagsCreateV1Request): Promise<void> {
  await http.post(FLAGS_URL, body)
}

/**
 * PUT /api/v1/flags/{key} — update a flag with CAS guard (full replacement).
 * 409 ERR_VERSION_CONFLICT → re-thrown; caller must handle inline.
 * Use for rollout% updates; for flip-only use toggleFlag.
 */
export async function updateFlag(key: string, body: HttpConfigFlagsUpdateV1Request): Promise<void> {
  await http.put(flagItemUrl(key), body)
}

/**
 * POST /api/v1/flags/{key}/toggle — partial flip of `enabled` with CAS guard.
 * Used by the kill switch flow (enabled: false, expectedVersion: current).
 * 409 ERR_VERSION_CONFLICT → re-thrown.
 */
export async function toggleFlag(key: string, body: HttpConfigFlagsToggleV1Request): Promise<void> {
  await http.post(`${flagItemUrl(key)}/toggle`, body)
}

/**
 * POST /api/v1/flags/{key}/evaluate — evaluate a flag for a given subject.
 * Returns { key, enabled } only — no variant value (BR-007 pending).
 * NOTE: This is an admin endpoint; useFlag() uses the list cache instead.
 */
export async function evaluateFlag(
  key: string,
  body: HttpConfigFlagsEvaluateV1Request,
): Promise<HttpConfigFlagsEvaluateV1Response['data']> {
  const res = await http.post<HttpConfigFlagsEvaluateV1Response>(
    `${flagItemUrl(key)}/evaluate`,
    body,
  )
  return res.data.data
}

/** DELETE /api/v1/flags/{key}. */
export async function deleteFlag(key: string): Promise<void> {
  await http.delete(flagItemUrl(key))
}
