import { Buffer } from 'node:buffer'
import assert from 'node:assert/strict'
import { createPublicKey, verify } from 'node:crypto'
// ref: nodejs/node lib/internal/crypto/sig.js@v24.14.0 (verifyOneShot).
function signature(bytes, signature, publicKey) {
  return verify(
    null,
    bytes,
    createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: publicKey }, format: 'jwk' }),
    Buffer.from(signature, 'base64url'),
  )
}
export async function signedConfigurationJourney(run, admin) {
  const { checks, origin } = run
  await run.nav(admin, '/enroll', '设备注册')
  await admin.getByRole('tab', { name: '管理员安装配置', exact: true }).click()
  await admin.getByRole('button', { name: '生成管理员安装配置', exact: true }).click()
  const dialog = admin.getByRole('dialog', { name: '交付管理员安装配置', exact: true })
  await dialog.getByRole('checkbox', { name: '通过受保护渠道交付此秘密 JSON', exact: true }).check()
  const configurationPath = `/api/v1/tenants/${run.fixture.tenant}/agent-configurations`
  const delivered = await run.response(admin, 'POST', configurationPath, () =>
    dialog.getByRole('button', { name: '签发并准备下载 JSON', exact: true }).click(),
  )
  const originalBytes = await delivered.body(),
    document = JSON.parse(originalBytes.toString('utf8'))
  const nested = document.configuration.connections
  const status = await admin.request.get(
    `${origin}/api/v1/tenants/${run.fixture.tenant}/agent-connections`,
  )
  assert.equal(status.status(), 200)
  const connection = await status.json()
  assert.deepEqual(nested, connection.configuration)
  const { verificationKeys } = connection
  assert.equal(nested.configuration.preferredOrigin, origin)
  assert.ok(nested.configuration.revision > 0)
  assert.equal(nested.configuration.serviceId, run.fixture.serviceId)
  assert.equal(document.configuration.tenantId, run.fixture.tenant)
  assert.equal(nested.configuration.tenantId, run.fixture.tenant)
  const connectionBytes = Buffer.from(
    JSON.stringify(['rss-mdm/agent-connections/v1', nested.configuration]),
  )
  const bytes = Buffer.concat([
    Buffer.from('rss-mdm-agent-enrollment-configuration-v1-ed25519\0'),
    Buffer.from(JSON.stringify([document.configuration, document.secret])),
  ])
  try {
    assert.equal(
      signature(connectionBytes, nested.signature, verificationKeys[nested.configuration.keyId]),
      true,
    )
    assert.equal(
      signature(bytes, document.signature, verificationKeys[document.configuration.keyId]),
      true,
    )
    const changed = Buffer.from(bytes)
    changed[changed.length - 3] ^= 1
    try {
      assert.equal(
        signature(changed, document.signature, verificationKeys[document.configuration.keyId]),
        false,
      )
    } finally {
      changed.fill(0)
    }
  } finally {
    connectionBytes.fill(0)
    bytes.fill(0)
  }
  const download = admin.waitForEvent('download')
  await dialog.getByRole('link', { name: '下载 rss-agent-enrollment.json', exact: true }).click()
  const file = await download
  let received = Buffer.alloc(0)
  for await (const chunk of await file.createReadStream())
    received = Buffer.concat([received, chunk])
  assert.equal(received.equals(originalBytes), true)
  received.fill(0)
  originalBytes.fill(0)
  document.secret = ''
  await file.delete()
  const issuedCount = run.count(admin, 'POST', configurationPath)
  await admin.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    delete document.visibilityState
  })
  await dialog
    .getByRole('link', { name: '下载 rss-agent-enrollment.json', exact: true })
    .waitFor({ state: 'hidden' })
  assert.equal(run.count(admin, 'POST', configurationPath), issuedCount)
  await dialog.locator('.ant-modal-close').click()
  checks.push('single-json-exact-bytes-secret-clears-on-hide-no-automatic-issuance')

  await admin.getByRole('button', { name: '生成管理员安装配置', exact: true }).click()
  await dialog.getByRole('checkbox', { name: '通过受保护渠道交付此秘密 JSON', exact: true }).check()
  let lostOperation
  const pattern = origin + configurationPath
  await admin.route(pattern, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    lostOperation = route.request().postDataJSON().operationId
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    await route.abort('failed')
  })
  await dialog.getByRole('button', { name: '签发并准备下载 JSON', exact: true }).click()
  await dialog.getByRole('button', { name: '查询原签发操作', exact: true }).waitFor()
  const lostCount = run.count(admin, 'POST', configurationPath)
  await run.response(
    admin,
    'GET',
    `/api/v1/tenants/${run.fixture.tenant}/agent-configuration-operations/${lostOperation}`,
    () => dialog.getByRole('button', { name: '查询原签发操作', exact: true }).click(),
  )
  await dialog
    .getByText('原配置已找到，秘密文件不能恢复。请在详情确认撤销后，再显式开始新签发。', {
      exact: true,
    })
    .waitFor()
  assert.equal(await dialog.locator('a[download]').count(), 0)
  assert.equal(run.count(admin, 'POST', configurationPath), lostCount)
  await dialog.getByRole('button', { name: '确认撤销原安装配置', exact: true }).click()
  await dialog.getByRole('button', { name: '配置已撤销，准备新签发', exact: true }).waitFor()
  await admin.unroute(pattern)
  await dialog.getByRole('button', { name: '配置已撤销，准备新签发', exact: true }).click()
  assert.equal(run.count(admin, 'POST', configurationPath), lostCount)
  await dialog.getByRole('checkbox', { name: '通过受保护渠道交付此秘密 JSON', exact: true }).check()
  const reissued = await run.response(admin, 'POST', configurationPath, () =>
    dialog.getByRole('button', { name: '签发并准备下载 JSON', exact: true }).click(),
  )
  assert.notEqual(reissued.request().postDataJSON().operationId, lostOperation)
  await dialog.getByRole('link', { name: '下载 rss-agent-enrollment.json', exact: true }).waitFor()
  assert.equal(run.count(admin, 'POST', configurationPath), lostCount + 1)
  await dialog.locator('.ant-modal-close').click()
  await admin.reload()
  await admin.getByRole('heading', { name: '设备注册', exact: true }).waitFor()
  assert.equal(run.count(admin, 'POST', configurationPath), lostCount + 1)
  checks.push(
    'committed-json-loss-original-metadata-revoke-explicit-new-issuance-no-refresh-replay',
  )
  return nested
}
