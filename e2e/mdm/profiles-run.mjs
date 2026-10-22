import { executeBounded } from '../identity/process.mjs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import assert from 'node:assert/strict'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
  backend = process.env.MDM_PROFILE_BACKEND
assert.ok(
  backend && process.env.IDENTITY_BACKEND_FIXTURE,
  'MDM_PROFILE_BACKEND and IDENTITY_BACKEND_FIXTURE are required',
)
let active,
  interrupted = false,
  started = false,
  phase = 'build'
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    interrupted = true
    if (phase !== 'cleanup') active?.()
  })
async function run(command, args, cwd, timeoutMs) {
  const result = await executeBounded(command, args, {
    cwd,
    env: process.env,
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
  if (result.status !== 0 || result.timedOut || (interrupted && phase !== 'cleanup'))
    throw new Error('execution-failed')
}
try {
  await run('pnpm', ['build:mdm'], root, 600000)
  phase = 'backend'
  started = true
  await run(
    'python3',
    ['hack/build_run.py', '--', 'python3', resolve(root, 'e2e/mdm/profiles-fixture.py'), root],
    resolve(backend),
    1500000,
  )
} catch (error) {
  console.error(JSON.stringify({ phase, result: 'failed', classification: error.message }))
  process.exitCode = 1
} finally {
  if (started) {
    phase = 'cleanup'
    try {
      await run(
        'python3',
        [
          'hack/build_run.py',
          '--',
          'python3',
          'hack/t2_environment.py',
          'reset',
          '--group',
          'profiles-browser',
        ],
        resolve(backend),
        180000,
      )
      console.log(JSON.stringify({ phase, result: 'passed' }))
    } catch {
      console.error(
        JSON.stringify({
          phase,
          result: 'failed',
          recoveryDirectory: resolve(backend, 'artifacts/dev-environment/profiles-browser'),
        }),
      )
      process.exitCode = 1
    }
  }
}
