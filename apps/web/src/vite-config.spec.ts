// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { resolveWebBuildRevision } from '../vite.config'

describe('Web build revision resolver', () => {
  it('prefers and validates the explicit archive/image revision', () => {
    expect(resolveWebBuildRevision('a'.repeat(40), () => 'b'.repeat(40), 'production')).toBe(
      'a'.repeat(40),
    )
    expect(() => resolveWebBuildRevision('main', () => 'b'.repeat(40), 'production')).toThrow(
      'RSS_WEB_REVISION',
    )
  })

  it('uses a strict checkout revision and fails closed in production when absent', () => {
    expect(resolveWebBuildRevision(undefined, () => 'b'.repeat(40), 'production')).toBe(
      'b'.repeat(40),
    )
    expect(() => resolveWebBuildRevision(undefined, () => undefined, 'production')).toThrow(
      'Web build revision',
    )
    expect(resolveWebBuildRevision(undefined, () => undefined, 'development')).toBe('development')
  })
})
