/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/http/devicestate/v1/response.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

export interface HttpDevicestateV1Response {
  data: {
    deviceId: string;
    state: "online" | "offline" | "unknown";
    /**
     * Time this presence reading was determined (freshness anchor); always present even when state is unknown.
     */
    observedAt: string;
    lastSeenAt?: string;
    tenantId?: string;
  };
}
