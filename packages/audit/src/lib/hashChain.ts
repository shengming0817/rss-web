/**
 * hashChain.ts — pure-function hash-chain verification.
 *
 * Implements `verifyChain` against the fields that would be present once the
 * backend exposes hash/prevHash (tracked in BR-006). The algorithm is complete
 * and fully tested against all three paths (ok/broken/unavailable); when the
 * backend ships the fields, passing real data will make the ok/broken paths live
 * without any frontend change.
 *
 * Convention: entries are newest-first (same order as the API response).
 * The chain link direction: entries[i].prevHash should equal entries[i+1].hash.
 */

/**
 * With exactOptionalPropertyTypes: true, optional properties cannot be
 * assigned `undefined` explicitly. Use `hash?: string` — fields that are
 * truly absent are simply not present in the object literal.
 */
export interface ChainEntry {
  hash?: string
  prevHash?: string
}

export interface ChainResult {
  status: 'ok' | 'broken' | 'unavailable'
  brokenAt?: number
}

/**
 * Verify the hash chain across a slice of audit entries.
 *
 * - Returns `unavailable` when no entry has a hash field (backend gap BR-006).
 * - Returns `ok` when all consecutive links are intact.
 * - Returns `broken` with `brokenAt` (index of the first broken link) when a
 *   link mismatch is detected.
 */
export function verifyChain(entries: ChainEntry[]): ChainResult {
  if (entries.length === 0) return { status: 'unavailable' }

  // Check whether any entry carries a hash. If none do, the backend has not
  // yet exposed the field (BR-006).
  const hasAnyHash = entries.some((e) => e.hash !== undefined && e.hash !== null)
  if (!hasAnyHash) return { status: 'unavailable' }

  // If there is exactly one entry with a hash, there is nothing to chain-check.
  if (entries.length === 1) return { status: 'ok' }

  // Walk the chain: entries[i].prevHash must equal entries[i+1].hash.
  for (let i = 0; i < entries.length - 1; i++) {
    const current = entries[i]
    const next = entries[i + 1]

    // If we reach a segment that has no hash info, treat the whole chain as
    // unavailable (mixed state — backend partially backfilled).
    if (current?.hash === undefined || next?.hash === undefined) {
      return { status: 'unavailable' }
    }

    if (current.prevHash !== next.hash) {
      return { status: 'broken', brokenAt: i }
    }
  }

  return { status: 'ok' }
}
