// Build this checkout, then consume a disposable real backend through HTTPS Chromium.
import { executeBounded } from '../identity/process.mjs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import assert from 'node:assert/strict'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
  backend = process.env.MDM_DEVICE_BACKEND
assert.ok(backend, 'MDM_DEVICE_BACKEND must point to an rss-mdm checkout')
process.env.MDM_DEVICE_BACKEND = resolve(backend)
let active,
  interrupted = false
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    interrupted = true
    active?.()
  })
async function run(command, args, cwd, timeoutMs) {
  if (interrupted) throw new Error('interrupted')
  const result = await executeBounded(command, args, {
    cwd,
    env: process.env,
    timeoutMs,
    graceMs: 5000,
    stdio: ['ignore', 'inherit', 'inherit'],
    onChild: (_child, terminate) => {
      active = terminate
      if (interrupted) terminate()
    },
    onRelease: () => {
      active = undefined
    },
  })
  if (interrupted || result.timedOut || result.status !== 0)
    throw new Error('device acceptance failed')
}
try {
  await run('pnpm', ['build:mdm'], root, 600000)
  await run(
    'python3',
    ['hack/build_run.py', '--', 'python3', resolve(root, 'e2e/mdm/device-fixture.py'), root],
    resolve(backend),
    3600000,
  )
} catch {
  process.exitCode = 1
}
