// Real production UI/HTTP acceptance; native containers are synthetic, not installable releases.
// ref: rss-mdm crates/content-service/tests/fixtures/installers.rs (same minimal PE/XAR formats).
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { deflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
function exe(arm) {
  const b = Buffer.alloc(128 * 1024 + 3)
  b.write('MZ')
  b.writeUInt32LE(0x80, 0x3c)
  b.write('PE\0\0', 0x80)
  b.writeUInt16LE(arm ? 0xaa64 : 0x8664, 0x84)
  b.writeUInt16LE(1, 0x86)
  b.writeUInt16LE(240, 0x94)
  b.writeUInt16LE(0x22, 0x96)
  const opt = 0x98
  b.writeUInt16LE(0x20b, opt)
  b.writeUInt32LE(0x1000, opt + 16)
  b.writeUInt32LE(4096, opt + 32)
  b.writeUInt32LE(512, opt + 36)
  b.writeUInt32LE(8192, opt + 56)
  b.writeUInt32LE(512, opt + 60)
  b.writeUInt16LE(3, opt + 68)
  b.writeUInt32LE(16, opt + 108)
  const section = opt + 240
  b.write('.text', section)
  b.writeUInt32LE(1, section + 8)
  b.writeUInt32LE(4096, section + 12)
  b.writeUInt32LE(512, section + 16)
  b.writeUInt32LE(512, section + 20)
  b.writeUInt32LE(0x60000020, section + 36)
  b[512] = 0xc3
  return b
}
function pkg(version) {
  const info = Buffer.from(
    `<?xml version="1.0"?><pkg-info identifier="com.rss.agent.pkg" version="${version}" format-version="2" auth="root"><bundle id="com.rss.agent"/></pkg-info>`,
  )
  const toc = Buffer.from(
    `<?xml version="1.0"?><xar><toc><file id="1"><name>PackageInfo</name><type>file</type><data><offset>0</offset><length>${info.length}</length><size>${info.length}</size><encoding style="application/octet-stream"/></data></file></toc></xar>`,
  )
  const compressed = deflateSync(toc),
    header = Buffer.alloc(28)
  header.write('xar!')
  header.writeUInt16BE(28, 4)
  header.writeUInt16BE(1, 6)
  header.writeBigUInt64BE(BigInt(compressed.length), 8)
  header.writeBigUInt64BE(BigInt(toc.length), 16)
  return Buffer.concat([header, compressed, info])
}
export async function acceptExperience({
  page,
  context,
  fixture,
  origin,
  api,
  request,
  path,
  settled,
  group,
  coverage,
}) {
  await page.goto(path(`devices/${fixture.mdm}`))
  await page.getByRole('button', { name: '管理扩展分组', exact: true }).click()
  let dialog = page.getByRole('dialog')
  for (const name of ['Browser shared fields', 'Browser second fields']) {
    await dialog.getByRole('button', { name: '新增分组', exact: true }).click()
    await dialog.getByLabel('分组名称', { exact: true }).fill(name)
    await dialog.locator('.field-choice').filter({ hasText: '资产编号' }).locator('input').check()
  }
  await dialog.getByRole('button', { name: '上移', exact: true }).first().isDisabled()
  await dialog
    .locator('.field-group-list')
    .getByRole('button', { name: '上移', exact: true })
    .last()
    .click()
  await dialog.getByRole('button', { name: '保存分组', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  const layout = (await api('/api/v1/asset-field-layout')).asset
  assert.equal(layout.groups[0].name, 'Browser second fields')
  await page.reload()
  await page.getByRole('button', { name: 'Browser shared fields', exact: true }).click()
  assert.ok((await page.locator('.asset-detail-layout').textContent()).includes(fixture.mdm))
  coverage.push('real-shared-field-layout-save-order-and-reload')
  await page.goto(path('devices/groups'))
  await page.getByRole('button', { name: '创建', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByTestId('group-name').fill('Browser nested group')
  await dialog.getByTestId('group-kind').selectOption('dynamic')
  await dialog.locator('.group-criteria > .console-toolbar select').first().selectOption('group')
  await dialog.locator('.group-picker select').selectOption(group)
  const created = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /\/api\/v1\/groups\/[^/]+$/.test(new URL(r.url()).pathname),
  )
  await dialog.getByRole('button', { name: '保存并查看成员', exact: true }).click()
  const response = await created
  assert.equal(response.status(), 200)
  const nested = await response.json()
  await settled(`/api/v1/groups/${nested.group.id}/tasks/${nested.task}`)
  const members = await api(`/api/v1/groups/${nested.group.id}/results/${nested.task}/members`)
  assert.deepEqual(members.page.items, [{ kind: 'endpoint', id: fixture.agent }])
  const references = await api(`/api/v1/groups/${group}/references`)
  assert.equal(references.deletionBlocked, true)
  assert.ok(references.items.some((item) => item.source.id === nested.group.id))
  await page.getByRole('tab', { name: '依赖影响', exact: true }).click()
  await page.locator('.group-dependencies').waitFor()
  coverage.push('real-nested-group-save-members-and-authoritative-references')
  await page.goto(path('settings/enrollment'))
  await page
    .locator('[data-setting=agent-package]')
    .getByRole('button', { name: '打开', exact: true })
    .click()
  const cases = [
    ['Windows x64', 'windows', 'x86_64', 'browser-x64.exe', exe(false), '8.1.0'],
    ['Windows ARM64', 'windows', 'aarch64', 'browser-arm.exe', exe(true), '8.1.1'],
    ['macOS Intel', 'macos', 'x86_64', 'browser-intel.pkg', pkg('8.1.2'), '8.1.2'],
    ['macOS Apple Silicon', 'macos', 'aarch64', 'browser-silicon.pkg', pkg('8.1.3'), '8.1.3'],
  ]
  const releases = []
  for (const [label, platform, architecture, name, buffer, version] of cases) {
    const row = page
      .locator('.package-platform-row')
      .filter({ has: page.getByRole('heading', { name: label, exact: true }) })
    await row.getByRole('button', { name: '添加安装包', exact: true }).click()
    const task = page.locator('.package-upload-task')
    await task
      .locator('input[type=file]')
      .setInputFiles({ name, mimeType: 'application/octet-stream', buffer })
    const versionInput = task.getByLabel('安装包版本', { exact: true })
    await versionInput.waitFor()
    if (!(await versionInput.getAttribute('readonly')) && (await versionInput.isEditable()))
      await versionInput.fill(version)
    await task.getByRole('button', { name: '发布安装包', exact: true }).click()
    await row.getByText(name, { exact: true }).waitFor()
    const release = (await api('/api/v1/agent-packages')).find((item) => item.filename === name)
    assert.ok(release)
    assert.deepEqual(release.target, { platform, architecture })
    releases.push(release)
    const download = await request(
      'get',
      `${origin}/api/v1/agent/enroll/packages/${release.releaseId}/content`,
    )
    assert.equal(download.status(), 200)
    assert.equal(
      createHash('sha256')
        .update(await download.body())
        .digest('hex'),
      createHash('sha256').update(buffer).digest('hex'),
    )
    await task.getByRole('button', { name: '取消', exact: true }).click()
  }
  assert.equal(releases.length, 4)
  const catalog = await context.request.get(`${origin}/api/v1/agent/enroll/packages`)
  assert.equal(catalog.status(), 200)
  assert.ok((await catalog.json()).length >= 4)
  coverage.push('real-four-target-unsigned-upload-publish-and-byte-identical-download')
  await page.keyboard.press('Escape')
}
