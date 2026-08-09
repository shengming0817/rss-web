/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/http/auth/user/change-password/v1/response.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

export interface HttpAuthUserChangePasswordV1Response {
  data: {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
    sessionId: string;
    userId: string;
    passwordResetRequired: boolean;
  };
}
