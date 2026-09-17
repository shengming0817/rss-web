// Fixed consumer entry: production XMLHttpRequest transport in jsdom against the real TLS host.
import { writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { executeBounded } from '../real/process.mjs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
let failure = 'environment'
try {
  const origin = new URL(process.env.IDENTITY_TEST_UI_ORIGIN)
  if (
    origin.protocol !== 'https:' ||
    origin.hostname !== 'localhost' ||
    origin.origin !== process.env.IDENTITY_TEST_UI_ORIGIN ||
    !existsSync(process.env.NODE_EXTRA_CA_CERTS ?? '')
  )
    throw new Error('fixture input')
  const result = await executeBounded(
    'pnpm',
    ['exec', 'vitest', 'run', '--no-workspace', '--config', 'e2e/identity/vitest.config.mjs'],
    {
      cwd: root,
      env: process.env,
      timeoutMs: 180000,
      graceMs: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  failure = result.timedOut ? 'timeout' : result.status === 0 ? null : 'assertion'
} catch {
  /* Only a closed failure category leaves the runner. */
}
const record = { stage: failure === 'environment' ? 'environment' : 'transport', failure }
for (const path of [process.env.IDENTITY_UI_DIAGNOSTIC, process.env.IDENTITY_UI_BROWSER_RECORD]) {
  if (path) writeFileSync(path, JSON.stringify(record), { mode: 0o600 })
}
if (failure) process.exitCode = 1
