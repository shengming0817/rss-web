import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export async function readContractPin(root = new URL('../', import.meta.url)) {
  const source = JSON.parse(await readFile(new URL('contracts/mdm/source.json', root), 'utf8'))
  if (
    !source ||
    typeof source !== 'object' ||
    Array.isArray(source) ||
    Object.keys(source).sort().join(',') !== 'generator,repository,revision,sha256' ||
    source.repository !== 'https://dev.azure.com/shengming0923/rss/_git/rss-mdm' ||
    !/^[a-f0-9]{40}$/.test(source.revision) ||
    !/^[a-f0-9]{64}$/.test(source.sha256) ||
    source.generator !==
      'python3 hack/http_contract_artifact.py --output artifacts/http-contract/http-v1.json'
  )
    throw new Error('Invalid fixed MDM source')
  return source
}

export function contractSha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export async function contractSource(root = new URL('../', import.meta.url)) {
  const source = await readContractPin(root)
  const bytes = await readFile(new URL('contracts/mdm/http-v1.json', root))
  if (contractSha256(bytes) !== source.sha256)
    throw new Error('Local MDM contract differs from its pin. Run make prepare-contract first.')
  const document = JSON.parse(bytes.toString())
  if (
    document.formatVersion !== 1 ||
    document.schemaDialect !== 'https://json-schema.org/draft/2020-12/schema' ||
    !Array.isArray(document.endpoints) ||
    !document.endpoints.some((endpoint) => endpoint.listener === 'browser') ||
    !document.schemas ||
    typeof document.schemas !== 'object' ||
    Array.isArray(document.schemas) ||
    Object.keys(document.schemas).length === 0
  )
    throw new Error('Unsupported MDM HTTP contract format')
  return { source, document }
}
