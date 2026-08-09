/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/http/config/internal/get/v1/response.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

/**
 * Single ConfigEntry wrapped in {data: {...}} envelope. Internal variant of http.config.get.v1.response.
 */
export interface HttpConfigInternalGetV1Response {
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
  };
}
