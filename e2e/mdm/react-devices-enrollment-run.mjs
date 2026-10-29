// Reuse the real device and enrollment hosts with the explicit React composition.
import { executeBounded } from '../identity/process.mjs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import process from 'node:process'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
assert.ok(process.env.MDM_REACT_DEVICES_BACKEND, 'Set MDM_REACT_DEVICES_BACKEND to rss-mdm')
const backend = resolve(process.env.MDM_REACT_DEVICES_BACKEND),
  env = {
    ...process.env,
    MDM_DEVICE_BROWSER_MODULE: 'react-devices-browser.mjs',
    MDM_ENROLLMENT_BROWSER_MODULE: 'react-enrollment-browser.mjs',
  }
const selected = process.argv[2] ?? 'all'
assert.ok(['all', 'device', 'enrollment'].includes(selected), 'Select all, device or enrollment')
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
const leased = (args, timeout = 180000) =>
  run('python3', ['hack/build_run.py', '--', 'python3', ...args], backend, timeout)
try {
  await run('pnpm', ['build:mdm'], root, 600000)
  for (const journey of selected === 'all' ? ['device', 'enrollment'] : [selected]) {
    phase = journey
    let failure
    try {
      await leased([resolve(root, `e2e/mdm/${journey}-fixture.py`), root], 3600000)
    } catch (error) {
      failure = error
    } finally {
      phase = 'cleanup'
      const actions =
        journey === 'device'
          ? [[resolve(root, 'e2e/mdm/device-cleanup.py'), root]]
          : [[resolve(root, 'e2e/mdm/enrollment-cleanup.py'), root]]
      let cleanupFailed = false
      for (const args of actions) {
        try {
          await leased(args)
        } catch {
          cleanupFailed = true
        }
      }
      if (cleanupFailed) {
        console.error(
          JSON.stringify({
            phase,
            result: 'failed',
            recoveryDirectory: resolve(
              backend,
              'artifacts/dev-environment',
              journey === 'device' ? 'react-devices-browser' : 'react-enrollment-browser',
            ),
          }),
        )
        failure = new Error('cleanup-unconfirmed')
      } else {
        console.log(JSON.stringify({ phase, result: 'passed', journey }))
      }
    }
    if (failure) {
      console.error(
        JSON.stringify({ phase: journey, result: 'failed', classification: failure.message }),
      )
      process.exitCode = 1
      if (interrupted) break
    }
  }
} catch (error) {
  console.error(JSON.stringify({ phase, result: 'failed', classification: error.message }))
  process.exitCode = 1
}
