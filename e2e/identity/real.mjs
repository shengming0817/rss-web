// Fixed consumer entry: production XMLHttpRequest transport in jsdom against the real TLS host.
import { writeFileSync, readFileSync } from 'node:fs'
import { X509Certificate } from 'node:crypto'
import { transportDiagnostic } from './diagnostic.mjs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { executeBounded } from '../real/process.mjs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
let failure = 'environment'
let diagnostic
let terminate
let interrupted = false
function interrupt() {
  interrupted = true
  terminate?.()
}
process.on('SIGINT', interrupt)
process.on('SIGTERM', interrupt)
try {
  const origin = new URL(process.env.IDENTITY_TEST_UI_ORIGIN)
  if (
    origin.protocol !== 'https:' ||
    origin.hostname !== 'localhost' ||
    origin.origin !== process.env.IDENTITY_TEST_UI_ORIGIN
  )
    throw new Error('fixture input')
  const pem = readFileSync(process.env.NODE_EXTRA_CA_CERTS, 'utf8')
  const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)
  if (
    !certificates?.length ||
    certificates.reduce((rest, cert) => rest.replace(cert, ''), pem).trim()
  )
    throw new Error('fixture CA')
  for (const pemCertificate of certificates) {
    const certificate = new X509Certificate(pemCertificate)
    if (
      !certificate.ca ||
      Date.parse(certificate.validFrom) > Date.now() ||
      Date.parse(certificate.validTo) < Date.now()
    )
      throw new Error('fixture CA')
  }
  const result = await executeBounded(
    'pnpm',
    [
      'exec',
      'vitest',
      'run',
      '--config',
      'e2e/identity/vitest.config.mjs',
      '--reporter=json',
      '--includeTaskLocation',
      '--testTimeout=0',
    ],
    {
      cwd: root,
      onChild: (_child, stop) => {
        terminate = stop
        if (interrupted) stop()
      },
      onRelease: () => {
        terminate = undefined
      },
      env: process.env,
      timeoutMs: 180000,
      graceMs: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  if (interrupted) failure = 'interrupted'
  else if (result.timedOut) failure = 'timeout'
  else {
    // Consume Vitest's structured result in memory; never persist or print its error payloads.
    const report = JSON.parse(result.stdout)
    const files = report.testResults
    if (
      !Array.isArray(files) ||
      files.length !== 1 ||
      files[0].name !== resolve(root, 'e2e/identity/transport.spec.ts')
    )
      throw new Error('test result')
    const tests = files[0].assertionResults
    if (!Array.isArray(tests) || tests.length !== 1) throw new Error('test result')
    const test = tests[0]
    if (result.status === 0 && report.success === true && test.status === 'passed') failure = null
    else if (test.status === 'failed') {
      diagnostic = transportDiagnostic({
        test: 'identity-transport',
        file: 'e2e/identity/transport.spec.ts',
        step: test.meta?.step,
        line: test.location?.line,
      })
      if (diagnostic && ['environment', 'assertion', 'timeout'].includes(test.meta?.failure))
        failure = test.meta.failure
    }
  }
} catch {
  /* Only a closed failure category leaves the runner. */
}
const record = {
  stage: failure === 'environment' ? 'environment' : 'transport',
  failure,
  ...(diagnostic ? { diagnostic } : {}),
}
for (const path of [process.env.IDENTITY_UI_DIAGNOSTIC, process.env.IDENTITY_UI_BROWSER_RECORD]) {
  if (path) writeFileSync(path, JSON.stringify(record), { mode: 0o600 })
}
if (failure) process.exitCode = 1
