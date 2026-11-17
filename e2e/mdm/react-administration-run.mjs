import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { executeBounded } from '../identity/process.mjs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import assert from 'node:assert/strict'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
  backend = process.env.MDM_REACT_ADMIN_BACKEND
const shared = process.argv[2] === 'shared-candidate'
assert.ok(backend, 'MDM_REACT_ADMIN_BACKEND is required')
assert.ok(
  shared ? process.env.MDM_REACT_ADMIN_CANDIDATE : process.env.IDENTITY_BACKEND_FIXTURE,
  shared ? 'MDM_REACT_ADMIN_CANDIDATE is required' : 'IDENTITY_BACKEND_FIXTURE is required',
)
const installation = resolve(root, 'e2e/mdm/shared-tenant-installation.py')
const env = { ...process.env }
let tag,
  active,
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
  if (result.status !== 0 || result.timedOut || (interrupted && phase !== 'cleanup'))
    throw new Error('execution-failed')
}
try {
  if (shared) {
    tag = 'rss-mdm-web:shared-' + randomUUID()
    await run('pnpm', ['image:mdm', '--tag', tag], root, 1200000)
    env.MDM_REACT_ADMIN_WEB_IMAGE = execFileSync(
      'docker',
      ['image', 'inspect', '--format', '{{.Id}}', tag],
      { encoding: 'utf8', timeout: 30000 },
    ).trim()
    phase = 'shared-installation'
    started = true
    await run(
      'python3',
      ['hack/build_run.py', '--', 'python3', installation, root],
      resolve(backend),
      1500000,
    )
  } else {
    await run('pnpm', ['build:mdm'], root, 600000)
    phase = 'backend'
    started = true
    await run(
      'python3',
      ['hack/build_run.py', '--', 'python3', resolve(root, 'e2e/mdm/profiles-fixture.py'), root],
      resolve(backend),
      1500000,
    )
  }
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
          ...(shared
            ? [installation, root, '--cleanup']
            : ['hack/dev_environment.py', 'reset', '--group', 'react-administration-browser']),
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
          recoveryDirectory: resolve(
            backend,
            'artifacts/dev-environment',
            shared
              ? 'web-shared-' + createHash('sha256').update(root).digest('hex').slice(0, 16)
              : 'react-administration-browser',
          ),
        }),
      )
      process.exitCode = 1
    }
  }
  if (tag) {
    phase = 'cleanup'
    try {
      const present = execFileSync('docker', ['image', 'ls', '--quiet', tag], {
        encoding: 'utf8',
        timeout: 30000,
      }).trim()
      if (present) await run('docker', ['image', 'rm', tag], root, 60000)
    } catch {
      console.error(JSON.stringify({ phase, result: 'failed', recoveryImage: tag }))
      process.exitCode = 1
    }
  }
}
