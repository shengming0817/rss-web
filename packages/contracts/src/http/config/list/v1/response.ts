/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/http/config/list/v1/response.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

/**
 * Paginated list of ConfigEntry.
 */
export interface HttpConfigListV1Response {
  data: {
    id: string;
    key: string;
    value: string;
    /**
     * true 表示该 entry 的 value 已脱敏返回
     */
    sensitive: boolean;
    version: number;
    createdAt: string;
    updatedAt: string;
  }[];
  nextCursor: string;
  hasMore: boolean;
}
