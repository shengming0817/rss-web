/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/http/devicecompliance/v1/response.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

export interface HttpDevicecomplianceV1Response {
  data: {
    /**
     * Provider-neutral device identifier, echoed from the query parameter.
     */
    deviceId: string;
    /**
     * Overall posture verdict: true when the device satisfies the policy baseline. Provider-agnostic roll-up of the individual posture attributes (and any provider-specific signals not surfaced as discrete fields).
     */
    compliant: boolean;
    /**
     * Disk encryption posture, provider-neutral (BitLocker / FileVault / LUKS). unknown when the provider did not report it.
     */
    diskEncryption: "enabled" | "disabled" | "unknown";
    /**
     * Antivirus / endpoint-protection posture. unknown when the provider did not report it.
     */
    antivirus: "enabled" | "disabled" | "unknown";
    /**
     * OS / security patch posture. unknown when the provider did not report it.
     */
    patch: "upToDate" | "outOfDate" | "unknown";
    /**
     * Host firewall posture. unknown when the provider did not report it.
     */
    firewall: "enabled" | "disabled" | "unknown";
    /**
     * Time this posture reading was determined (freshness anchor); always present — a posture verdict without a timestamp is unsafe to trust for Authorize decisions.
     */
    observedAt: string;
    /**
     * Tenant this posture reading belongs to; framework-derived from the authenticated principal, never accepted as a client query parameter.
     */
    tenantId?: string;
  };
}
