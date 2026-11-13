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
  await run.choose(page, page.getByRole('combobox', { name: '目标系统', exact: true }), 'windows')
  await run.choose(page, page.getByRole('combobox', { name: '原生架构', exact: true }), 'x86_64')
  const saved = await run.response(page, 'POST', '/api/v1/agent-packages/save', () =>
    page.getByRole('button', { name: '明确保存软件定义', exact: true }).click(),
  )
  assert.equal((await saved.json()).packageId, preparation.packageId)
  const original = saved.request().postDataJSON().operationId
  await run.response(page, 'GET', '/api/v1/agent-packages/operations/' + original, () =>
    page.getByRole('button', { name: '读取原包操作', exact: true }).click(),
  )
  const release = await (
    await run.response(page, 'POST', '/api/v1/agent-packages', () =>
      page.getByRole('button', { name: '明确发布已保存软件', exact: true }).click(),
    )
  ).json()
  assert.equal(release.version, '3148-browser')
  assert.ok(
    (await (await anonymous.request.get(origin + '/api/v1/agent/enroll/packages')).json()).some(
      (row) => row.releaseId === release.releaseId,
    ),
  )
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
    'real-agent-package-upload-inspect-save-original-receipt-publish-public-discovery-withdraw',
  )
}
