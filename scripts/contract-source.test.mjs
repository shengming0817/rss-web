import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { contractSource } from './contract-source.mjs'
const current = JSON.parse(
  await readFile(new URL('../contracts/mdm/source.json', import.meta.url), 'utf8'),
)
async function withPin(pin, work) {
  const temporary = await mkdtemp(join(tmpdir(), 'rss-contract-source-'))
  try {
    await mkdir(join(temporary, 'contracts/mdm'), { recursive: true })
    await writeFile(join(temporary, 'contracts/mdm/source.json'), JSON.stringify(pin))
    await work(pathToFileURL(temporary + '/'))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
test('verifies the actual pinned Git artifact', async () => {
  const { document, source } = await contractSource()
  assert.equal(source.revision, current.revision)
  assert.equal(document.formatVersion, 1)
  assert.ok(
    document.endpoints.some((e) => e.operationId === 'browser:POST:/api/v1/policies/previews'),
  )
})
test('source identity cannot be replaced with a branch, a different repository, or a self-reported digest', async () => {
  for (const replacement of [
    { revision: 'develop' },
    { repository: 'https://untrusted.invalid/mdm' },
    { sha256: '0'.repeat(64) },
    { blob: '0'.repeat(40) },
  ])
    await withPin({ ...current, ...replacement }, (root) => assert.rejects(contractSource(root)))
})
test('an older fixed consumer remains readable after the producer advances', async () => {
  await withPin(
    {
      ...current,
      revision: '2c6fa81a9497e9777fc45bc6bc2eee8bfa3f7aff',
      blob: '23e5e51094c8d0763695238d9c8d7f88e5ba3cb2',
      sha256: 'f2f2093882ca08852fb350b330dcf1d9c004106b19c4788b4e10c2e1adc4bb12',
    },
    async (root) => {
      const { source, document } = await contractSource(root)
      assert.equal(source.revision, '2c6fa81a9497e9777fc45bc6bc2eee8bfa3f7aff')
      assert.equal(document.formatVersion, 1)
    },
  )
})
