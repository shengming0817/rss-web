import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { executeBounded } from '../identity/process.mjs'

// The enrollment browser owns cancellation; this promise resolves only after process release.
export async function runPkiCollector(fixtureFile, lifecycle = {}) {
  if (lifecycle.interrupted?.()) throw new Error('PKI collector cancelled')
  const root = dirname(fileURLToPath(import.meta.url))
  const result = await executeBounded(
    'python3',
    [join(root, 'device-agent.py'), 'pki-ack', fixtureFile],
    {
      cwd: join(root, '../..'),
      env: process.env,
      timeoutMs: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
      onChild: lifecycle.onChild,
      onRelease: lifecycle.onRelease,
    },
  ).catch(() => {
    if (lifecycle.interrupted?.()) throw new Error('PKI collector cancelled')
    throw new PkiCollectorError({ spawnFailed: true })
  })
  if (lifecycle.interrupted?.()) throw new Error('PKI collector cancelled')
  if (result.timedOut || result.signal || result.status !== 0) throw new PkiCollectorError(result)
  return result
}

// Only closed classifications cross the browser report boundary; raw process output stays private.
export class PkiCollectorError extends Error {
  constructor(result) {
    super('PKI collector failed')
    this.name = 'PkiCollectorError'
    this.collector = pkiCollectorFailure(result)
  }
}
export function pkiCollectorFailure(result) {
  const diagnostic = {
    phase: 'pki-ack',
    classification: result.spawnFailed
      ? 'spawn'
      : result.timedOut
        ? 'timeout'
        : result.signal
          ? 'signal'
          : 'exit',
    exitCode: Number.isInteger(result.status) ? result.status : null,
    signal: ['SIGTERM', 'SIGKILL', 'SIGINT'].includes(result.signal) ? result.signal : null,
  }
  if (result.timedOut || result.signal) return diagnostic
  try {
    const line = result.stdout.trim().split('\n').at(-1)
    if (!line || line.length > 1024) return diagnostic
    const value = JSON.parse(line)
    if (value.result !== 'failed') return diagnostic
    if (
      [
        'collector-private-fixture',
        'collector-origin',
        'collector-pki-binding',
        'collector-pki-readback',
        'collector-pki-observation',
        'TimeoutError',
        'SSLError',
        'OSError',
        'JSONDecodeError',
        'FileNotFoundError',
      ].includes(value.classification)
    )
      diagnostic.classification = value.classification
    const http = /^collector-http-(trust|acknowledgements|observations)-([1-5][0-9]{2})-(.*)$/.exec(
      value.classification,
    )
    if (http) {
      diagnostic.classification = 'http'
      diagnostic.httpStage = http[1]
      diagnostic.httpStatus = Number(http[2])
      if (
        [
          'invalid_identity',
          'credential_revoked',
          'credential_retired',
          'certificate_expired',
          'malformed_request',
          'service_unavailable',
          'operation_conflict',
          'registration_limit',
          'issuance_unknown',
          'activation_unknown',
          'grant_revoked',
          'grant_expired',
          'permission_denied',
        ].includes(http[3])
      )
        diagnostic.httpCode = http[3]
    }
  } catch {
    /* Unrecognized output is never returned to the report. */
  }
  return diagnostic
}
