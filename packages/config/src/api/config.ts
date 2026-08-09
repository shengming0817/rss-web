/**
 * config.ts — configuration entry API (configcore slice).
 *
 * Provides list/get/write/update/delete/publish/rollback over the
 * /api/v1/config/ collection. Mutations (update/rollback) carry CAS
 * expectedVersion; 409 ERR_VERSION_CONFLICT is re-thrown for callers.
 *
 * Sensitive entries: list/publish/rollback return value="******" when
 * sensitive=true. Callers MUST NOT echo "******" back as write input;
 * the sensitive write guard lives in configValidation.isRedactedPlaceholder().
 */
import { http } from '@gocell/request'
import type {
  HttpConfigListV1Response,
  HttpConfigGetV1Response,
  HttpConfigWriteV1Request,
  HttpConfigUpdateV1Request,
  HttpConfigPublishV1Response,
  HttpConfigRollbackV1Request,
} from '@gocell/contracts'

/** Collection endpoint for config entries. */
export const CONFIG_URL = '/api/v1/config/'

/** Item endpoint for a single config entry (GET/PUT/DELETE + sub-resources). */
const configItemUrl = (key: string): string => `${CONFIG_URL}${encodeURIComponent(key)}`

/**
 * A single config entry row, codegen-derived from the list contract.
 * Sensitive entries return value="******" from the backend — never re-use that
 * placeholder as write input. Use isRedactedPlaceholder() from configValidation
 * to guard write paths.
 */
export type ConfigEntry = HttpConfigListV1Response['data'][number]

/** Publish snapshot (returned from publishConfig). */
export type PublishSnapshot = HttpConfigPublishV1Response['data']

export interface ListConfigParams {
  cursor?: string
  limit?: number
}

/** GET /api/v1/config/ — cursor-paginated config entry list. */
export async function listConfig(params: ListConfigParams = {}): Promise<HttpConfigListV1Response> {
  const res = await http.get<HttpConfigListV1Response>(CONFIG_URL, { params })
  return res.data
}

/** GET /api/v1/config/{key} — single entry. */
export async function getConfig(key: string): Promise<ConfigEntry> {
  const res = await http.get<HttpConfigGetV1Response>(configItemUrl(key))
  return res.data.data
}

/**
 * POST /api/v1/config/ — write (create) a new entry.
 * Resolves void on success; rejects for the caller to surface inline.
 */
export async function writeConfig(body: HttpConfigWriteV1Request): Promise<void> {
  await http.post(CONFIG_URL, body)
}

/**
 * PUT /api/v1/config/{key} — update an existing entry with CAS guard.
 * 409 ERR_VERSION_CONFLICT → re-thrown; caller must handle inline.
 */
export async function updateConfig(key: string, body: HttpConfigUpdateV1Request): Promise<void> {
  await http.put(configItemUrl(key), body)
}

/** DELETE /api/v1/config/{key}. */
export async function deleteConfig(key: string): Promise<void> {
  await http.delete(configItemUrl(key))
}

/**
 * POST /api/v1/config/{key}/publish — publish a snapshot.
 * No request body (backend infers from current entry state).
 * Returns the publish snapshot; sensitive=true → value is "******".
 */
export async function publishConfig(key: string): Promise<PublishSnapshot> {
  const res = await http.post<HttpConfigPublishV1Response>(`${configItemUrl(key)}/publish`)
  return res.data.data
}

/**
 * POST /api/v1/config/{key}/rollback — rollback to a prior version with CAS guard.
 * No history-list endpoint (BR-008 pending): caller supplies target version manually.
 * 409 ERR_VERSION_CONFLICT → re-thrown.
 */
export async function rollbackConfig(
  key: string,
  body: HttpConfigRollbackV1Request,
): Promise<void> {
  await http.post(`${configItemUrl(key)}/rollback`, body)
}
