// The existing device fixture owns real PG/Identity/MDM/TLS and independent leased cleanup.
import { executeBounded } from '../identity/process.mjs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import process from 'node:process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
assert.ok(process.env.MDM_REACT_POLICY_BACKEND, 'Set MDM_REACT_POLICY_BACKEND to rss-mdm')
const backend = resolve(process.env.MDM_REACT_POLICY_BACKEND),
  env = { ...process.env, MDM_DEVICE_BROWSER_MODULE: 'react-policy-browser.mjs' }
let active,
  interrupted = false,
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
    env,
    timeoutMs,
    graceMs: 10000,
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
  if (result.status !== 0 || result.timedOut) throw new Error('execution-failed')
}
const leased = (script, timeoutMs) =>
  run(
    'python3',
    ['hack/build_run.py', '--', 'python3', resolve(root, script), root],
    backend,
    timeoutMs,
  )
try {
  await run('pnpm', ['build:mdm'], root, 600000)
  phase = 'policies'
  let failure
  try {
    await leased('e2e/mdm/device-fixture.py', 3600000)
  } catch (error) {
    failure = error
  } finally {
    phase = 'cleanup'
    try {
      await leased('e2e/mdm/device-cleanup.py', 180000)
      console.log(JSON.stringify({ phase, result: 'passed', journey: 'react-policy' }))
    } catch {
      console.error(
        JSON.stringify({
          phase,
          result: 'failed',
          recoveryDirectory: resolve(backend, 'artifacts/dev-environment/react-policy-browser'),
        }),
      )
      failure = new Error('cleanup-unconfirmed')
    }
  }
  if (failure) throw failure
} catch (error) {
  console.error(JSON.stringify({ phase, result: 'failed', classification: error.message }))
  process.exitCode = 1
}
