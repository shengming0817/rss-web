/** Fixed product schema in; types and CSP-safe validators out.
 * ref: ajv lib/standalone/index.ts@v8.20.0
 * ref: json-schema-to-typescript src/index.ts@16.0.0
 */
import process from 'node:process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import standaloneCode from 'ajv/dist/standalone/index.js'
import { compile } from 'json-schema-to-typescript'
import { build } from 'esbuild'
import { format } from 'prettier'
const root = new URL('../', import.meta.url)
const directory = new URL('apps/mdm/src/contracts/collection/', root)
const generated = new URL('generated/', directory)
const schemas = JSON.parse(await readFile(new URL('Collection.json', directory), 'utf8'))
const checking = process.argv.includes('--check')
const ajv = new Ajv2020({
  strict: false,
  inlineRefs: false,
  messages: false,
  allErrors: false,
  code: { source: true, esm: true, optimize: 2 },
  // Rust numeric formats are annotations; safe numeric values are checked at the boundary.
  formats: {
    int64: true,
    uint64: true,
    uint32: true,
    uint16: true,
    uint8: true,
    int32: true,
    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  },
})
if (!checking) await mkdir(generated, { recursive: true })
async function output(name, source, parser) {
  const value = await format(source, { parser, singleQuote: true, semi: false, printWidth: 96 })
  const target = new URL(name, generated)
  if (checking) {
    if ((await readFile(target, 'utf8')) !== value)
      throw new Error(`Regenerate collection contract: ${name}`)
  } else await writeFile(target, value)
}
// Annotation-only schemas admit any JSON value; preserve that meaning in TS as unknown.
function types(value) {
  if (Array.isArray(value)) return value.map(types)
  if (!value || typeof value !== 'object') return value
  const result = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      ['properties', '$defs', 'patternProperties'].includes(key) && item && typeof item === 'object'
        ? Object.fromEntries(Object.entries(item).map(([name, schema]) => [name, types(schema)]))
        : types(item),
    ]),
  )
  if (
    Object.keys(result).every((key) =>
      ['description', 'title', '$comment', 'default', 'examples'].includes(key),
    )
  )
    result.tsType = 'unknown'
  return result
}
// Remove annotations from compiled validators, retaining the original schema as provenance.
function validationSchema(value, schemaMap = false) {
  if (Array.isArray(value)) return value.map((item) => validationSchema(item))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          schemaMap || !['title', 'description', 'default', 'examples', '$comment'].includes(key),
      )
      .map(([key, item]) => [
        key,
        ['const', 'enum'].includes(key)
          ? item
          : validationSchema(
              item,
              !schemaMap && ['properties', '$defs', 'patternProperties'].includes(key),
            ),
      ]),
  )
}
const exports = {}
let declarations = ''
for (const [name, schema] of Object.entries(schemas)) {
  ajv.addSchema(validationSchema(schema), name)
  exports[`validate${name}`] = name
  await output(
    `${name}.ts`,
    await compile({ ...types(schema), title: name }, name, {
      bannerComment: '/* Generated from Collection.json. Do not edit. */',
      unknownAny: true,
      ignoreMinAndMaxItems: true,
    }),
    'typescript',
  )
  declarations += `import type { ${name} } from './${name}'\nexport declare function validate${name}(value: unknown): value is ${name}\n`
}
for (const name of [
  'ScriptDefinition',
  'TelemetryProfile',
  'ValueMapping',
  'Applicability',
  'NativeCollectionDefinition',
  'AgentCollectionDefinition',
  'SoftwareDefinition',
]) {
  exports[`validate${name}`] = `ResourceWrite#/$defs/${name}`
  declarations += `import type { ${name} } from './ResourceWrite'\nexport declare function validate${name}(value: unknown): value is ${name}\n`
}
exports.validateFieldDefinition = 'FieldWrite#/$defs/FieldDefinition'
declarations += `import type { FieldDefinition } from './FieldWrite'\nexport declare function validateFieldDefinition(value: unknown): value is FieldDefinition\n`
const result = await build({
  stdin: {
    contents: standaloneCode(ajv, exports),
    resolveDir: fileURLToPath(root),
    sourcefile: 'collection-validators.js',
  },
  bundle: true,
  platform: 'browser',
  format: 'esm',
  write: false,
  legalComments: 'none',
})
await output(
  'validators.js',
  '/* Generated from Collection.json. Do not edit. */\n' + result.outputFiles[0].text,
  'babel',
)
await output('validators.d.ts', declarations, 'typescript')
