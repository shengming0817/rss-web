// One browser entry: consume an explicit host or own a disposable real backend.
import { executeBounded } from '../identity/process.mjs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import process from 'node:process'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const backend = process.env.MDM_ENROLLMENT_BACKEND && resolve(process.env.MDM_ENROLLMENT_BACKEND)
assert.ok(
  backend || process.env.MDM_ENROLLMENT_BROWSER_FIXTURE,
  'Set MDM_ENROLLMENT_BACKEND or MDM_ENROLLMENT_BROWSER_FIXTURE',
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
  if (backend) {
    await run('pnpm', ['build:mdm'], root, 600000)
    phase = 'backend'
    started = true
    await run(
      'python3',
      ['hack/build_run.py', '--', 'python3', resolve(root, 'e2e/mdm/enrollment-fixture.py'), root],
      backend,
      3600000,
    )
  } else {
    phase = 'browser'
    await run('node', ['e2e/mdm/enrollment-browser.mjs'], root, 240000)
  }
} catch (error) {
  console.error(JSON.stringify({ phase, result: 'failed', classification: error.message }))
  process.exitCode = 1
} finally {
  if (started) {
    phase = 'cleanup'
    for (const group of ['enrollment-native', 'enrollment-agent', 'enrollment-browser']) {
      try {
        const action =
          group === 'enrollment-browser'
            ? ['hack/t2_environment.py', 'reset', '--group', group]
            : [
                '-c',
                `import sys; sys.path.insert(0, 'hack'); from pathlib import Path; from t2_environment import Environment; Environment(Path.cwd(), group='${group}').host_ports(release=True)`,
              ]
        await run('python3', ['hack/build_run.py', '--', 'python3', ...action], backend, 180000)
      } catch (error) {
        console.error(
          JSON.stringify({
            phase,
            result: 'failed',
            group,
            classification: error.message,
            recoveryDirectory:
              group === 'enrollment-browser'
                ? resolve(backend, 'artifacts/dev-environment/' + group)
                : 'User cache: rss-mdm-dev-ports',
          }),
        )
        process.exitCode = 1
      }
    }
  }
}
