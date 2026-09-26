// Current-worktree HTTP integration with a disposable backend fixture.
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { transportDiagnostic } from './diagnostic.mjs'
import { executeBounded } from './process.mjs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const backend = process.env.IDENTITY_BACKEND_FIXTURE
let active
let interrupted = false
let scratch
let fixtureRecord
let phase = 'preflight'
let backendStarted = false
const interrupt = () => {
  interrupted = true
  active?.()
}
process.on('SIGINT', interrupt)
process.on('SIGTERM', interrupt)
const record = {
  result: 'failed',
  failure: null,
  cleanup: { status: 'not_started', recovery_targets: [] },
}
class CommandFailure extends Error {
  constructor(execution) {
    super(execution)
    this.execution = execution
  }
}
async function run(command, args, cwd, env = process.env, fixture = false) {
  if (interrupted) throw new CommandFailure('interrupted')
  const result = await executeBounded(command, args, {
    cwd,
    env,
    timeoutMs: fixture ? 3_600_000 : 600_000,
    graceMs: fixture ? 120_000 : 5_000,
    // Backend descendants keep these pipes until Python has completed ExitStack cleanup.
    stdio: fixture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    onChild: (_child, terminate) => {
      active = terminate
      if (interrupted) terminate()
    },
    onRelease: () => {
      active = undefined
    },
  }).catch(() => {
    throw new CommandFailure('spawn')
  })
  if (interrupted) throw new CommandFailure('interrupted')
  if (result.timedOut) throw new CommandFailure('timeout')
  if (result.status !== 0) throw new CommandFailure('exit')
}
function fixtureState() {
  if (!fixtureRecord || !existsSync(fixtureRecord)) return null
  const value = JSON.parse(readFileSync(fixtureRecord, 'utf8'))
  if (
    value.format_version !== 1 ||
    !['running', 'passed', 'failed'].includes(value.result) ||
    !['pending', 'passed', 'failed'].includes(value.cleanup?.status) ||
    !Array.isArray(value.cleanup.recovery_targets) ||
    value.cleanup.recovery_targets.length > 8 ||
    value.cleanup.recovery_targets.some(
      (v) => typeof v !== 'string' || !/^(identity-t2-[a-f0-9]{32}|volume:[a-f0-9]{64})$/.test(v),
    )
  )
    throw new Error('fixture record')
  return value
}
const dist = resolve(root, 'apps/identity/dist')
const runner = resolve(root, 'e2e/identity/real.mjs')
try {
  if (!backend || process.platform === 'win32') throw new Error('environment')
  phase = 'build'
  await run('pnpm', ['build:identity'], root)
  scratch = mkdtempSync(resolve(tmpdir(), 'identity-joint-' + process.pid + '-'))
  fixtureRecord = resolve(scratch, 'fixture.json')
  phase = 'backend'
  backendStarted = true
  await run(
    'make',
    ['test-ui'],
    backend,
    {
      ...process.env,
      IDENTITY_UI_DIST: dist,
      IDENTITY_UI_RUNNER: runner,
      IDENTITY_UI_FIXTURE_RECORD: fixtureRecord,
    },
    true,
  )
  const fixture = fixtureState()
  if (!fixture || fixture.result !== 'passed' || fixture.cleanup.status !== 'passed')
    throw new Error('fixture record')
  record.result = 'passed'
} catch (error) {
  record.failure = {
    phase,
    ...(error instanceof CommandFailure ? { execution: error.execution } : {}),
    classification: interrupted
      ? 'interrupted'
      : error?.message === 'timeout'
        ? 'timeout'
        : ['preflight', 'build', 'backend'].includes(phase)
          ? 'environment'
          : 'assertion',
  }
} finally {
  if (backendStarted) {
    try {
      const fixture = fixtureState()
      record.cleanup =
        fixture && fixture.cleanup.status !== 'pending'
          ? fixture.cleanup
          : {
              status: 'unknown',
              recovery_targets: fixture?.cleanup.recovery_targets ?? [],
            }
      if (fixture?.failure && !interrupted && record.failure?.classification !== 'timeout') {
        const allowedPhases = ['environment', 'backend', 'browser', 'cleanup']
        const allowedClasses = ['environment', 'assertion', 'timeout', 'interrupted']
        if (
          allowedPhases.includes(fixture.failure.phase) &&
          allowedClasses.includes(fixture.failure.classification)
        )
          record.failure = {
            phase: fixture.failure.phase,
            classification: fixture.failure.classification,
            ...(transportDiagnostic(fixture.browser?.diagnostic)
              ? { diagnostic: transportDiagnostic(fixture.browser.diagnostic) }
              : {}),
            ...(record.failure?.execution ? { execution: record.failure.execution } : {}),
          }
      }
    } catch {
      record.cleanup = { status: 'unknown', recovery_targets: [] }
    }
    if (record.cleanup.status !== 'passed') {
      record.result = 'failed'
      record.failure ??= { phase: 'cleanup', classification: 'environment' }
      record.cleanup.recovery_directory = scratch
    }
  }
  if (interrupted) {
    record.result = 'failed'
    record.failure = { phase, classification: 'interrupted' }
  }
  if (scratch && record.cleanup.status === 'passed') {
    try {
      rmSync(scratch, { recursive: true })
    } catch {
      record.result = 'failed'
      record.failure ??= { phase: 'cleanup', classification: 'environment' }
      record.cleanup = { ...record.cleanup, status: 'failed', recovery_directory: scratch }
    }
  }
  process.removeListener('SIGINT', interrupt)
  process.removeListener('SIGTERM', interrupt)
  if (record.result !== 'passed') {
    const failure = record.failure
    console.error(
      `Identity integration failed: ${failure?.phase}/${failure?.classification}${failure?.execution ? '/' + failure.execution : ''}`,
    )
    if (failure?.diagnostic) console.error(JSON.stringify(failure.diagnostic))
    console.error(`Cleanup: ${record.cleanup.status}`)
    if (record.cleanup.recovery_directory)
      console.error(`Recovery directory: ${record.cleanup.recovery_directory}`)
    process.exitCode = 1
  } else {
    console.log('Identity integration passed; fixture cleanup passed')
  }
}
