import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import process from 'node:process'
import { containsExternalFontOrigin, findInlineScriptTags } from './artifact-policy.mjs'

const root = process.argv[2]
if (!root) throw new Error('dist path is required')
const mode = process.argv[3] ?? 'production'
if (mode !== 'production' && mode !== 'demo') {
  throw new Error('artifact mode must be production or demo')
}

const productionForbidden = [
  /RoleBindingsPreviewView/,
  /preview\/role-bindings/,
  /preview-subject-/,
  /ConfigCatalogPreviewView/,
  /ConfigHistoryPreviewView/,
  /preview\.example\./,
  /preview\/config-catalog/,
  /preview\/config-history/,
]
const commonForbidden = [/ant-design-vue/, /@ant-design\/icons-vue/, /\banticon\b/]

function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const target = join(path, entry.name)
    return entry.isDirectory() ? files(target) : [target]
  })
}

for (const file of files(root)) {
  if (mode === 'production' && productionForbidden.some((pattern) => pattern.test(file))) {
    throw new Error(`production artifact contains Preview file: ${file}`)
  }
  if (!['.html', '.js', '.css'].includes(extname(file))) continue
  const content = readFileSync(file, 'utf8')
  if (commonForbidden.some((pattern) => pattern.test(content))) {
    throw new Error(`${mode} artifact contains removed external UI content: ${file}`)
  }
  if (containsExternalFontOrigin(content)) {
    throw new Error(`${mode} artifact contains an external font origin: ${file}`)
  }
  if (extname(file) === '.html' && findInlineScriptTags(content).length > 0) {
    throw new Error(`${mode} artifact contains an inline script: ${file}`)
  }
  if (mode === 'production' && productionForbidden.some((pattern) => pattern.test(content))) {
    throw new Error(`production artifact contains Preview content: ${file}`)
  }
}
