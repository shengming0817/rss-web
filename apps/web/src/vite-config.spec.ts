// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { resolveWebBuildRevision } from '../vite.config'

describe('Web build revision resolver', () => {
  it('prefers and validates the explicit archive/image revision', () => {
    expect(resolveWebBuildRevision('a'.repeat(40), 'production')).toBe('a'.repeat(40))
    expect(() => resolveWebBuildRevision('main', 'production')).toThrow('RSS_WEB_REVISION')
  })

  it('requires an explicit production revision and uses a fixed non-production identity', () => {
    expect(() => resolveWebBuildRevision(undefined, 'production')).toThrow('RSS_WEB_REVISION')
    expect(resolveWebBuildRevision(undefined, 'development')).toBe('development')
    expect(resolveWebBuildRevision(undefined, 'test')).toBe('development')
  })
})
