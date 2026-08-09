/**
 * registry.spec.ts — AI-robust reverse-check for FLAG_KEYS / FlagKey.
 *
 * AI-robust档位: Hard — FlagKey is a literal union derived from FLAG_KEYS `as const`.
 * Passing an unknown string literal to useFlag() is a compile-time error (not expressible).
 * This spec verifies:
 *   1. FLAG_KEYS contains at least one entry (registry is non-empty).
 *   2. FlagKey values equal the FLAG_KEYS values (the union is correct).
 *   3. @ts-expect-error reverse-check: an unknown literal string is NOT assignable to FlagKey.
 */
import { describe, it, expect } from 'vitest'
import { FLAG_KEYS, type FlagKey } from './registry'

describe('FLAG_KEYS registry', () => {
  it('is a non-empty object with string values', () => {
    const keys = Object.keys(FLAG_KEYS)
    expect(keys.length).toBeGreaterThan(0)
  })

  it('values are non-empty strings', () => {
    for (const v of Object.values(FLAG_KEYS)) {
      expect(typeof v).toBe('string')
      expect(v.length).toBeGreaterThan(0)
    }
  })

  it('FlagKey union includes all FLAG_KEYS values', () => {
    // Exhaustively verify each value is assignable to FlagKey at compile time.
    // Object.values(FLAG_KEYS) infers FlagKey[] from the `as const` declaration,
    // so direct assignment (no cast) is the true type check.
    for (const v of Object.values(FLAG_KEYS)) {
      const asKey: FlagKey = v
      expect(typeof asKey).toBe('string')
    }
  })
})

describe('FLAG_KEYS · AI-robust reverse-check (compile-time guard)', () => {
  it('a valid FlagKey value passes type assignment', () => {
    // All values in FLAG_KEYS must be valid FlagKey literals
    const validKey: FlagKey = FLAG_KEYS.auditChainVerify
    expect(typeof validKey).toBe('string')
  })

  it('unknown string literal is rejected by TypeScript (reverse-check via @ts-expect-error)', () => {
    // @ts-expect-error — 'unknown-flag-key' is not assignable to FlagKey (hard type guard)
    const badKey: FlagKey = 'unknown-flag-key'
    // runtime: still a string, but compile-time this is blocked
    expect(typeof badKey).toBe('string')
  })
})
