/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/http/auth/role/assign/v1/response.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

export interface HttpAuthRoleAssignV1Response {
  data: {
    userId: string;
    roleId: string;
    assigned: boolean;
  };
}
