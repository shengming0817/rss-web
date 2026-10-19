// Process lifecycle regression for the device and software browser fixture owners.
import { test } from 'node:test'
import process from 'node:process'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

async function waitFor(predicate) {
  const end = Date.now() + 18000
  while (!predicate()) {
    if (Date.now() > end) throw new Error('lifecycle deadline')
    await new Promise((done) => setTimeout(done, 20))
  }
}
async function exercise(failure, feature) {
  const backendEnv = `MDM_${feature.toUpperCase()}_BACKEND`,
    group = `${feature}-browser`
  const backend = mkdtempSync(resolve(tmpdir(), `mdm-${feature}-lifecycle-`))
  const bin = resolve(backend, 'bin'),
    recovery = resolve(backend, `artifacts/dev-environment/${group}`)
  mkdirSync(bin)
  mkdirSync(recovery, { recursive: true })
  writeFileSync(resolve(bin, 'pnpm'), '#!/bin/sh\nexit 0\n', { mode: 0o700 })
  writeFileSync(
    resolve(bin, 'python3'),
    `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path')
const args = process.argv.slice(2), base = process.env['${backendEnv}']
if (args.includes('reset') || ('${feature}' === 'settings' && args.includes('-c'))) {
  const target = args.includes('-c')
  if (target ? !args.at(-1).includes("group='settings-browser-target'") : !args.includes('hack/t2_environment.py') || args.at(-1) !== '${group}') process.exit(9)
  fs.appendFileSync(path.join(base,'cleanup-groups'), (target ? '${group}-target' : '${group}')+'\\n')
  fs.writeFileSync(path.join(base, 'cleanup-start'), '')
  setTimeout(() => {
    if (process.env.CLEANUP_FAILURE === '1') process.exit(3)
    if (target) fs.writeFileSync(path.join(base,'target-cleanup-finished'),'')
    else fs.rmSync(path.join(base, 'artifacts/dev-environment/${group}'), { recursive: true })
    fs.writeFileSync(path.join(base, 'cleanup-finished'), '')
    process.exit(0)
  }, process.env.CLEANUP_FAILURE === '1' ? 0 : 7000)
} else {
  fs.writeFileSync(path.join(base, 'execution-start'), '')
  if (process.env.CLEANUP_FAILURE === '1') process.exit(2)
  // A foreign execution runner may force-terminate rather than complete cleanup.
  process.on('SIGTERM', () => {})
  setInterval(() => {}, 1000)
}
`,
    { mode: 0o700 },
  )
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL(`./${feature}-run.mjs`, import.meta.url))],
    {
      env: {
        ...process.env,
        [backendEnv]: backend,
        PATH: `${bin}:${process.env.PATH}`,
        CLEANUP_FAILURE: failure ? '1' : '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let output = ''
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))
  const closed = new Promise((done, reject) => {
    child.once('error', reject)
    child.once('close', (code) => done(code))
  })
  try {
    if (!failure) {
      await waitFor(() => existsSync(resolve(backend, 'execution-start')))
      child.kill('SIGTERM')
      await waitFor(() => existsSync(resolve(backend, 'cleanup-start')))
      // A second cancellation must not cancel the independent cleanup owner.
      child.kill('SIGTERM')
    }
    const code = await closed
    assert.equal(code, 1)
    if (feature === 'settings')
      assert.deepEqual(
        readFileSync(resolve(backend, 'cleanup-groups'), 'utf8').trim().split('\n'),
        [group + '-target', group],
      )
    if (failure) {
      assert.ok(existsSync(recovery))
      assert.ok(output.includes(JSON.stringify(recovery)))
      assert.ok(output.includes('"phase":"cleanup","result":"failed"'))
    } else {
      assert.ok(existsSync(resolve(backend, 'cleanup-finished')))
      if (feature === 'settings') assert.ok(existsSync(resolve(backend, 'target-cleanup-finished')))
      assert.equal(existsSync(recovery), false)
      assert.ok(output.includes('"classification":"interrupted"'))
      assert.ok(output.includes('"phase":"cleanup","result":"passed"'))
    }
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL')
    await closed
    rmSync(backend, { recursive: true, force: true })
  }
}
for (const feature of ['device', 'software', 'settings']) {
  test(
    `${feature}: waits for independent cleanup after cancellation and a second signal`,
    { timeout: 30000 },
    () => exercise(false, feature),
  )
  test(
    `${feature}: reports unconfirmed cleanup and the recovery directory`,
    { timeout: 30000 },
    () => exercise(true, feature),
  )
}
