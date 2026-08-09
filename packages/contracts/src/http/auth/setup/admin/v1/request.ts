/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/http/auth/setup/admin/v1/request.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

export interface HttpAuthSetupAdminV1Request {
  username: string;
  email: string;
  /**
   * 8 to 72 printable ASCII bytes. The ASCII restriction keeps JSON Schema maxLength aligned with bcrypt's 72-byte input limit.
   */
  password: string;
}
