import process from 'node:process'
/** One producer projection, static TypeScript and CSP-safe validators.
 * ref: ajv lib/standalone/index.ts@v8.20.0
 * ref: json-schema-to-typescript src/index.ts@7f72770eb854328c96b112be445da0306bebdbaf
 */
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import standaloneCode from 'ajv/dist/standalone/index.js'
import { compile } from 'json-schema-to-typescript'
import { build } from 'esbuild'
import { format, resolveConfig } from 'prettier'
import { contractSource } from './contract-source.mjs'

const root = new URL('../', import.meta.url)
const target = new URL('packages/api/src/generated/mdm/', root)
const checking = process.argv.includes('--check')
const formatting = await resolveConfig(fileURLToPath(new URL('package.json', root)))
const { document, source } = await contractSource(root)
const outputFiles = new Set()
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const schemas = { ...document.schemas }
const endpoints = document.endpoints.filter((e) => e.listener === 'browser')
const schemaKeys = new Set([
  '$schema',
  '$ref',
  '$defs',
  'type',
  'const',
  'enum',
  'properties',
  'required',
  'additionalProperties',
  'patternProperties',
  'propertyNames',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  'if',
  'then',
  'else',
  'items',
  'prefixItems',
  'contains',
  'minContains',
  'maxContains',
  'uniqueItems',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'pattern',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minProperties',
  'maxProperties',
  'title',
  'description',
  'default',
  'readOnly',
  'examples',
  '$comment',
  'format',
  'x-rss-extension',
  'x-rss-owner',
])
const annotationKeys = new Set([
  'title',
  'description',
  'default',
  'readOnly',
  'examples',
  '$comment',
  'x-rss-extension',
  'x-rss-owner',
])
const schemaMaps = new Set(['properties', '$defs', 'patternProperties'])
const schemaLists = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems'])
const schemaChildren = new Set([
  'items',
  'contains',
  'additionalProperties',
  'propertyNames',
  'not',
  'if',
  'then',
  'else',
])
// Visit only schema positions. A const/enum/example containing JSON Schema is ordinary data.
function objectShape(schema) {
  return (
    typeof schema === 'object' &&
    (schema.type === 'object' ||
      schema.properties ||
      ['allOf', 'anyOf', 'oneOf'].some((key) => schema[key]?.some(objectShape)))
  )
}
function transform(schema, mode, composed = false) {
  if (typeof schema === 'boolean') return schema
  const result = {}
  for (const [key, value] of Object.entries(schema)) {
    if (!schemaKeys.has(key)) throw new Error(`Unsupported schema assertion: ${key}`)
    if (annotationKeys.has(key) || key === '$schema') continue
    result[key] = schemaMaps.has(key)
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, transform(v, mode)]))
      : schemaLists.has(key)
        ? value.map((v) => transform(v, mode, key !== 'prefixItems'))
        : schemaChildren.has(key)
          ? transform(value, mode, ['contains', 'not', 'if', 'then', 'else'].includes(key))
          : value
  }
  // Close the complete record after composition. Closing individual union arms
  // rejects fields owned by the shared record or another composed subschema.
  if (
    !composed &&
    objectShape(schema) &&
    result.additionalProperties === undefined &&
    !schema['x-rss-extension']
  ) {
    if (
      result.allOf ||
      result.anyOf ||
      result.oneOf ||
      result.if ||
      result.then ||
      result.else ||
      result.$ref
    ) {
      if (mode === 'validation') result.unevaluatedProperties = false
    } else if (result.properties) result.additionalProperties = false
  }
  // Rust integers must remain exact in JavaScript; floating point fields keep their wire range.
  if (
    result.type === 'integer' ||
    (Array.isArray(result.type) &&
      result.type.includes('integer') &&
      !result.type.includes('number'))
  ) {
    result.minimum = Math.max(result.minimum ?? Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER)
    result.maximum = Math.min(result.maximum ?? Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
  }
  if (mode === 'types') {
    if (result.prefixItems) {
      result.additionalItems = result.items ?? true
      result.items = result.prefixItems
      delete result.prefixItems
    }
    if (Object.keys(result).every((key) => key === '$defs')) result.tsType = 'unknown'
  }
  return result
}
const ajv = new Ajv2020({
  strict: true,
  strictRequired: false,
  strictTypes: false,
  allowMatchingProperties: true,
  inlineRefs: false,
  messages: false,
  allErrors: false,
  removeAdditional: false,
  useDefaults: false,
  coerceTypes: false,
  code: { source: true, esm: true, optimize: 2 },
  formats: Object.fromEntries([
    ...[
      'uint',
      'uint8',
      'uint16',
      'uint32',
      'uint64',
      'uint128',
      'int16',
      'int32',
      'int64',
      'int128',
      'double',
      'binary',
    ].map((k) => [k, true]),
    ['uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i],
    ['uri', /^[a-z][a-z0-9+.-]*:[^\s]*$/i],
  ]),
})
if (!checking) await mkdir(target, { recursive: true })
async function output(name, code, parser = 'typescript') {
  outputFiles.add(name)
  const value = await format(code, { ...formatting, parser })
  const path = new URL(name, target)
  if (checking) {
    if ((await readFile(path, 'utf8').catch(() => '')) !== value)
      throw new Error(`Regenerate HTTP contract: ${name}`)
  } else await writeFile(path, value)
}
const short = (id) => 's' + id.replace('sha256-', '').slice(0, 20)
function rootFor(ref) {
  if (!ref || !schemas[ref.schemaId]) throw new Error('Missing schema binding')
  return short(ref.schemaId)
}
// Also export owner definitions used for editing, canonical bytes, and display mappings.
const ownerNames = new Map()
for (const e of endpoints) {
  if (e.method === 'POST' && e.path === '/api/v1/resources/{id}') {
    const id = e.request.body.schema.schemaId
    for (const name of Object.keys(schemas[id].$defs)) ownerNames.set(name, { id, name })
    ownerNames.set('ResourceWrite', { id, name: 'Root', pointer: '' })
    ownerNames.set('ResourceResponse', {
      id: e.responses.find((r) => r.status === 200).body.schema.schemaId,
      name: 'Root',
      pointer: '',
    })
  }
  if (e.method === 'PUT' && e.path === '/api/v1/asset-fields/{field}') {
    const id = e.request.body.schema.schemaId
    ownerNames.set('FieldWrite', { id, name: 'Root', pointer: '' })
    for (const name of Object.keys(schemas[id].$defs))
      if (!ownerNames.has(name)) ownerNames.set(name, { id, name })
  }
  if (e.method === 'GET' && e.path === '/api/v1/asset-fields/{field}') {
    const id = e.responses.find((r) => r.status === 200).body.schema.schemaId
    for (const name of ['FieldView', 'FieldImpact', 'FieldMappingReference'])
      ownerNames.set(name, { id, name })
  }
  if (e.method === 'GET' && e.path === '/api/v1/asset-fields/{field}/references')
    ownerNames.set('FieldReferenceQuery', {
      id: e.request.query.schemaId,
      name: 'Root',
      pointer: '',
    })
  if (e.method === 'GET' && e.path === '/api/v1/policies/{id}') {
    const id = e.responses.find((r) => r.status === 200).body.schema.schemaId
    ownerNames.set('PolicyRead', { id, name: 'Root', pointer: '' })
    for (const name of Object.keys(schemas[id].$defs)) ownerNames.set('Policy' + name, { id, name })
  }
  if (e.method === 'POST' && e.path === '/api/v1/policies/previews') {
    const id = e.responses.find((r) => r.status === 200).body.schema.schemaId
    for (const name of ['TaskAdmission', 'TaskAdmissionState']) ownerNames.set(name, { id, name })
  }
}
const needed = new Set()
function binding(ref) {
  if (ref) needed.add(ref.schemaId)
}
for (const e of endpoints) {
  binding(e.request.path)
  binding(e.request.query)
  binding(e.request.body?.schema)
  for (const v of Object.values(e.request.headers)) binding(v)
  for (const r of e.responses) {
    binding(r.body?.schema)
    for (const v of Object.values(r.headers)) binding(v)
  }
  if (e.configuredPath) {
    const schema = e.configuredPath.schema.value
    const id = 'sha256-' + digest(schema)
    schemas[id] = schema
    needed.add(id)
    e.configuredSchema = id
  }
}
// Intern TypeScript definitions by their resolved reference graph, never by a local $defs name.
// Cyclic nodes retain scope identity; unrelated roots cannot accidentally share a recursive type.
const typeNodes = new Map(),
  fingerprints = new Map(),
  visiting = new Set()
function resolveNode(id, pointer) {
  let node = schemas[id]
  if (pointer)
    for (const part of pointer.slice(1).split('/'))
      node = node[part.replaceAll('~1', '/').replaceAll('~0', '~')]
  return node
}
function schemaWalk(node, visitRef) {
  if (typeof node === 'boolean') return node
  const result = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === '$defs') continue
    if (key === '$ref') result[key] = visitRef(value)
    else if (schemaMaps.has(key))
      result[key] = Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, schemaWalk(v, visitRef)]),
      )
    else if (schemaLists.has(key)) result[key] = value.map((v) => schemaWalk(v, visitRef))
    else if (schemaChildren.has(key)) result[key] = schemaWalk(value, visitRef)
    else if (!annotationKeys.has(key) && key !== '$schema') result[key] = value
  }
  return result
}
function typeName(id, pointer = '') {
  const key = id + '#' + pointer
  if (fingerprints.has(key)) return fingerprints.get(key)
  if (visiting.has(key)) return 'cycle:' + key
  visiting.add(key)
  const node = schemaWalk(transform(resolveNode(id, pointer), 'validation'), (ref) =>
    typeName(id, ref.slice(1)),
  )
  const name =
    'T' + [...digest(node)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('')
  visiting.delete(key)
  fingerprints.set(key, name)
  typeNodes.set(key, { id, pointer, name })
  return name
}
for (const id of [...needed].sort()) {
  typeName(id)
  for (const name of Object.keys(schemas[id].$defs ?? {})) typeName(id, '/$defs/' + name)
}
for (const { id, name, pointer } of ownerNames.values())
  typeName(id, pointer === '' ? '' : '/$defs/' + name)
const definitions = {}
for (const { id, pointer, name } of typeNodes.values()) {
  const node = schemaWalk(
    resolveNode(id, pointer),
    (ref) => '#/$defs/' + typeName(id, ref.slice(1)),
  )
  const typed = transform(node, 'types')
  definitions[name] =
    typeof typed === 'boolean'
      ? { tsType: typed ? 'unknown' : 'never', title: name }
      : { ...typed, title: name }
}
await output(
  'types.ts',
  '/* Generated shared types. Do not edit. */\n' +
    (await compile(
      { type: 'object', additionalProperties: false, $defs: definitions, title: 'TypeGraph' },
      'TypeGraph',
      {
        bannerComment: '',
        unknownAny: true,
        ignoreMinAndMaxItems: true,
        unreachableDefinitions: true,
        format: false,
      },
    )),
)
const exports = {}
for (const id of [...needed].sort()) {
  const name = short(id)
  ajv.addSchema(transform(schemas[id], 'validation'), id)
  exports[name] = id
  await output(
    name + '.ts',
    `/* Generated from ${source.revision}. Do not edit. */\nexport type {${typeName(id)} as Root} from './types'\n` +
      Object.keys(schemas[id].$defs ?? {})
        .map(
          (definition) =>
            `export type {${typeName(id, '/$defs/' + definition)} as ${definition}} from './types'\n`,
        )
        .join(''),
  )
}
let ownerTypes = ''
for (const [name, { id, name: original, pointer }] of [...ownerNames].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  ownerTypes += `export type {${typeName(id, pointer === '' ? '' : '/$defs/' + original)} as ${name}} from './types'\n`
  exports['validate' + name] = pointer === '' ? id : `${id}#/$defs/${original}`
}
await output('owners.ts', ownerTypes)
// Scoped named definitions are available to consumers that also validate editor/demo input.
// Share identical resolved validation graphs, while recursive graphs retain their source scope.
for (const id of [...needed].sort()) {
  let code = `export {default as validateRoot} from './${short(id)}.validator.js'\n`
  for (const name of Object.keys(schemas[id].$defs ?? {}).sort()) {
    const validator = 'v' + typeName(id, '/$defs/' + name).slice(1)
    exports[validator] ??= `${id}#/$defs/${name}`
    code += `export {default as validate${name}} from './${validator}.validator.js'\n`
  }
  await output(short(id) + '.schema.js', code, 'babel')
  await output(short(id) + '.schema.d.ts', `export type * from './${short(id)}'\n` + code)
}
for (const [name, ref] of Object.entries(exports)) {
  const bundled = await build({
    stdin: {
      contents: standaloneCode(ajv, ajv.getSchema(ref)),
      resolveDir: fileURLToPath(root),
      sourcefile: 'validator.js',
    },
    bundle: true,
    write: false,
    minify: true,
    platform: 'browser',
    format: 'esm',
    legalComments: 'none',
  })
  const code = '/* Generated. Do not edit. */\n' + bundled.outputFiles[0].text
  const filename = name + '.validator.js'
  outputFiles.add(filename)
  if (checking) {
    if ((await readFile(new URL(filename, target), 'utf8').catch(() => '')) !== code)
      throw new Error(`Regenerate HTTP validator: ${name}`)
  } else await writeFile(new URL(filename, target), code)
  const type = name.startsWith('validate')
    ? `import('./owners').${name.slice(8)}`
    : name.startsWith('v')
      ? `import('./types').T${name.slice(1)}`
      : `import('./${name}').Root`
  await output(
    name + '.validator.d.ts',
    `declare function validate(value:unknown):value is ${type}\nexport default validate\n`,
  )
}
await output(
  'owner-validators.ts',
  [...ownerNames.keys()]
    .sort()
    .map((name) => `export {default as validate${name}} from './validate${name}.validator.js'`)
    .join('\n'),
)
const errorResponses = new Map()
for (const e of endpoints)
  for (const r of e.responses)
    if (r.status >= 400 && r.body?.content_type === 'application/json')
      errorResponses.set(`${r.status}:${r.body.schema.schemaId}`, {
        status: r.status,
        id: r.body.schema.schemaId,
      })
const errorIds = [...new Set([...errorResponses.values()].map((r) => r.id))].sort()
await output(
  'errors.ts',
  errorIds.map((id) => `import ${short(id)} from './${short(id)}.validator.js'`).join('\n') +
    '\nexport const errorResponses = [' +
    [...errorResponses.values()]
      .map((r) => `{status:${r.status},validate:${short(r.id)}}`)
      .join(',') +
    '] as const\n',
)
// Shared response branches avoid repeating the same mounted failure contracts in every operation.
const responseBranches = new Map()
for (const e of endpoints)
  for (const r of e.responses) responseBranches.set('r' + digest(r).slice(0, 20), r)
const responseValidationIds = [
  ...new Set(
    [...responseBranches.values()].flatMap((r) => [
      ...(r.body ? [r.body.schema.schemaId] : []),
      ...Object.values(r.headers).map((h) => h.schemaId),
    ]),
  ),
].sort()
await output(
  'responses.ts',
  responseValidationIds
    .map((id) => `import ${short(id)} from './${short(id)}.validator.js'`)
    .join('\n') +
    '\n' +
    [...responseBranches]
      .map(
        ([name, r]) =>
          `export const ${name}={status:${r.status},media:${JSON.stringify(r.body?.content_type ?? null)},validate:${r.body ? short(r.body.schema.schemaId) : 'null'},headers:{${Object.entries(
            r.headers,
          )
            .map(([k, v]) => `${JSON.stringify(k)}:${short(v.schemaId)}`)
            .join(',')}}}`,
      )
      .join('\n'),
)
const operationName = (e) =>
  e.method.toLowerCase() +
  e.path
    .replace(/\{([^}]+)\}/g, 'by-$1')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join('')
const browserOwnedHeaders = new Set([
  'cookie',
  'host',
  'origin',
  'sec-fetch-site',
  'content-length',
  'x-csrf-token',
  'x-identity-request',
  'authorization',
  'x-api-key',
])
const headerName = (name) =>
  name
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('-')
const names = new Set()
let index = ''
let schemaIndex = ''
for (const e of endpoints) {
  const name = operationName(e)
  if (names.has(name)) throw new Error(`Duplicate generated operation ${name}`)
  names.add(name)
  const captures = [...e.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1])
  const refs = new Set()
  const validationRefs = new Set()
  const typeOf = (ref) => {
    const key = rootFor(ref)
    refs.add(key)
    return `${key}.Root`
  }
  const validatorOf = (ref) => {
    const key = rootFor(ref)
    validationRefs.add(key)
    return `v_${key}`
  }
  const args = []
  if (captures.length) {
    const schema = e.request.path && schemas[e.request.path.schemaId]
    let types
    if (schema?.prefixItems)
      types = schema.prefixItems.map((s) => (s.type === 'integer' ? 'number' : 'string'))
    else if (schema?.type === 'object')
      types = captures.map((k) => (schema.properties[k]?.type === 'integer' ? 'number' : 'string'))
    else types = captures.map(() => 'string')
    args.push(`pathParams: {${captures.map((c, i) => `${c}: ${types[i] ?? 'string'}`).join(';')}}`)
  }
  if (e.request.query) {
    const optional = ajv.getSchema(e.request.query.schemaId)({})
    args.push(
      `query${optional ? '?' : ''}: WireInput<${typeOf(e.request.query)}>${optional ? ' | undefined' : ''}`,
    )
  }
  if (e.request.body)
    args.push(
      `body: ${e.request.body.content_type === 'application/octet-stream' ? 'ArrayBuffer' : `WireInput<${typeOf(e.request.body.schema)}>`}`,
    )
  const requestHeaders = Object.entries(e.request.headers).filter(
    ([key]) => !browserOwnedHeaders.has(key.toLowerCase()),
  )
  const requiredHeaders = e.request.required_headers.filter(
    (key) => !browserOwnedHeaders.has(key.toLowerCase()),
  )
  if (requestHeaders.length)
    args.push(
      `headers${requiredHeaders.length ? '' : '?'}: {${requestHeaders.map(([key, ref]) => `${JSON.stringify(headerName(key))}${requiredHeaders.includes(key) ? '' : '?'}: ${typeOf(ref)}`).join(';')}}${requiredHeaders.length ? '' : '| undefined'}`,
    )
  args.push('signal?: AbortSignal | undefined', 'timeoutMs?: number | undefined')
  const success = e.responses.filter(
    (r) => r.status < 400 || (e.path === '/readyz' && r.status === 503),
  )
  const binary = success.some(
    (r) =>
      r.body &&
      (!r.body.content_type.startsWith('application/json') || 'content-disposition' in r.headers),
  )
  const returns =
    [
      ...new Set(
        success.map((r) => (!r.body ? 'void' : binary ? 'BinaryResponse' : typeOf(r.body.schema))),
      ),
    ].join(' | ') || 'never'
  const descriptor = {
    operationId: e.operationId,
    method: e.method,
    path: e.path,
    captures,
    pathShape: e.configuredSchema
      ? 'scalar'
      : e.request.path
        ? schemas[e.request.path.schemaId]?.type === 'object'
          ? 'object'
          : captures.length === 1
            ? 'scalar'
            : 'tuple'
        : null,
    queryOwner: e.request.query_owner,
    publicRead: !e.authentication,
    contentType: e.request.body?.content_type ?? null,
    requestHeaders: requestHeaders.map(([key]) => key),
    requiredHeaders,
    binary,
    statuses: [...new Set(success.map((r) => r.status))],
  }
  const responses = e.responses.map((r) => 'r.r' + digest(r).slice(0, 20))
  const headerChecks = Object.entries(e.request.headers)
    .filter(([key]) => descriptor.requestHeaders.includes(key))
    .map(([key, ref]) => `${JSON.stringify(key)}:${validatorOf(ref)}`)
    .join(',')
  let checks = `headers:{${headerChecks}},path: ${e.request.path ? validatorOf(e.request.path) : e.configuredSchema ? (validationRefs.add(short(e.configuredSchema)), `v_${short(e.configuredSchema)}`) : 'null'}, query: ${e.request.query ? validatorOf(e.request.query) : 'null'}, body: ${e.request.body ? validatorOf(e.request.body.schema) : 'null'}`
  const imports = [...refs]
    .sort()
    .map((k) => `import type * as ${k} from './${k}'`)
    .join('\n')
  await output(
    `${name}.ts`,
    `/* Generated. Do not edit. */
    import { defineEndpoint${e.request.query || (e.request.body && e.request.body.content_type !== 'application/octet-stream') ? ', type WireInput' : ''} } from '../../mdm-endpoint'
    ${binary ? "import type { BinaryResponse } from '../../types'" : ''}
    import * as r from './responses'
    ${[...validationRefs]
      .sort()
      .map((key) => `import v_${key} from './${key}.validator.js'`)
      .join('\n')}
    ${imports}
    export type Input = {${args.join(';')}}
    export type Output = ${returns}
    ${e.request.body ? `export type * as Body from './${rootFor(e.request.body.schema)}'` : ''}
    ${success.length === 1 && success[0].body ? `export type * as Response from './${rootFor(success[0].body.schema)}'` : ''}
    export const ${name} = /* @__PURE__ */ defineEndpoint<Input, Output>({
      ...${JSON.stringify(descriptor)}, checks: {${checks}}, responses: [${responses.join(',')}]
    })
  `,
  )
  index += `export { ${name} } from './${name}'\n`
  index += `export type * as ${name}Contract from './${name}'\n`
  if (e.request.query)
    schemaIndex += `export * as ${name}Query from './${rootFor(e.request.query)}.schema.js'\n`
  if (e.request.body)
    schemaIndex += `export * as ${name}Body from './${rootFor(e.request.body.schema)}.schema.js'\n`
  if (success.length === 1 && success[0].body)
    schemaIndex += `export * as ${name}Response from './${rootFor(success[0].body.schema)}.schema.js'\n`
  else
    for (const response of success)
      if (response.body)
        schemaIndex += `export * as ${name}Response${response.status} from './${rootFor(response.body.schema)}.schema.js'\n`
}
await output('index.ts', index)
await output('schemas.ts', schemaIndex)
for (const name of await readdir(target)) {
  if (!outputFiles.has(name)) {
    if (checking) throw new Error(`Obsolete generated contract: ${name}`)
    await rm(new URL(name, target))
  }
}
console.log(
  `${checking ? 'Checked' : 'Generated'} ${endpoints.length} browser operations from ${source.revision}`,
)
