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
  interrupted = false,
  backendStarted = false,
  phase = 'build'
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    interrupted = true
    if (phase !== 'cleanup') active?.()
  })
async function run(command, args, cwd, timeoutMs) {
  if (interrupted && phase !== 'cleanup') throw new Error('interrupted')
  const result = await executeBounded(command, args, {
    cwd,
    env: process.env,
    timeoutMs,
    // Let build_run finish its own five-second process-group cancellation first.
    graceMs: phase === 'backend' ? 10000 : 5000,
    stdio: ['ignore', 'inherit', 'inherit'],
    onChild: (_child, terminate) => {
      active = terminate
      if (interrupted && phase !== 'cleanup') terminate()
    },
    onRelease: () => {
      active = undefined
    },
  })
  if (interrupted && phase !== 'cleanup') throw new Error('interrupted')
  if (result.timedOut) throw new Error('timeout')
  if (result.status !== 0) throw new Error('exit')
}
try {
  await run('pnpm', ['build:mdm'], root, 600000)
  phase = 'backend'
  backendStarted = true
  await run(
    'python3',
    ['hack/build_run.py', '--', 'python3', resolve(root, 'e2e/mdm/device-fixture.py'), root],
    resolve(backend),
    3600000,
  )
} catch (error) {
  console.error(JSON.stringify({ phase, result: 'failed', classification: error.message }))
  process.exitCode = 1
} finally {
  if (backendStarted) {
    // The old build runner has closed before a fresh lease owns reset. Its 5-second
    // cancellation window cannot kill this separately bounded cleanup invocation.
    phase = 'cleanup'
    try {
      await run(
        'python3',
        ['hack/build_run.py', '--', 'python3', resolve(root, 'e2e/mdm/device-cleanup.py'), root],
        resolve(backend),
        180000,
      )
      console.log(JSON.stringify({ phase, result: 'passed' }))
    } catch (error) {
      console.error(
        JSON.stringify({
          phase,
          result: 'failed',
          classification: error.message,
          recoveryDirectory: resolve(
            backend,
            'artifacts/dev-environment',
            process.env.MDM_DEVICE_BROWSER_MODULE === 'console-browser.mjs'
              ? 'console-browser'
              : 'device-browser',
          ),
        }),
      )
      process.exitCode = 1
    }
  }
}
