import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { contractSource } from './contract-source.mjs'

const current = JSON.parse(
  await readFile(new URL('../contracts/mdm/source.json', import.meta.url), 'utf8'),
)
const snapshot = await readFile(new URL('../contracts/mdm/http-v1.json', import.meta.url))
async function withSnapshot(bytes, changes, work) {
  const temporary = await mkdtemp(join(tmpdir(), 'rss-contract-source-'))
  try {
    await mkdir(join(temporary, 'contracts/mdm'), { recursive: true })
    const source = {
      ...current,
      blob: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      ...changes,
    }
    await writeFile(join(temporary, 'contracts/mdm/source.json'), JSON.stringify(source))
    await writeFile(join(temporary, 'contracts/mdm/http-v1.json'), bytes)
    await work(pathToFileURL(temporary + '/'))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
test('reads the committed contract without a backend checkout or Git object store', async () => {
  const { document, source } = await contractSource()
  assert.equal(source.revision, current.revision)
  assert.equal(document.formatVersion, 1)
  assert.ok(
    document.endpoints.some((e) => e.operationId === 'browser:POST:/api/v1/policies/previews'),
  )
})
test('rejects invalid provenance or a snapshot that differs from its pin', async () => {
  for (const replacement of [
    { revision: 'develop' },
    { repository: 'https://untrusted.invalid/mdm' },
    { path: '../different.json' },
    { sha256: '0'.repeat(64) },
    { blob: '0'.repeat(40) },
  ])
    await withSnapshot(snapshot, replacement, (root) => assert.rejects(contractSource(root)))
  await withSnapshot(snapshot, {}, async (root) => {
    await writeFile(
      new URL('contracts/mdm/http-v1.json', root),
      Buffer.concat([snapshot, Buffer.from('\n')]),
    )
    await assert.rejects(contractSource(root), /differs from its pin/)
    await rm(new URL('contracts/mdm/http-v1.json', root))
    await assert.rejects(contractSource(root), { code: 'ENOENT' })
  })
})
test('rejects malformed JSON and unsupported contract formats even with matching pins', async () => {
  await withSnapshot(Buffer.from('{'), {}, (root) =>
    assert.rejects(contractSource(root), SyntaxError),
  )
  for (const replacement of [
    { formatVersion: 2 },
    { schemaDialect: 'https://json-schema.org/draft-07/schema' },
    { endpoints: [] },
    { schemas: {} },
  ]) {
    const document = { ...JSON.parse(snapshot), ...replacement }
    await withSnapshot(Buffer.from(JSON.stringify(document)), {}, (root) =>
      assert.rejects(contractSource(root), /Unsupported MDM HTTP contract format/),
    )
  }
})
