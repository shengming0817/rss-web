/**
 * setup.ts — first-run bootstrap API (accesscore `setup` slice).
 *
 * Two endpoints, both authentication-establishing, so both carry
 * __skipAuthRefresh: their 401 is a credential verdict (operator Basic Auth),
 * never an expired session — it must surface inline, not bounce to /login.
 */
import { http } from '@gocell/request'
import type {
  HttpAuthSetupAdminV1Request,
  HttpAuthSetupAdminV1Response,
  HttpAuthSetupStatusV1Response,
} from '@gocell/contracts'

export const SETUP_STATUS_URL = '/api/v1/access/setup/status'
export const SETUP_ADMIN_URL = '/api/v1/access/setup/admin'

/** Operator (Plane A) Basic Auth credentials — env-injected, never persisted. */
export interface OperatorCredentials {
  username: string
  password: string
}

/**
 * GET setup/status → hasAdmin.
 *
 * `true` means first-run is already complete (the wizard must redirect to
 * /login); `false` means the first admin can still be created.
 */
export async function fetchSetupStatus(): Promise<boolean> {
  const res = await http.get<HttpAuthSetupStatusV1Response>(SETUP_STATUS_URL, {
    __skipAuthRefresh: true,
  })
  return res.data.data.hasAdmin
}

/**
 * POST setup/admin — operator Basic Auth header (Plane A) authenticates the
 * call; the admin identity (Plane B) travels in the JSON body. Resolves with
 * the created admin on 201; rejects with the axios error (i18nKey attached by
 * the interceptor, `.response.status` for 401/409/410/429/400/413 handling).
 */
export async function createAdmin(
  operator: OperatorCredentials,
  body: HttpAuthSetupAdminV1Request,
): Promise<HttpAuthSetupAdminV1Response['data']> {
  const res = await http.post<HttpAuthSetupAdminV1Response>(SETUP_ADMIN_URL, body, {
    headers: { Authorization: toBasicAuth(operator) },
    __skipAuthRefresh: true,
  })
  return res.data.data
}

/**
 * Build an `Authorization: Basic <base64(user:pass)>` header. btoa is adequate
 * because the backend mandates printable-ASCII bootstrap credentials.
 */
function toBasicAuth({ username, password }: OperatorCredentials): string {
  return `Basic ${btoa(`${username}:${password}`)}`
}
