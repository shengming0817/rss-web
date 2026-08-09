/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/http/config/publish/v1/response.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

/**
 * Snapshot of the published config version. When sensitive=true, value is replaced with the literal placeholder "******" (dto.RedactedValue) and MUST NOT be reused as input on any write path — fetch the original value via configwrite if you need to round-trip.
 */
export interface HttpConfigPublishV1Response {
  data: {
    id: string;
    configId: string;
    version: number;
    /**
     * Snapshot value. If sensitive=true, this is the redaction placeholder "******", not the real secret.
     */
    value: string;
    /**
     * True iff the source ConfigEntry is sensitive. When true, value is redacted in this response and clients must NOT echo it back as input.
     */
    sensitive: boolean;
    publishedAt?: string;
  };
}
