/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/http/config/update/v1/response.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

export interface HttpConfigUpdateV1Response {
  data: {
    id: string;
    key: string;
    value: string;
    sensitive: boolean;
    version: number;
    createdAt: string;
    updatedAt: string;
  };
}
