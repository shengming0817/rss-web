import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
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
