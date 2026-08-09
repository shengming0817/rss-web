/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/http/config/rollback/v1/response.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

/**
 * Live ConfigEntry after rollback restored a prior snapshot. When sensitive=true, value is replaced with the literal placeholder "******" (dto.RedactedValue) and MUST NOT be reused as input on any write path. The Sensitive flag itself is also restored from the snapshot — if the live entry's sensitivity differs from the snapshot, this response reflects the snapshot's sensitivity.
 */
export interface HttpConfigRollbackV1Response {
  data: {
    id: string;
    key: string;
    /**
     * Live value after rollback. If sensitive=true, this is the redaction placeholder "******", not the real secret.
     */
    value: string;
    /**
     * True iff the rolled-back snapshot was marked sensitive. When true, value is redacted and clients must NOT echo it back as input.
     */
    sensitive: boolean;
    version: number;
    createdAt: string;
    updatedAt: string;
  };
}
