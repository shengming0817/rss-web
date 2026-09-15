// Consumer-owned adapter acceptance. The backend supplies only a disposable test fixture.
import { createHash } from 'node:crypto'
import {
  readFileSync,
  readdirSync,
  lstatSync,
  writeFileSync,
  renameSync,
  mkdtempSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { executeBounded } from '../real/process.mjs'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
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
  format_version: 1,
  frontend: null,
  backend: null,
  artifact_sha256: null,
  runner_sha256: null,
  scope: 'Identity HTTP/UI adapter T2',
  node: process.version,
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
function publish() {
  const evidence = JSON.stringify(record, null, 2)
  if (process.env.IDENTITY_JOINT_RECORD) {
    const path = resolve(process.env.IDENTITY_JOINT_RECORD)
    const temporary = path + '.' + process.pid + '.tmp'
    writeFileSync(temporary, evidence, { mode: 0o600 })
    renameSync(temporary, path)
  }
  console.log(evidence)
}
function git(cwd, args) {
  const result = spawnSync('/usr/bin/git', args, { cwd, encoding: 'utf8', timeout: 10_000 })
  if (result.status !== 0) throw new Error('Source identity unavailable')
  return result.stdout.trim()
}
function source(cwd, lock) {
  return {
    revision: git(cwd, ['rev-parse', 'HEAD']),
    lock_sha256: digest(readFileSync(resolve(cwd, lock))),
    dirty: git(cwd, ['status', '--porcelain', '--untracked-files=normal']) !== '',
  }
}
function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}
function artifact(directory) {
  const entries = []
  function visit(path) {
    for (const entry of readdirSync(path).sort()) {
      const file = resolve(path, entry)
      const stat = lstatSync(file)
      if (stat.isSymbolicLink()) throw new Error('Artifact symlinks are not supported')
      if (stat.isDirectory()) visit(file)
      else entries.push([relative(directory, file), digest(readFileSync(file))])
    }
  }
  visit(directory)
  return digest(JSON.stringify(entries))
}
const dist = resolve(root, 'apps/identity/dist')
const runner = resolve(root, 'e2e/identity/real.mjs')
try {
  if (!backend || process.platform === 'win32') throw new Error('environment')
  record.frontend = source(root, 'pnpm-lock.yaml')
  record.backend = source(backend, 'Cargo.lock')
  if (record.frontend.dirty || record.backend.dirty) throw new Error('uncommitted source')
  record.runner_sha256 = digest(readFileSync(runner))
  phase = 'build'
  await run('pnpm', ['-F', '@rss/identity-app', 'build'], root, {
    ...process.env,
    RSS_IDENTITY_WEB_REVISION: record.frontend.revision,
  })
  phase = 'artifact'
  await run('pnpm', ['check:identity-app:build'], root)
  record.artifact_sha256 = artifact(dist)
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
  phase = 'verification'
  if (
    artifact(dist) !== record.artifact_sha256 ||
    JSON.stringify(source(root, 'pnpm-lock.yaml')) !== JSON.stringify(record.frontend) ||
    JSON.stringify(source(backend, 'Cargo.lock')) !== JSON.stringify(record.backend)
  )
    throw new Error('inputs changed')
  record.result = 'passed'
} catch (error) {
  record.failure = {
    phase,
    ...(error instanceof CommandFailure ? { execution: error.execution } : {}),
    classification: interrupted
      ? 'interrupted'
      : error?.message === 'timeout'
        ? 'timeout'
        : ['preflight', 'build', 'artifact', 'backend'].includes(phase)
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
            ...fixture.failure,
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
  try {
    publish()
  } catch {
    console.error('Identity joint receipt could not be written')
    record.result = 'failed'
  }
  if (record.result !== 'passed') process.exitCode = 1
}
