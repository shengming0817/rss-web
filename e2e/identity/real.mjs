import { writeFileSync } from 'node:fs'
import process from 'node:process'
// Real-browser T2 consumer of the built app and public Identity routers. Fixture credentials only.
import { chromium, expect } from '@playwright/test'
const origin = process.env.IDENTITY_TEST_UI_ORIGIN
if (!origin?.startsWith('https://localhost:')) throw new Error('Missing isolated Identity origin')
const tenant = '11111111-1111-4111-8111-111111111111'
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN' })
context.setDefaultTimeout(10000)
let page
let stage = 'login'
try {
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
    `Identity UI seam failed at ${stage}: ${error?.name === 'TimeoutError' ? 'timeout' : 'assertion'}`,
  )
  if (process.env.IDENTITY_UI_DIAGNOSTIC)
    writeFileSync(
      process.env.IDENTITY_UI_DIAGNOSTIC,
      JSON.stringify({ stage, failure: error?.name === 'TimeoutError' ? 'timeout' : 'assertion' }),
    )
  process.exitCode = 1
} finally {
  await context.close()
  await browser.close()
}
