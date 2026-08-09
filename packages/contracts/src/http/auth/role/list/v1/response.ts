/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/http/auth/role/list/v1/response.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

export interface HttpAuthRoleListV1Response {
  data: {
    id: string;
    name: string;
    permissions: {
      resource: string;
      action: string;
    }[];
  }[];
  nextCursor: string;
  hasMore: boolean;
}
