// Explicit loopback mock browser evidence only; never a product backend health claim.
import { createServer } from 'vite'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
  shots = mkdtempSync(join(tmpdir(), 'rss-react-diagnostics-mock-'))
let server, browser, closing, timer
const close = () =>
  (closing ??= (async () => {
    clearTimeout(timer)
    await browser?.close()
    await server?.close()
  })())
const stop = () => {
  process.exitCode = 1
  void close()
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
timer = setTimeout(stop, 120000)
try {
  server = await createServer({
    configFile: resolve(root, 'apps/mdm/demo/vite.config.ts'),
    server: { host: '127.0.0.1', port: 0 },
  })
  await server.listen()
  const origin = server.resolvedUrls.local[0]
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }),
    errors = []
  page.on('pageerror', (e) => errors.push(e.name))
  await page.goto(origin)
  await page.getByText('模拟诊断 · 仅验证界面', { exact: true }).waitFor()
  await page.getByText('未观察，不表示零积压', { exact: false }).waitFor()
  assert.equal(await page.locator('[data-diagnostic-owner]').count(), 3)
  assert.ok((await page.locator('[data-diagnostic-owner=policy]').textContent()).includes('≥3'))
  await page.getByRole('button', { name: '撤回诊断权限', exact: true }).click()
  await page.getByText('当前账户没有运行诊断读取权限。', { exact: true }).waitFor()
  assert.equal(await page.locator('[data-diagnostic-owner]').count(), 0)
  await page.getByRole('button', { name: '恢复诊断权限', exact: true }).click()
  await page.locator('[data-diagnostic-owner=policy]').waitFor()
  for (const [name, width, height] of [
    ['desktop', 1440, 960],
    ['tablet', 1024, 900],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'diagnostics fits viewport',
    )
    await page.screenshot({
      path: join(shots, `diagnostics-${name}.png`),
      fullPage: true,
      animations: 'disabled',
    })
  }
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByRole('button', { name: '切换主题' }).click()
  await page.screenshot({
    path: join(shots, 'diagnostics-dark.png'),
    fullPage: true,
    animations: 'disabled',
  })
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify({
      journey: 'react-diagnostics-explicit-mock',
      result: 'passed',
      screenshots: shots,
      checks: [
        'mock-warning',
        'distinct-owner-health',
        'null-and-truncated-queues',
        'permission-revocation',
        'responsive-layouts',
      ],
    }),
  )
} catch (error) {
  process.exitCode = 1
  console.error(
    JSON.stringify({
      journey: 'react-diagnostics-explicit-mock',
      result: 'failed',
      classification: error.message,
    }),
  )
} finally {
  await close()
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
}
