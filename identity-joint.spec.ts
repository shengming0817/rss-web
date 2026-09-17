import { afterEach, expect, it } from 'vitest'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  realpathSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { rootCertificates } from 'node:tls'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
function output() {
  const directory = mkdtempSync(resolve(tmpdir(), 'identity-joint-test-'))
  directories.push(directory)
  return resolve(realpathSync(directory), 'record.json')
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
it('classifies missing transport CA as an environment failure without emitting a raw exception', () => {
  const path = output()
  const env = {
    ...process.env,
    IDENTITY_UI_DIAGNOSTIC: path,
    IDENTITY_TEST_UI_ORIGIN: 'https://localhost:1234',
  }
  delete env['NODE_EXTRA_CA_CERTS']
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
    writeFileSync(
      resolve(root, 'e2e/identity/diagnostic.mjs'),
      readFileSync(resolve(import.meta.dirname, 'e2e/identity/diagnostic.mjs')),
    )
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
    failure: { phase: 'browser', classification: 'assertion', private: 'private failure' },
    browser: { diagnostic: { test: 'identity-transport', step: 'step-up', file: 'e2e/identity/transport.spec.ts', line: 6, password: 'private password' } }
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
    if (mode === 'assertion')
      expect(record.failure.diagnostic).toEqual({
        test: 'identity-transport',
        step: 'step-up',
        file: 'e2e/identity/transport.spec.ts',
        line: 6,
      })
    expect(JSON.stringify(record)).not.toContain('private')
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

it('forwards interruption to the owned transport child before publishing failure', () => {
  const path = output()
  const root = resolve(path, '..')
  mkdirSync(resolve(root, 'e2e/identity'), { recursive: true })
  writeFileSync(
    resolve(root, 'e2e/identity/diagnostic.mjs'),
    readFileSync(resolve(import.meta.dirname, 'e2e/identity/diagnostic.mjs')),
  )
  const stub = `export async function executeBounded(command, args, options) {
    let stopped = false;
    options.onChild({}, () => { stopped = true });
    process.emit('SIGTERM');
    if (!stopped) throw new Error('child escaped');
    options.onRelease();
    return { status: 0 };
  }`
  writeFileSync(resolve(root, 'process.mjs'), stub)
  writeFileSync(
    resolve(root, 'e2e/identity/real.mjs'),
    readFileSync(resolve(import.meta.dirname, 'e2e/identity/real.mjs'), 'utf8').replace(
      "'../real/process.mjs'",
      "'../../process.mjs'",
    ),
  )
  writeFileSync(resolve(root, 'ca.pem'), rootCertificates[0]!)
  const result = spawnSync(process.execPath, [resolve(root, 'e2e/identity/real.mjs')], {
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      IDENTITY_UI_DIAGNOSTIC: path,
      IDENTITY_TEST_UI_ORIGIN: 'https://localhost:1234',
      NODE_EXTRA_CA_CERTS: resolve(root, 'ca.pem'),
    },
  })
  expect(result.status).toBe(1)
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
    stage: 'transport',
    failure: 'interrupted',
  })
})

it.each(['invalid-ca', 'startup', 'assertion', 'network', 'timeout', 'empty', 'passed'] as const)(
  'classifies transport %s and projects only bounded diagnostic fields',
  (mode) => {
    const path = output()
    const root = resolve(path, '..')
    mkdirSync(resolve(root, 'e2e/identity'), { recursive: true })
    writeFileSync(
      resolve(root, 'e2e/identity/diagnostic.mjs'),
      readFileSync(resolve(import.meta.dirname, 'e2e/identity/diagnostic.mjs')),
    )
    const failure = mode === 'network' ? 'environment' : 'assertion'
    const report = {
      success: mode === 'passed',
      numTotalTests: mode === 'empty' ? 0 : 1,
      numPassedTests: mode === 'passed' ? 1 : 0,
      testResults: [
        {
          name: resolve(root, 'e2e/identity/transport.spec.ts'),
          message: 'private server body',
          assertionResults:
            mode === 'empty'
              ? []
              : [
                  {
                    status: mode === 'passed' ? 'passed' : 'failed',
                    title: 'private dynamic title',
                    location: { line: 6, column: 1 },
                    meta: { step: 'step-up', failure, password: 'private password' },
                    failureMessages: ['private stack and credentials'],
                  },
                ],
        },
      ],
    }
    writeFileSync(
      resolve(root, 'process.mjs'),
      `
export async function executeBounded() {
  return { status: ${mode === 'passed' || mode === 'empty' ? 0 : 1}, timedOut: ${mode === 'timeout'},
    stdout: ${JSON.stringify(mode === 'startup' ? '' : JSON.stringify(report))},
    stderr: 'private startup error and credentials' };
}`,
    )
    writeFileSync(
      resolve(root, 'e2e/identity/real.mjs'),
      readFileSync(resolve(import.meta.dirname, 'e2e/identity/real.mjs'), 'utf8').replace(
        "'../real/process.mjs'",
        "'../../process.mjs'",
      ),
    )
    writeFileSync(
      resolve(root, 'ca.pem'),
      mode === 'invalid-ca' ? 'not a certificate' : rootCertificates[0]!,
    )
    const result = spawnSync(process.execPath, [resolve(root, 'e2e/identity/real.mjs')], {
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        IDENTITY_UI_DIAGNOSTIC: path,
        IDENTITY_TEST_UI_ORIGIN: 'https://localhost:1234',
        NODE_EXTRA_CA_CERTS: resolve(root, 'ca.pem'),
      },
    })
    expect(result.status).toBe(mode === 'passed' ? 0 : 1)
    const record = JSON.parse(readFileSync(path, 'utf8'))
    expect(record.failure).toBe(
      mode === 'passed'
        ? null
        : mode === 'timeout'
          ? 'timeout'
          : mode === 'assertion'
            ? 'assertion'
            : 'environment',
    )
    if (['assertion', 'network'].includes(mode))
      expect(record.diagnostic).toEqual({
        test: 'identity-transport',
        step: 'step-up',
        file: 'e2e/identity/transport.spec.ts',
        line: 6,
      })
    expect(JSON.stringify(record) + result.stdout).not.toContain('private')
  },
)

it.each(['startup', 'assertion', 'passed'] as const)(
  'reads an actual Vitest %s result without releasing raw output',
  (mode) => {
    const path = output()
    const root = resolve(path, '..')
    mkdirSync(resolve(root, 'e2e/identity'), { recursive: true })
    mkdirSync(resolve(root, 'e2e/real'), { recursive: true })
    for (const file of ['identity/real.mjs', 'identity/diagnostic.mjs', 'real/process.mjs']) {
      writeFileSync(
        resolve(root, 'e2e', file),
        readFileSync(resolve(import.meta.dirname, 'e2e', file)),
      )
    }
    symlinkSync(resolve(import.meta.dirname, 'node_modules'), resolve(root, 'node_modules'), 'dir')
    writeFileSync(resolve(root, 'package.json'), '{"type":"module"}')
    writeFileSync(
      resolve(root, 'e2e/identity/vitest.config.mjs'),
      mode === 'startup'
        ? "throw new Error('private setup input')"
        : "export default { test: { include: ['e2e/identity/transport.spec.ts'] } }",
    )
    writeFileSync(
      resolve(root, 'e2e/identity/transport.spec.ts'),
      `
import { it, expect } from 'vitest'
it('private title', ({ task }) => {
  task.meta.step = 'login'
  try { expect(${mode === 'passed'}).toBe(true) }
  catch (error) { task.meta.failure = 'assertion'; throw error }
})`,
    )
    writeFileSync(resolve(root, 'ca.pem'), rootCertificates[0]!)
    if (mode === 'passed') {
      expect(
        spawnSync(
          '/usr/bin/openssl',
          [
            'req',
            '-x509',
            '-newkey',
            'rsa:2048',
            '-nodes',
            '-days',
            '2',
            '-subj',
            '/CN=identity-ui-t2',
            '-addext',
            'basicConstraints=CA:FALSE',
            '-keyout',
            resolve(root, 'key.pem'),
            '-out',
            resolve(root, 'ca.pem'),
          ],
          { stdio: 'ignore', timeout: 10000 },
        ).status,
      ).toBe(0)
    }
    const result = spawnSync(process.execPath, [resolve(root, 'e2e/identity/real.mjs')], {
      encoding: 'utf8',
      timeout: 15000,
      env: {
        ...process.env,
        IDENTITY_UI_DIAGNOSTIC: path,
        IDENTITY_TEST_UI_ORIGIN: 'https://localhost:1234',
        NODE_EXTRA_CA_CERTS: resolve(root, 'ca.pem'),
      },
    })
    expect(result.status).toBe(mode === 'passed' ? 0 : 1)
    const record = JSON.parse(readFileSync(path, 'utf8'))
    expect(record.failure).toBe(
      mode === 'passed' ? null : mode === 'startup' ? 'environment' : 'assertion',
    )
    if (mode === 'assertion')
      expect(record.diagnostic).toEqual({
        test: 'identity-transport',
        step: 'login',
        file: 'e2e/identity/transport.spec.ts',
        line: 3,
      })
    expect(JSON.stringify(record) + result.stdout + result.stderr).not.toContain('private')
  },
)
