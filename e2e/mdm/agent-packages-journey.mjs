import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import assert from 'node:assert/strict'
export async function agentPackagesJourney(run, page, anonymous) {
  const { origin, fixture } = run
  await run.nav(page, '/enroll?tab=packages', '设备注册')
  await page.getByLabel('选择 Agent 安装包', { exact: true }).setInputFiles(fixture.installerFile)
  const preparation = await (
    await run.response(page, 'POST', '/api/v1/agent-packages/uploads', () =>
      page.getByRole('button', { name: '明确准备此上传', exact: true }).click(),
    )
  ).json()
  await page.getByRole('button', { name: '校验原材料长度与摘要', exact: true }).click()
  await run.response(page, 'PATCH', preparation.href, () =>
    page.getByRole('button', { name: '从已确认位置续传一块', exact: true }).click(),
  )
  await run.response(
    page,
    'POST',
    preparation.href + '/complete',
    () => page.getByRole('button', { name: '完成原上传', exact: true }).click(),
    201,
  )
  await run.response(page, 'GET', '/api/v1/agent-packages/uploads/' + preparation.packageId, () =>
    page.getByRole('button', { name: '读取持久解析', exact: true }).click(),
  )
  await run.response(page, 'POST', '/api/v1/agent-packages/uploads/' + preparation.packageId, () =>
    page.getByRole('button', { name: '明确解析原上传', exact: true }).click(),
  )
  await page
    .getByLabel('明确产品版本（留空仅使用正式解析结果）', { exact: true })
    .fill('3148-browser')
  await run.choose(page, page.getByLabel('目标系统', { exact: true }), 'windows')
  await run.choose(page, page.getByLabel('原生架构', { exact: true }), 'x86_64')
  await page.getByRole('checkbox', { name: '提供完整安装定义', exact: true }).check()
  await page.getByLabel('安装器材料键', { exact: true }).fill('package')
  const layout = page
    .locator('.ant-card')
    .filter({ has: page.getByLabel('EXE 文件布局 新键', { exact: true }) })
    .last()
  await page.getByLabel('EXE 文件布局 新键', { exact: true }).fill('agent.exe')
  await layout.getByRole('button', { name: '添加', exact: true }).click()
  await page.getByLabel('EXE 文件布局.agent.exe', { exact: true }).fill('package')
  await page.getByRole('button', { name: '添加 安装调用 参数', exact: true }).click()
  await page.getByLabel('安装调用 参数 1', { exact: true }).fill('/quiet')
  await page.getByRole('button', { name: '添加 升级调用 参数', exact: true }).click()
  await page.getByLabel('升级调用 参数 1', { exact: true }).fill('/quiet')
  await page
    .getByLabel('MSI 产品代码', { exact: true })
    .fill('{11111111-1111-4111-8111-111111111111}')
  await page.getByLabel('检测软件版本', { exact: true }).fill('3148-browser')
  const screenshots = mkdtempSync(join(tmpdir(), 'rss-react-agent-packages-'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: join(screenshots, 'packages-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  })
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
  if (!fits)
    console.error(
      JSON.stringify({
        phase: 'agent-packages-layout',
        screenshots,
        overflow: await page.locator('main *').evaluateAll((nodes) =>
          nodes
            .filter((node) => node.getBoundingClientRect().right > innerWidth + 1)
            .slice(0, 20)
            .map((node) => ({
              tag: node.tagName,
              class: node.className,
              right: Math.round(node.getBoundingClientRect().right),
            })),
        ),
      }),
    )
  assert.equal(fits, true)
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByRole('button', { name: 'English', exact: true }).press('Enter')
  await page.getByLabel('Original package UUID', { exact: true }).waitFor()
  await page.screenshot({
    path: join(screenshots, 'packages-en-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: join(screenshots, 'packages-en-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByRole('button', { name: '中文', exact: true }).press('Enter')
  run.checks.push('agent-package-mobile-and-english-keyboard-authoring:' + screenshots)
  let original,
    savedWrites = 0
  const beforeSave = run.count(page, 'POST', '/api/v1/agent-packages/save')
  await page.route('**/api/v1/agent-packages/save', async (route) => {
    savedWrites++
    original = route.request().postDataJSON().operationId
    const actual = await route.fetch()
    assert.equal(actual.status(), 200)
    assert.equal((await actual.json()).packageId, preparation.packageId)
    await route.abort('failed')
  })
  await Promise.all([
    page.waitForEvent(
      'requestfailed',
      (request) =>
        request.method() === 'POST' && request.url().endsWith('/api/v1/agent-packages/save'),
    ),
    page.getByRole('button', { name: '明确保存软件定义', exact: true }).click(),
  ])
  await page.getByRole('button', { name: '显式重提完全相同请求', exact: true }).waitFor()
  await page
    .getByRole('button', { name: '读取原包操作', exact: true })
    .waitFor({ state: 'visible' })
  assert.equal(
    await page.getByRole('button', { name: '明确发布已保存软件', exact: true }).isDisabled(),
    true,
  )
  await page.unroute('**/api/v1/agent-packages/save')
  await run.response(page, 'GET', '/api/v1/agent-packages/operations/' + original, () =>
    page.getByRole('button', { name: '读取原包操作', exact: true }).click(),
  )
  await page.getByRole('button', { name: '结束此操作', exact: true }).click()
  assert.equal(savedWrites, 1)
  assert.equal(run.count(page, 'POST', '/api/v1/agent-packages/save'), beforeSave + 1)
  const release = await (
    await run.response(page, 'POST', '/api/v1/agent-packages', () =>
      page.getByRole('button', { name: '明确发布已保存软件', exact: true }).click(),
    )
  ).json()
  assert.equal(release.version, '3148-browser')
  const catalog = await (
    await anonymous.request.get(origin + '/api/v1/agent/enroll/packages')
  ).json()
  const presented = catalog.find((row) => row.releaseId === release.releaseId)
  assert.ok(presented)
  await anonymous.reload()
  const [downloaded] = await Promise.all([
    anonymous.waitForEvent('download'),
    anonymous
      .locator(`tr[data-row-key="${release.releaseId}"]`)
      .getByRole('link', { name: '下载安装包', exact: true })
      .click(),
  ])
  let actual = Buffer.alloc(0)
  try {
    for await (const chunk of await downloaded.createReadStream())
      actual = Buffer.concat([actual, chunk])
    assert.equal(actual.length, release.length)
    assert.deepEqual([...createHash('sha256').update(actual).digest()], release.installerSha256)
  } finally {
    actual.fill(0)
    await downloaded.delete()
  }
  await page.getByRole('button', { name: release.releaseId, exact: true }).click()
  await run.response(
    page,
    'POST',
    '/api/v1/agent-packages/' + release.releaseId + '/withdraw',
    () => page.getByRole('button', { name: '明确撤回此发布', exact: true }).click(),
    204,
  )
  assert.ok(
    !(await (await anonymous.request.get(origin + '/api/v1/agent/enroll/packages')).json()).some(
      (row) => row.releaseId === release.releaseId,
    ),
  )
  run.checks.push(
    'real-agent-package-upload-inspect-save-original-receipt-publish-download-withdraw',
  )
}
