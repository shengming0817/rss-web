import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
function output() {
  const directory = mkdtempSync(resolve(tmpdir(), 'identity-joint-test-'))
  directories.push(directory)
  return resolve(directory, 'record.json')
}
it('writes a failure receipt even when joint preflight cannot select a backend', () => {
  const path = output()
  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, 'e2e/identity/run.mjs')],
    {
      cwd: import.meta.dirname,
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, IDENTITY_BACKEND_FIXTURE: '', IDENTITY_JOINT_RECORD: path },
    },
  )
  expect(result.status).toBe(1)
  const record = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  expect(record['result']).toBe('failed')
  expect(record['failure']).toEqual({ phase: 'preflight', classification: 'environment' })
  expect(record['cleanup']).toEqual({ status: 'not_started', recovery_targets: [] })
  expect(result.stderr).not.toContain('Error:')
})
it('classifies missing browser CA as an environment failure without emitting a raw exception', () => {
  const path = output()
  const env = {
    ...process.env,
    IDENTITY_UI_DIAGNOSTIC: path,
    IDENTITY_TEST_UI_ORIGIN: 'https://localhost:1234',
    IDENTITY_TEST_FEDERATED_ISSUER: 'https://127.0.0.1:2345/realms/fixture',
  }
  delete env['IDENTITY_TEST_FEDERATED_CA']
  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, 'e2e/identity/real.mjs')],
    {
      cwd: import.meta.dirname,
      encoding: 'utf8',
      timeout: 10000,
      env,
    },
  )
  expect(result.status).toBe(1)
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
    stage: 'environment',
    failure: 'environment',
  })
  expect(result.stderr).toBe('')
})

it.each(['spawn', 'exit', 'malformed', 'assertion', 'timeout'] as const)(
  'classifies backend %s using execution facts and validated fixture evidence',
  (mode) => {
    const path = output()
    const root = resolve(path, '..')
    mkdirSync(resolve(root, 'e2e/identity'), { recursive: true })
    mkdirSync(resolve(root, 'apps/identity/dist'), { recursive: true })
    writeFileSync(resolve(root, 'pnpm-lock.yaml'), 'lock')
    writeFileSync(resolve(root, 'Cargo.lock'), 'lock')
    writeFileSync(resolve(root, 'e2e/identity/real.mjs'), '')
    writeFileSync(resolve(root, '.gitignore'), 'record.json\n')
    const stub = `import { writeFileSync } from 'node:fs';
export async function executeBounded(command, args, options) {
  if (command !== 'make') return { status: 0 };
  const mode = ${JSON.stringify(mode)};
  if (mode === 'spawn') throw new Error('private spawn failure');
  if (mode === 'malformed') writeFileSync(options.env.IDENTITY_UI_FIXTURE_RECORD, '{');
  if (mode === 'assertion' || mode === 'timeout') writeFileSync(options.env.IDENTITY_UI_FIXTURE_RECORD, JSON.stringify({
    format_version: 1, result: 'failed', cleanup: { status: 'passed', recovery_targets: [] },
    failure: { phase: 'browser', classification: 'assertion' }
  }));
  return { status: 2, timedOut: mode === 'timeout' };
}`
    writeFileSync(resolve(root, 'process.mjs'), stub)
    writeFileSync(
      resolve(root, 'e2e/identity/run.mjs'),
      readFileSync(resolve(import.meta.dirname, 'e2e/identity/run.mjs'), 'utf8').replace(
        "'../real/process.mjs'",
        "'../../process.mjs'",
      ),
    )
    for (const args of [
      ['init', '-q'],
      ['add', '.'],
      ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture'],
    ]) {
      expect(spawnSync('/usr/bin/git', args, { cwd: root }).status).toBe(0)
    }
    const result = spawnSync(process.execPath, [resolve(root, 'e2e/identity/run.mjs')], {
      cwd: root,
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, IDENTITY_BACKEND_FIXTURE: root, IDENTITY_JOINT_RECORD: path },
    })
    expect(result.status).toBe(1)
    const record = JSON.parse(readFileSync(path, 'utf8'))
    if (record.cleanup.recovery_directory) directories.push(record.cleanup.recovery_directory)
    expect(record.failure).toMatchObject({
      phase: mode === 'assertion' ? 'browser' : 'backend',
      classification:
        mode === 'assertion' ? 'assertion' : mode === 'timeout' ? 'timeout' : 'environment',
    })
    if (mode !== 'malformed')
      expect(record.failure.execution).toBe(
        mode === 'spawn' ? 'spawn' : mode === 'timeout' ? 'timeout' : 'exit',
      )
    expect(record.cleanup.status).toBe(
      ['assertion', 'timeout'].includes(mode) ? 'passed' : 'unknown',
    )
    expect(result.stdout + result.stderr).not.toContain('private spawn failure')
  },
)
