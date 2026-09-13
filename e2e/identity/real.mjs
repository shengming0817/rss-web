import { writeFileSync, readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { Buffer } from 'node:buffer'
import process from 'node:process'
// Real-browser T2 consumer of the built app and public Identity routers. Fixture credentials only.
import { chromium, expect } from '@playwright/test'
const origin = process.env.IDENTITY_TEST_UI_ORIGIN
let issuer
let ca
const tenant = '11111111-1111-4111-8111-111111111111'
let browser
let context
let page
let stage = 'environment'
try {
  const parsedOrigin = new URL(origin)
  issuer = process.env.IDENTITY_TEST_FEDERATED_ISSUER
  const parsedIssuer = new URL(issuer)
  if (
    parsedOrigin.protocol !== 'https:' ||
    parsedOrigin.hostname !== 'localhost' ||
    parsedOrigin.username ||
    parsedOrigin.password ||
    parsedOrigin.search ||
    parsedOrigin.hash ||
    parsedOrigin.pathname !== '/' ||
    parsedIssuer.protocol !== 'https:' ||
    !['127.0.0.1', 'localhost'].includes(parsedIssuer.hostname) ||
    parsedIssuer.username ||
    parsedIssuer.password ||
    parsedIssuer.search ||
    parsedIssuer.hash ||
    typeof process.env.IDENTITY_TEST_FEDERATED_CA !== 'string'
  )
    throw new Error('Invalid fixture input')
  ca = readFileSync(process.env.IDENTITY_TEST_FEDERATED_CA, 'utf8')
  browser = await chromium.launch({ headless: true })
  context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN' })
  context.setDefaultTimeout(10000)
  stage = 'login'
  page = await context.newPage()
  await page.goto(`${origin}/tenants/${tenant}/login`)
  await page.getByLabel('账户名', { exact: true }).fill('admin')
  await page.getByLabel('密码', { exact: true }).fill('correct horse battery staple')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '我的会话' })).toBeVisible()
  stage = 'create'
  await page.getByRole('link', { name: '账户管理' }).click()
  await page.getByLabel('账户名', { exact: true }).fill('ui-member')
  await page.getByLabel('密码', { exact: true }).fill('a new ui member password')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: 'ui-member' })
  await expect(row).toBeVisible()
  stage = 'disable'
  await row.getByRole('button', { name: '停用账户', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true }).click()
  await expect(row).toContainText('已停用')
  stage = 'reset'
  await row.getByRole('button', { name: '重置密码', exact: true }).click()
  await page
    .getByLabel('新密码（至少 15 个字符）', { exact: true })
    .fill('a reset ui member password')
  await page.getByRole('dialog').getByRole('button', { name: '确认', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(row).toContainText('已停用')
  stage = 'enable'
  await row.getByRole('button', { name: '启用账户', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true }).click()
  await expect(row).toContainText('已启用')
  stage = 'providers'
  await page.getByRole('link', { name: '身份提供方', exact: true }).click()
  await page.locator('#issuer').fill(issuer)
  await page.locator('#client-id').fill('ui-client')
  await page.locator('#client-secret').fill('fixture-secret')
  await page.locator('#ca-pem').fill(ca)
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  const provider = page.getByRole('row').filter({ hasText: issuer }).filter({ hasText: 'v1' })
  await expect(provider).toContainText('v1')
  const providerId = await provider.locator('small').innerText()
  const savedProvider = page.getByRole('row').filter({ hasText: providerId })
  await savedProvider.getByRole('button', { name: '编辑', exact: true }).click()
  await page.locator('#client-id').fill('identity-test')
  await page.locator('#client-secret').fill('fixture-secret')
  await page.locator('#ca-pem').fill(ca)
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect(savedProvider).toContainText('v2')
  await savedProvider.getByRole('button', { name: '测试连接', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('连接测试通过')
  await savedProvider.getByRole('button', { name: '启用身份提供方', exact: true }).click()
  await expect(savedProvider).toContainText('v3')
  await savedProvider.getByRole('button', { name: '停用身份提供方', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toContainText('已有联合会话将失效')
  await page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true }).click()
  await expect(savedProvider).toContainText('v4')
  await expect(savedProvider).toContainText('已停用')
  stage = 'signout'
  await page.getByRole('link', { name: '我的会话' }).click()
  await page.getByRole('button', { name: '退出当前会话', exact: true }).click()
  await expect(page.getByRole('heading', { name: '登录', exact: true })).toBeVisible()
  const rejected = await context.request.get(`${origin}/api/v1/tenants/${tenant}/accounts`)
  expect(rejected.status()).toBe(401)
  stage = 'member-negative'
  await page.getByLabel('账户名', { exact: true }).fill('ui-member')
  await page.getByLabel('密码', { exact: true }).fill('a reset ui member password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '我的会话' })).toBeVisible()
  await expect(page.getByRole('link', { name: '账户管理' })).toHaveCount(0)
  const forbidden = await context.request.get(`${origin}/api/v1/tenants/${tenant}/accounts`)
  expect(forbidden.status()).toBe(403)
  await page.getByRole('link', { name: '我的会话' }).click()
  await page.getByRole('button', { name: '退出当前会话', exact: true }).click()
  stage = 'platform'
  await page.goto(`${origin}/tenants/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/login`)
  await page.getByLabel('账户名', { exact: true }).fill('platform')
  await page.getByLabel('密码', { exact: true }).fill('correct horse battery staple')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('link', { name: '平台管理', exact: true }).click()
  await page.getByLabel('租户名称', { exact: true }).fill('UI provisioned tenant')
  await page.getByLabel('首个管理员账户名', { exact: true }).fill('ui-first-admin')
  await page
    .getByLabel('新密码（至少 15 个字符）', { exact: true })
    .fill('first ui tenant administrator password')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  const creation = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/platform/tenants') && r.request().method() === 'POST',
  )
  await page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true }).click()
  const created = await creation
  expect(created.status()).toBe(201)
  const createdTenant = (await created.json()).operation.tenant_id
  await expect(page.getByTestId('provisioning-outcome')).toContainText('已确认开通')
  stage = 'tenant-login'
  await page.getByRole('link', { name: '进入该租户登录' }).click()
  await page.getByLabel('账户名', { exact: true }).fill('ui-first-admin')
  await page.getByLabel('密码', { exact: true }).fill('first ui tenant administrator password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '我的会话' })).toBeVisible()
  expect(page.url()).toContain(createdTenant)
  await expect(page.getByRole('link', { name: '平台管理', exact: true })).toHaveCount(0)
  stage = 'platform-negative'
  const deniedPlatform = await context.request.get(`${origin}/api/v1/platform/tenants`)
  expect([401, 403]).toContain(deniedPlatform.status())
  await page.getByRole('button', { name: '退出当前会话', exact: true }).click()
  stage = 'federated-login'
  await page.goto(`${origin}/tenants/${tenant}/login`)
  await page.getByRole('button', { name: /^组织 SSO/ }).click()
  await page.locator('#username').fill('alice')
  await page.locator('#password').fill('fixture-password')
  await page.locator('#kc-login').click()
  await expect(page.getByRole('heading', { name: '我的会话' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^增强认证/ })).toBeVisible()
  const initialFacts = await (
    await context.request.get(`${origin}/api/v1/tenants/${tenant}/session/security`)
  ).json()
  expect(initialFacts.authentication.acr).toBe('unspecified')
  expect(initialFacts.eligible_step_up_providers).toHaveLength(1)
  stage = 'step-up'
  await page.getByRole('button', { name: /^增强认证/ }).click()
  if (await page.locator('#username').isVisible()) await page.locator('#username').fill('alice')
  await page.locator('#password').fill('fixture-password')
  await page.locator('#kc-login').click()
  await expect(page.locator('#otp')).toBeVisible()
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const digest = createHmac('sha1', 'fixture-totp-secret-2339').update(counter).digest()
  const offset = digest[19] & 15
  const otp = String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0')
  await page.locator('#otp').fill(otp)
  await page.locator('#kc-login').click()
  await expect(page.getByRole('heading', { name: '我的会话' })).toBeVisible()
  await expect(page.getByText('认证强度: 已验证 MFA', { exact: true })).toBeVisible()
  const upgradedFacts = await (
    await context.request.get(`${origin}/api/v1/tenants/${tenant}/session/security`)
  ).json()
  expect(upgradedFacts.session_id).not.toBe(initialFacts.session_id)
  expect(upgradedFacts.authentication.acr).toBe('mfa')
  expect(upgradedFacts.authentication.auth_time).toBeGreaterThanOrEqual(
    initialFacts.authentication.auth_time,
  )
  expect(await page.evaluate(() => sessionStorage.getItem('rss.identity.pending-flow'))).toBeNull()
  console.log('Identity real browser seam passed')
} catch (error) {
  console.log(
    `Identity UI seam failed at ${stage}: ${stage === 'environment' ? 'environment' : error?.name === 'TimeoutError' ? 'timeout' : 'assertion'}`,
  )
  if (process.env.IDENTITY_UI_DIAGNOSTIC)
    writeFileSync(
      process.env.IDENTITY_UI_DIAGNOSTIC,
      JSON.stringify({
        stage,
        failure:
          stage === 'environment'
            ? 'environment'
            : error?.name === 'TimeoutError'
              ? 'timeout'
              : 'assertion',
      }),
    )
  process.exitCode = 1
} finally {
  try {
    await context?.close()
  } finally {
    await browser?.close()
  }
}
