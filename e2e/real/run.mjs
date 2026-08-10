import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import {
  boundedTimeout,
  classifyPlaywrightReport,
  finalizeOutcome,
  isCleanWebStatus,
} from './lifecycle.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const source = resolve(process.env.RSS_SOURCE_DIR ?? resolve(root, '..'))
const revision = process.env.RSS_SOURCE_REVISION ?? 'b7f3e1d0bcc5b2e59639a81b4f37937914b53f00'
const tenant = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const project = `rss-web-real-${process.pid}`
const passwordHash =
  '$argon2id$v=19$m=19456,t=2,p=1$6u0CA7kUIx6+uo3WmsJwOw$sv8QjbtpgvY9mVYK8slFi8poxsQtIXnMK3BBjlvjRaU'
const temp = mkdtempSync(resolve(tmpdir(), 'rss-web-real-'))
const snapshot = resolve(temp, 'rss')
const webSnapshot = resolve(temp, 'web')
const deadlineMs = Date.now() + 30 * 60_000
const receiptPath =
  process.env.RSS_WEB_REAL_RECEIPT ?? resolve(tmpdir(), `rss-web-real-receipt-${process.pid}.json`)
let composeFiles = []
let environment
let webRevision = ''
let cleanupAttempted = false
let signalHandling = false
const phases = []

function run(command, args, options = {}) {
  const timeout = boundedTimeout(deadlineMs, options.timeoutMs ?? 15 * 60_000)
  if (timeout === 0) {
    const error = new Error('real journey total deadline exhausted')
    error.stage = 'environment:total-timeout'
    throw error
  }
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    encoding: 'utf8',
    input: options.input,
    stdio: options.stdio ?? ['pipe', 'inherit', 'inherit'],
    timeout,
    killSignal: 'SIGTERM',
  })
  if (result.error) {
    const error = new Error(`${options.stage ?? command} failed: ${result.error.message}`)
    const stage = options.stage ?? command
    error.stage =
      result.error.code === 'ETIMEDOUT'
        ? `${stage.startsWith('environment:') ? stage : `environment:${stage}`}-timeout`
        : stage
    throw error
  }
  if (result.status !== 0) {
    const error = new Error(`${options.stage ?? command} failed`)
    error.stage = options.stage ?? 'environment'
    throw error
  }
  return result.stdout ?? ''
}

function compose(args, options = {}) {
  return run('docker', ['compose', '-p', project, ...composeFiles, ...args], {
    ...options,
    env: environment,
  })
}

async function freePort() {
  const server = createServer()
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  assert(address && typeof address === 'object')
  const port = address.port
  await new Promise((resolveClose) => server.close(resolveClose))
  return port
}

function seedSql() {
  const fullPermissions = [
    'identity:profile:read',
    'identity:profile:field:subject',
    'identity:profile:field:tenant_id',
    'identity:session:logout-current',
    'runtime:inventory:read',
    'audit:read',
    'audit:field:actor',
    'audit:field:tenant_id',
    'audit:field:resource_id',
  ]
  const limitedPermissions = fullPermissions.slice(0, 3)
  const array = (items) => `ARRAY[${items.map((item) => `'${item}'`).join(',')}]::text[]`
  return `BEGIN;
INSERT INTO credentials (tenant_id,user_id,login,password_hash,version) VALUES
('${tenant}'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,'rss-web-real-user','${passwordHash}',1),
('${tenant}'::uuid,'22222222-2222-4222-8222-222222222222'::uuid,'rss-web-limited-user','${passwordHash}',1);
INSERT INTO account_security_states (tenant_id,user_id,status,authn_epoch,version,status_changed_at,updated_at) VALUES
('${tenant}'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,'active',0,1,now(),now()),
('${tenant}'::uuid,'22222222-2222-4222-8222-222222222222'::uuid,'active',0,1,now(),now());
INSERT INTO roles (tenant_id,id,name,permissions) VALUES
('${tenant}'::uuid,'rss-web-real','RSS Web real journey',${array(fullPermissions)}),
('${tenant}'::uuid,'rss-web-limited','RSS Web limited journey',${array(limitedPermissions)});
INSERT INTO role_bindings (tenant_id,role_id,subject) VALUES
('${tenant}'::uuid,'rss-web-real','11111111-1111-4111-8111-111111111111'),
('${tenant}'::uuid,'rss-web-limited','22222222-2222-4222-8222-222222222222');
INSERT INTO abac_policies
  (tenant_id,id,version,contract_id,permission,effective_from,rules)
VALUES (
  '${tenant}'::uuid,
  'rss-web-real-audit-read',
  1,
  'audit.list-entries',
  'audit:read',
  to_timestamp(0),
  '{"rules":[{"condition":{"attribute":"principal.id","operator":{"family":"equality","predicate":"eq","operand":{"kind":"literal","valueType":"string","value":"11111111-1111-4111-8111-111111111111"}}},"effect":"allow"}]}'::jsonb
);
COMMIT;`
}

function writeReceipt(outcome) {
  mkdirSync(dirname(receiptPath), { recursive: true })
  writeFileSync(
    receiptPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        status: outcome.status,
        rssRevision: revision,
        webRevision,
        tenantBootstrap: 'edge-deployment-fixed',
        backend: 'real-rss-archive',
        phases,
        cleanup: outcome.cleanup,
        ...(outcome.failure === undefined ? {} : { failure: outcome.failure }),
      },
      null,
      2,
    )}\n`,
  )
}

async function waitReady() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const result = spawnSync(
      'docker',
      [
        'compose',
        '-p',
        project,
        ...composeFiles,
        'exec',
        '-T',
        'edge',
        'wget',
        '-T',
        '2',
        '-qO-',
        'http://server:8083/health/v1/readyz',
      ],
      { env: environment, encoding: 'utf8', timeout: 5_000, killSignal: 'SIGTERM' },
    )
    if (result.status === 0) return
    await new Promise((resolveWait) => setTimeout(resolveWait, 2_000))
  }
  const error = new Error('RSS readiness timed out')
  error.stage = 'environment'
  throw error
}

async function waitPhaseReady({ requireServer = false } = {}) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const services = compose(['ps', '--status', 'running', '--services'], {
      stdio: 'pipe',
      timeoutMs: 10_000,
      stage: 'environment:phase-readiness',
    })
      .trim()
      .split('\n')
    const servicesReady =
      services.includes('edge') && (!requireServer || services.includes('server'))
    if (servicesReady) {
      try {
        const response = await fetch(`http://127.0.0.1:${environment.RSS_WEB_REAL_EDGE_PORT}/`, {
          signal: AbortSignal.timeout(2_000),
        })
        if (response.status === 200) return
      } catch {
        // The bounded environment readiness loop owns transient startup failures.
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500))
  }
  const error = new Error('Web Edge phase readiness timed out')
  error.stage = 'environment:phase-readiness'
  throw error
}

function playwright(phase) {
  const timeout = boundedTimeout(deadlineMs, 3 * 60_000)
  if (timeout === 0) {
    const error = new Error('real journey total deadline exhausted')
    error.stage = 'environment:total-timeout'
    throw error
  }
  const result = spawnSync(
    'pnpm',
    ['exec', 'playwright', 'test', '-c', 'playwright.real.config.ts', '--reporter=json'],
    {
      cwd: root,
      encoding: 'utf8',
      timeout,
      killSignal: 'SIGTERM',
      stdio: 'pipe',
      env: {
        ...environment,
        RSS_WEB_REAL_BASE_URL: `http://127.0.0.1:${environment.RSS_WEB_REAL_EDGE_PORT}`,
        RSS_WEB_REAL_PHASE: phase,
      },
    },
  )
  if (result.error) {
    const error = new Error(`Playwright ${phase} failed: ${result.error.message}`)
    error.stage =
      result.error.code === 'ETIMEDOUT'
        ? 'environment:playwright-timeout'
        : 'environment:playwright-runner'
    throw error
  }
  let classification = 'environment'
  try {
    classification = classifyPlaywrightReport(JSON.parse(result.stdout))
  } catch {
    classification = 'environment'
  }
  if (result.status !== 0 || classification !== 'passed') {
    if (result.stderr) process.stderr.write(result.stderr)
    const error = new Error(`Playwright ${phase} failed`)
    error.stage = `${classification === 'product' ? 'product' : 'environment'}:${phase}`
    throw error
  }
  phases.push({ name: phase, status: 'passed' })
}

function preflightPlaywright() {
  const preflightEnvironment = {
    env: {
      ...environment,
      RSS_WEB_REAL_BASE_URL: `http://127.0.0.1:${environment.RSS_WEB_REAL_EDGE_PORT}`,
      RSS_WEB_REAL_PHASE: 'main',
    },
  }
  run(
    'node',
    [
      '--input-type=module',
      '-e',
      "import { accessSync } from 'node:fs'; import { chromium } from '@playwright/test'; accessSync(chromium.executablePath())",
    ],
    {
      ...preflightEnvironment,
      stdio: 'pipe',
      timeoutMs: 30_000,
      stage: 'environment:playwright-browser',
    },
  )
  run('pnpm', ['exec', 'playwright', 'test', '-c', 'playwright.real.config.ts', '--list'], {
    ...preflightEnvironment,
    stdio: 'pipe',
    timeoutMs: 30_000,
    stage: 'environment:playwright-config',
  })
}

function printPlan() {
  process.stdout.write(
    `${JSON.stringify({
      sourceMode: 'git-archive',
      webSourceMode: 'git-archive-clean-head',
      pinnedRevision: revision,
      tenantBootstrap: 'edge-deployment-fixed',
      browserNetwork: 'edge-only',
      phases: ['main', 'budget-exhausted', 'admin-down', 'primary-down'],
      malformedResponseEvidence: 'isolated-playwright-smoke',
      cleanup: 'compose-down-volumes-and-temporary-snapshot',
    })}\n`,
  )
}

if (process.argv.includes('--print-plan')) {
  printPlan()
  rmSync(temp, { recursive: true, force: true })
  process.exit(0)
}

function teardown() {
  if (cleanupAttempted || composeFiles.length === 0 || environment === undefined)
    return { status: 'passed', project }
  cleanupAttempted = true
  const result = spawnSync(
    'docker',
    ['compose', '-p', project, ...composeFiles, 'down', '--volumes', '--remove-orphans'],
    {
      env: environment,
      stdio: 'inherit',
      timeout: 120_000,
      killSignal: 'SIGTERM',
    },
  )
  if (result.error || result.status !== 0) {
    return { status: 'failed', project, recoveryPath: temp }
  }
  return { status: 'passed', project }
}

function handleSignal(signal) {
  if (signalHandling) return
  signalHandling = true
  const cleanup = teardown()
  const outcome = finalizeOutcome(
    {
      status: 'failed',
      failure: { stage: `environment:signal-${signal}`, classification: 'environment' },
    },
    cleanup,
  )
  writeReceipt(outcome)
  if (cleanup.status === 'passed') rmSync(temp, { recursive: true, force: true })
  else process.stderr.write(`[real-e2e] cleanup recovery: ${cleanup.recoveryPath}\n`)
  process.exit(signal === 'SIGINT' ? 130 : 143)
}

const signalHandlers = {
  SIGINT: () => handleSignal('SIGINT'),
  SIGTERM: () => handleSignal('SIGTERM'),
}
process.once('SIGINT', signalHandlers.SIGINT)
process.once('SIGTERM', signalHandlers.SIGTERM)

let outcome = { status: 'passed' }
try {
  run('docker', ['version'], { stdio: 'pipe', stage: 'environment:docker' })
  webRevision = run('/usr/bin/git', ['rev-parse', 'HEAD'], {
    cwd: root,
    stdio: 'pipe',
    stage: 'environment:web-revision',
  }).trim()
  const webStatus = run('/usr/bin/git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root,
    stdio: 'pipe',
    stage: 'environment:web-cleanliness',
  })
  if (!isCleanWebStatus(webStatus)) {
    const error = new Error('Web source must be clean before the real journey')
    error.stage = 'environment:web-dirty'
    throw error
  }
  const resolvedRevision = run('/usr/bin/git', ['rev-parse', `${revision}^{commit}`], {
    cwd: source,
    stdio: 'pipe',
    stage: 'environment:rss-revision',
  }).trim()
  assert.equal(resolvedRevision, revision)

  mkdirSync(snapshot)
  const archivePath = resolve(temp, 'rss.tar')
  run('/usr/bin/git', ['archive', '--output', archivePath, revision], {
    cwd: source,
    stage: 'environment:rss-archive',
  })
  run('tar', ['-x', '-f', archivePath, '-C', snapshot], {
    stage: 'environment:rss-archive-extract',
  })
  mkdirSync(webSnapshot)
  const webArchivePath = resolve(temp, 'web.tar')
  run('/usr/bin/git', ['archive', '--output', webArchivePath, webRevision], {
    cwd: root,
    stage: 'environment:web-archive',
  })
  run('tar', ['-x', '-f', webArchivePath, '-C', webSnapshot], {
    stage: 'environment:web-archive-extract',
  })
  run('bash', ['deploy/demo-tls/generate-demo-cas.sh'], {
    cwd: snapshot,
    stage: 'environment:demo-tls',
  })

  const edgePort = await freePort()
  environment = {
    ...process.env,
    RSS_WEB_ROOT: webSnapshot,
    RSS_WEB_REAL_TENANT_ID: tenant,
    RSS_WEB_REAL_EDGE_PORT: String(edgePort),
    GIT_SHA: revision,
    BUILD_DATE: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  }
  composeFiles = [
    '-f',
    resolve(snapshot, 'deploy/docker-compose.yml'),
    '-f',
    resolve(webSnapshot, 'e2e/real/compose.override.yml'),
  ]

  preflightPlaywright()
  compose(['up', '--build', '-d'], { stage: 'environment:compose-up' })
  await waitReady()
  await waitPhaseReady({ requireServer: true })
  compose(
    ['exec', '-T', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'rss'],
    {
      input: seedSql(),
      stage: 'environment:seed',
    },
  )

  playwright('main')

  environment.RSS_WEB_REAL_REQUEST_BUDGET_MS = '1'
  compose(['up', '-d', '--no-deps', '--force-recreate', 'server'], {
    stage: 'environment:budget-fault-server',
  })
  compose(['up', '-d', '--no-deps', '--force-recreate', 'edge'], {
    stage: 'environment:budget-fault-edge',
  })
  await waitPhaseReady({ requireServer: true })
  playwright('budget-exhausted')

  environment.RSS_WEB_REAL_REQUEST_BUDGET_MS = '30000'
  compose(['up', '-d', '--no-deps', '--force-recreate', 'server'], {
    stage: 'environment:restore-server-budget',
  })
  compose(['up', '-d', '--no-deps', '--force-recreate', 'edge'], {
    stage: 'environment:restore-budget-edge',
  })
  await waitReady()
  await waitPhaseReady({ requireServer: true })

  environment.RSS_WEB_REAL_ADMIN_PORT = '9'
  compose(['up', '-d', '--no-deps', '--force-recreate', 'edge'], {
    stage: 'environment:admin-fault-edge',
  })
  await waitPhaseReady({ requireServer: true })
  playwright('admin-down')

  environment.RSS_WEB_REAL_ADMIN_PORT = '8082'
  environment.RSS_WEB_REAL_PRIMARY_PORT = '9'
  compose(['up', '-d', '--no-deps', '--force-recreate', 'edge'], {
    stage: 'environment:primary-fault-edge',
  })
  await waitPhaseReady({ requireServer: true })
  playwright('primary-down')
} catch (error) {
  const stage = typeof error?.stage === 'string' ? error.stage : 'environment:unknown'
  const classification = stage.startsWith('product:') ? 'product' : 'environment'
  phases.push({ name: stage, status: 'failed', classification })
  outcome = { status: 'failed', failure: { stage, classification } }
  process.stderr.write(`[real-e2e] ${stage} (${classification})\n`)
} finally {
  process.removeListener('SIGINT', signalHandlers.SIGINT)
  process.removeListener('SIGTERM', signalHandlers.SIGTERM)
  const cleanup = teardown()
  outcome = finalizeOutcome(outcome, cleanup)
  writeReceipt(outcome)
  process.stderr.write(`[real-e2e] receipt: ${receiptPath}\n`)
  if (cleanup.status === 'passed') rmSync(temp, { recursive: true, force: true })
  else process.stderr.write(`[real-e2e] cleanup recovery: ${cleanup.recoveryPath}\n`)
  if (outcome.status !== 'passed') process.exitCode = 1
}
