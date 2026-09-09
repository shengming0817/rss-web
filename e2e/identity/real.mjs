import { writeFileSync } from 'node:fs'
import process from 'node:process'
// Real-browser T2 consumer of the built app and public Identity routers. Fixture credentials only.
import { chromium, expect } from '@playwright/test'
const origin = process.env.IDENTITY_TEST_UI_ORIGIN
const tenant = '11111111-1111-4111-8111-111111111111'
let browser
let context
let page
let stage = 'environment'
try {
  if (!origin?.startsWith('https://localhost:')) throw new Error('Missing isolated Identity origin')
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
  await page.locator('#issuer').fill('https://ui-idp.example.test')
  await page.locator('#client-id').fill('ui-client')
  await page.locator('#secret-ref').fill('ui-secret@1')
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  const provider = page.getByRole('row').filter({ hasText: 'https://ui-idp.example.test' })
  await expect(provider).toContainText('v1')
  await provider.getByRole('button', { name: '编辑', exact: true }).click()
  await page.locator('#client-id').fill('ui-client-updated')
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect(provider).toContainText('v2')
  await provider.getByRole('button', { name: '测试连接', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('连接测试通过')
  await provider.getByRole('button', { name: '启用身份提供方', exact: true }).click()
  await expect(provider).toContainText('v3')
  await provider.getByRole('button', { name: '停用身份提供方', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toContainText('已有联合会话将失效')
  await page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true }).click()
  await expect(provider).toContainText('v4')
  await expect(provider).toContainText('已停用')
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
