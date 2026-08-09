/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/http/deviceidentity/renew/v1/response.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

export interface HttpDeviceidentityRenewV1Response {
  data: {
    /**
     * Issued leaf certificate, base64-encoded DER (X.509).
     */
    certificate: string;
    /**
     * PKCS#7 certs-only chain (leaf→root), base64-encoded DER.
     */
    chain: string;
    certRef: DeviceidentityCertificateIdentity;
    notBefore: string;
    notAfter: string;
    /**
     * Monotonic issuance epoch; increments on each rotation.
     */
    epoch: number;
    /**
     * Certificate lifecycle state.
     */
    status: "requested" | "issued" | "active" | "near-expiry" | "renewing" | "rotated" | "revoked" | "expired";
    deviceId?: string;
    /**
     * Serial of the rotated-out prior certificate (hex, same issuer as certRef; RFC 5280 §4.1.2.2).
     */
    priorSerial?: string;
  };
}
/**
 * Provider-neutral X.509 certificate identity: an issuing CA identifier plus a serial number uniquely identify a certificate (RFC 5280 — issuer name + serial, not a globally-unique serial). Single source shared by deviceidentity status/revoke contracts and the cert-issued/cert-revoked events so every endpoint references the same identity shape. ref: RFC 5280 §4.1.2.2.
 */
export interface DeviceidentityCertificateIdentity {
  /**
   * Issuing CA identifier; with serial forms the X.509 unique identity (RFC 5280 issuer + serial).
   */
  issuer: string;
  /**
   * Certificate serial number, hex (RFC 5280 §4.1.2.2).
   */
  serial: string;
}
