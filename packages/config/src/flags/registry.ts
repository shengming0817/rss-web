/**
 * registry.ts — feature flag key registry.
 *
 * AI-robust档位: Hard — FlagKey is a literal union derived from FLAG_KEYS `as const`.
 * This means passing any unknown string literal to useFlag(key: FlagKey) is a
 * compile-time error — the violation is NOT expressible in TypeScript.
 *
 * HOW TO ADD A NEW FLAG:
 *   1. Add an entry to FLAG_KEYS: { myFeature: 'my.feature-key' }
 *   2. The FlagKey union automatically expands to include 'my.feature-key'.
 *   3. useFlag(FLAG_KEYS.myFeature) now resolves correctly from the store cache.
 *   NEVER pass a raw string literal to useFlag() — always use FLAG_KEYS.<name>.
 *
 * BLINDED AREAS (不覆盖的情形 — 反向自检见 registry.spec.ts):
 *   - Dynamic string variables (e.g., `useFlag(someVar as FlagKey)`) bypass the
 *     literal-union guard at compile time. Callers must not use dynamic cast.
 *   - Flag keys that exist on the backend but are not yet registered here are
 *     unknown at compile time and default to `false` at runtime (fail-safe).
 *
 * Reference: PRD §308 — useFlag归@gocell/config/composables；禁前端硬编flag名.
 */

/**
 * Registry of all known feature flag keys.
 * Add new flags here when they are introduced on the backend.
 *
 * Property names are camelCase identifiers for use in TypeScript code.
 * Values are the exact flag key strings as registered in the backend configcore.
 */
export const FLAG_KEYS = {
  /** Enables cryptographic chain verification in the audit cell. */
  auditChainVerify: 'audit.chain-verify',
  /** Example: new payments checkout flow (add real flags as they are onboarded). */
  paymentsNewCheckout: 'payments.new-checkout',
} as const

/**
 * Literal union of all registered flag key strings.
 * Passing an unknown string literal to useFlag(key: FlagKey) is a compile-time error.
 *
 * Hard档: this constraint is enforced by the TypeScript type system.
 * Reverse check in registry.spec.ts confirms unknown literals are rejected.
 */
export type FlagKey = (typeof FLAG_KEYS)[keyof typeof FLAG_KEYS]
