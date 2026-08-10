import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const root = import.meta.dirname

describe('memory-only session security boundary', () => {
  it('contains no persistence, JWT parsing, analytics or logging in session production code', () => {
    let output = ''
    try {
      output = execFileSync(
        'rg',
        [
          '-n',
          'localStorage|sessionStorage|indexedDB|persist|jwt-decode|atob\\(|console\\.|logger\\.|analytics',
          'packages/identity/src/session',
        ],
        { cwd: root, encoding: 'utf8' },
      )
    } catch (error) {
      if ((error as { status?: number }).status !== 1) throw error
    }
    expect(output.split('\n').filter((line) => line && !line.includes('.spec.ts:'))).toEqual([])
  })

  it('does not let Identity session code author tenant or Authorization headers', () => {
    let output = ''
    try {
      output = execFileSync(
        'rg',
        ['-n', 'Authorization|X-Tenant-ID', 'packages/identity/src/session'],
        { cwd: root, encoding: 'utf8' },
      )
    } catch (error) {
      if ((error as { status?: number }).status !== 1) throw error
    }
    expect(output.split('\n').filter((line) => line && !line.includes('.spec.ts:'))).toEqual([])
  })
})
