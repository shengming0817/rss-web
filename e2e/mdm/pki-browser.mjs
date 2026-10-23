// Added to the existing enrollment suite; its host, browser and CA cleanup remain the sole owners.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { executeBounded } from '../identity/process.mjs'
export async function exercisePki({
  page,
  context,
  fixture,
  coverage,
  temp,
  go,
  collectorLifecycle,
}) {
  const origin = fixture.origin,
    at = (p) => `${origin}/tenants/${fixture.tenant}/${p}`
  const get = async (path) => {
    const response = await context.request.get(origin + path)
    assert.equal(response.status(), 200)
    return response.json()
  }
  const reply = (path, method = 'POST') =>
    page.waitForResponse(
      (r) => r.request().method() === method && new URL(r.url()).pathname === path,
    )
  const trusted = await get('/api/v1/pki/agent/trust'),
    candidate = {
      ...trusted,
      revision: trusted.revision + 1,
      issuers: [...trusted.issuers, { ...fixture.pki.candidateTrust.issuers[0], mode: 'prepared' }],
    }
  assert.equal(fixture.pki.candidateTrust.service_id, trusted.service_id)
  const candidateFile = join(temp, 'public-trust.json')
  writeFileSync(candidateFile, JSON.stringify(candidate), { mode: 0o600 })
  await go(page, at('security/device-trust'))
  await page.getByRole('button', { name: '准备轮换', exact: true }).click()
  await page.locator('#pki-trust-file').setInputFiles(candidateFile)
  await page.getByRole('button', { name: '核对并继续', exact: true }).click()
  const preparedReply = reply('/api/v1/pki/rotations')
  await page.getByRole('button', { name: '核对后准备分发', exact: true }).click()
  const preparedResponse = await preparedReply
  assert.equal(preparedResponse.status(), 200)
  const prepared = await preparedResponse.json()
  assert.equal(prepared.state, 'distributing')
  const rotation = page.getByRole('dialog', { name: '轮换过程', exact: true })
  await rotation.getByRole('button', { name: '检查并激活', exact: true }).click()
  let transitionReply = reply('/api/v1/pki/agent/rotations')
  await rotation.getByRole('button', { name: '确认提交此阶段', exact: true }).click()
  assert.equal((await transitionReply).status(), 409)
  await rotation.getByRole('alert').filter({ hasText: '前提未满足或版本已变化' }).waitFor()
  assert.equal((await get('/api/v1/pki/agent/trust')).revision, prepared.revision)
  coverage.push('pki-real-ca-public-material-prepare-and-missing-ack-409')
  const ack = await runPkiCollector(process.env.MDM_ENROLLMENT_BROWSER_FIXTURE, collectorLifecycle)
  assert.equal(ack.status, 0)
  await rotation.getByRole('button', { name: '读取最新状态以比较', exact: true }).click()
  await rotation.getByRole('button', { name: '已比较，重新编辑', exact: true }).click()
  transitionReply = reply('/api/v1/pki/agent/rotations')
  await rotation.getByRole('button', { name: '确认提交此阶段', exact: true }).click()
  const activatedResponse = await transitionReply
  assert.equal(activatedResponse.status(), 200)
  const activated = await activatedResponse.json()
  assert.equal(activated.operation, prepared.operation)
  assert.equal(activated.state, 'activated')
  assert.equal(activated.revision, prepared.revision + 1)
  await rotation.getByRole('button', { name: '检查并退休', exact: true }).click()
  transitionReply = reply('/api/v1/pki/agent/rotations')
  await rotation.getByRole('button', { name: '确认提交此阶段', exact: true }).click()
  assert.equal((await transitionReply).status(), 409)
  await rotation.getByRole('alert').filter({ hasText: '前提未满足或版本已变化' }).waitFor()
  const current = await get('/api/v1/pki/agent/trust')
  assert.equal(current.revision, activated.revision)
  assert.equal(
    current.issuers.find((i) => i.digest === trusted.issuers[0].digest).mode,
    'verify_only',
  )
  await page.keyboard.press('Escape')
  const observation = page
    .locator('section.console-panel')
    .filter({ has: page.getByRole('button', { name: '读取当前注册代次的安装观察', exact: true }) })
  await observation.locator('input').fill(fixture.collector.runtime.deviceId)
  const observedReply = reply(
    `/api/v1/pki/agent/trust/devices/${fixture.collector.runtime.deviceId}/observation`,
    'GET',
  )
  await observation.getByRole('button', { name: '读取当前注册代次的安装观察', exact: true }).click()
  const observed = await (await observedReply).json()
  assert.equal(observed.observation.actual_revision, prepared.revision)
  assert.equal(observed.observation.state, 'applied')
  coverage.push(
    'pki-real-mtls-installed-trust-ack-activation-and-unrevoked-old-issuer-retirement-block',
  )
  const publicationFile = join(temp, 'public-crls.json')
  writeFileSync(
    publicationFile,
    JSON.stringify(
      current.issuers.map((i) => ({ issuer: i.digest, crl: i.crl, root_crl: i.root_crl })),
    ),
    { mode: 0o600 },
  )
  await page.getByRole('button', { name: '发布 CRL', exact: true }).click()
  const crl = page.getByRole('dialog', { name: '发布 CRL', exact: true })
  await page.locator('#pki-crl-file').setInputFiles(publicationFile)
  await crl.getByRole('button', { name: '核对并继续', exact: true }).click()
  const published = reply('/api/v1/pki/crls')
  await crl.getByRole('button', { name: '发布 CRL', exact: true }).click()
  assert.equal((await published).status(), 204)
  coverage.push('pki-real-signed-crl-publication-204-without-device-delivery-claim')
  await page.keyboard.press('Escape')
  await go(page, at('security/recovery'))
  const input = JSON.parse(readFileSync(fixture.pki.recoveryInputFile, 'utf8'))
  await page.locator('#agent-registration').fill(fixture.collector.runtime.registrationId)
  await page.locator('#agent-recovery-operation').fill(input.operationId)
  await page.locator('#agent-recovery-platform').selectOption(input.platform)
  await page.locator('#agent-recovery-secret').fill(input.secret)
  await page.locator('#agent-recovery-csr').fill(input.csr)
  await page.getByRole('button', { name: '核对并继续', exact: true }).click()
  const granted = reply(
    `/api/v1/agent-registrations/${fixture.collector.runtime.registrationId}/recovery`,
  )
  await page.getByRole('button', { name: '核验并继续原恢复', exact: true }).click()
  assert.equal((await granted).status(), 200)
  assert.equal(await page.locator('#agent-recovery-secret').inputValue(), '')
  await page.getByRole('tab', { name: 'Agent 原签发恢复', exact: true }).click()
  const original = fixture.pki.recoveryCandidate
  async function restore(operation, chain = original.certificateChain) {
    await page.locator('#agent-issuance').fill(original.issuanceId)
    await page.locator('#agent-recovery-operation').fill(operation)
    await page.locator('#agent-recovery-chain').fill(JSON.stringify(chain))
    await page.getByRole('button', { name: '核对并继续', exact: true }).click()
  }
  await restore(randomUUID())
  let recoveredReply = reply(`/api/v1/agent-issuances/${original.issuanceId}/recover`)
  await page.getByRole('button', { name: '核验并继续原恢复', exact: true }).click()
  const recoveredResponse = await recoveredReply
  assert.equal(recoveredResponse.status(), 200)
  const recovered = await recoveredResponse.json()
  assert.equal(recovered.operationId, original.operationId)
  assert.equal(recovered.issuanceId, original.issuanceId)
  coverage.push('agent-real-original-issued-candidate-recovery')
  await restore(randomUUID(), [fixture.pki.candidateTrust.issuers[0].certificate])
  recoveredReply = reply(`/api/v1/agent-issuances/${original.issuanceId}/recover`)
  await page.getByRole('button', { name: '核验并继续原恢复', exact: true }).click()
  assert.equal((await recoveredReply).status(), 403)
  await page.getByRole('alert').filter({ hasText: '请求被拒绝' }).waitFor()
  const unknownOperation = randomUUID()
  await restore(unknownOperation)
  let posts = 0
  const recoverPath = `**/api/v1/agent-issuances/${original.issuanceId}/recover`
  await page.route(recoverPath, async (route) => {
    posts++
    assert.equal(route.request().postDataJSON().operationId, unknownOperation)
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    await route.abort('failed')
  })
  await page.getByRole('button', { name: '核验并继续原恢复', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '提交结果未知' }).waitFor()
  assert.equal(
    await page.getByRole('button', { name: '核对并继续', exact: true }).isDisabled(),
    true,
  )
  assert.equal(posts, 1)
  await page.unroute(recoverPath)
  const queried = reply(
    `/api/v1/agent-issuances/${original.issuanceId}/recovery-operations/${unknownOperation}`,
    'GET',
  )
  await page.getByRole('button', { name: '查询原操作', exact: true }).first().click()
  const queriedResponse = await queried
  assert.equal(queriedResponse.status(), 200)
  const receipt = await queriedResponse.json()
  assert.equal(receipt.issuanceId, original.issuanceId)
  assert.equal(receipt.operationId, original.operationId)
  assert.equal(posts, 1)
  coverage.push('agent-original-administrative-recovery-readback-after-committed-response-loss')
  coverage.push(
    'agent-real-registration-recovery-secret-clear-wrong-chain-403-response-loss-unknown-no-replay',
  )
  await page.getByRole('tab', { name: 'Windows 原 CA 响应关联', exact: true }).click()
  await page.locator('#pki-attempt').fill(randomUUID())
  await page.locator('#pki-chain').fill(JSON.stringify(original.certificateChain))
  await page.getByRole('button', { name: '核对并继续', exact: true }).click()
  const missing = reply('/api/v1/pki/signing/recover')
  await page.getByRole('button', { name: '核验并关联原结果', exact: true }).click()
  assert.equal((await missing).status(), 503)
  assert.equal(await page.locator('dl').count(), 0)
  coverage.push('windows-original-attempt-unavailable-does-not-imply-signing-or-installation')
  await context.clearCookies()
  await go(page, origin + '/login')
  await page.locator('#login-name').fill(fixture.reader.login)
  await page
    .locator('#login-password')
    .fill(readFileSync(fixture.reader.passwordFile, 'utf8').trim())
  await page.locator('form').evaluate((f) => f.requestSubmit())
  await page.waitForURL((url) => /\/(workspace|settings\/guide)$/.test(url.pathname))
  assert.equal((await context.request.get(origin + '/api/v1/pki/agent/trust')).status(), 403)
  const session = await get(`/api/v1/identity/tenants/${fixture.tenant}/session`)
  const denied = await context.request.post(
    origin + `/api/v1/agent-registrations/${fixture.collector.runtime.registrationId}/recovery`,
    {
      headers: { Origin: origin, 'X-Identity-Request': '1', 'X-CSRF-Token': session.csrfToken },
      data: input,
    },
  )
  assert.equal(denied.status(), 403)
  await context.clearCookies()
  assert.equal((await context.request.get(origin + '/api/v1/pki/agent/trust')).status(), 401)
  coverage.push('pki-and-agent-recovery-real-credentials-403-and-anonymous-401')
}

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
