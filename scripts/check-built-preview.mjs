import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import process from 'node:process'

const root = process.argv[2]
if (!root) throw new Error('dist path is required')

const forbidden = [/ConfigCatalogPreviewView/, /preview\.example\./, /preview\/config-catalog/]

function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const target = join(path, entry.name)
    return entry.isDirectory() ? files(target) : [target]
  })
}

for (const file of files(root)) {
  if (forbidden.some((pattern) => pattern.test(file))) {
    throw new Error(`production artifact contains Config Catalog Preview file: ${file}`)
  }
  if (!['.html', '.js', '.css'].includes(extname(file))) continue
  const content = readFileSync(file, 'utf8')
  if (forbidden.some((pattern) => pattern.test(content))) {
    throw new Error(`production artifact contains Config Catalog Preview content: ${file}`)
  }
}
