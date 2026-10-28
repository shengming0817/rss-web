import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

/** The committed snapshot is the complete input; provenance stays in the producer pin. */
export async function contractSource(root = new URL('../', import.meta.url)) {
  const source = JSON.parse(await readFile(new URL('contracts/mdm/source.json', root), 'utf8'))
  if (
    source.repository !== 'https://dev.azure.com/shengming0923/rss/_git/rss-mdm' ||
    !/^[a-f0-9]{40}$/.test(source.revision) ||
    !/^[a-f0-9]{40}$/.test(source.blob) ||
    !/^[a-f0-9]{64}$/.test(source.sha256) ||
    source.path !== 'contracts/http-v1.json'
  )
    throw new Error('Invalid fixed MDM source')
  const bytes = await readFile(new URL('contracts/mdm/http-v1.json', root))
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
  if (blob !== source.blob || createHash('sha256').update(bytes).digest('hex') !== source.sha256)
    throw new Error('Local MDM contract differs from its pin')
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
