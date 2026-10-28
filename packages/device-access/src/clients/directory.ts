import { projectedRow, projectedPage, type DirectoryQuery } from '@rss/api/mdm-query'
import type { DirectoryPage, Application, Binding, Computer, Material } from '../model'
import {
  object,
  closed,
  text,
  count,
  bool,
  uuid,
  choice,
  nullable,
  list,
  same,
} from '../model/decode'
import {
  application,
  nativeAccountLabel,
  nativeBindingObservations,
  nativeBinding,
  nativeComputer,
  nativeMaterial,
} from './native'
const record = (value: unknown) => object(value)
const optionalRecord = (value: unknown) => nullable(value, record)
function account(value: unknown) {
  nativeAccountLabel(value)
  return optionalRecord(value)
}
function effect(value: unknown) {
  nativeBindingObservations(value)
  return optionalRecord(value)
}
function intent(value: unknown) {
  const v = object(value)
  const kind = choice(v['kind'], ['existing', 'create'])
  if (kind === 'existing') {
    closed(v, ['kind', 'account'])
    account(v['account'])
  } else {
    closed(v, ['kind', 'platform', 'name'])
    choice(v['platform'], ['windows', 'macos'])
    text(v['name'], 20)
  }
  return v
}
export const bindingFields = {
  id: uuid,
  revision: count,
  serverState: (v: unknown) => choice(v, ['pending', 'active', 'revoked']),
  principal: uuid,
  policy: uuid,
  bindingGeneration: count,
  operationId: uuid,
  device: text,
  registration: uuid,
  registrationGeneration: count,
  instance: uuid,
  factorGeneration: count,
  accountDisposition: (v: unknown) => choice(v, ['keep', 'disable', 'standard']),
  account,
  accountIntent: intent,
  createdByRss: bool,
  policyVersion: uuid,
  desired: record,
  receivedRevision: (v: unknown) => nullable(v, count),
  appliedRevision: (v: unknown) => nullable(v, count),
  effect,
}
function materialBinding(value: unknown) {
  const v = closed(value, ['device', 'registration', 'generation', 'subject'])
  const subject = object(v['subject'])
  choice(subject['kind'], [
    'rss_login',
    'bitlocker',
    'local_administrator',
    'filevault',
    'recovery_lock',
    'lock_pin',
  ])
  return {
    device: text(v['device']),
    registration: uuid(v['registration']),
    generation: count(v['generation']),
    subject,
  }
}
export const materialFields = {
  id: uuid,
  version: count,
  current: bool,
  validity: (v: unknown) =>
    choice(v, ['unverified', 'verified', 'unknown', 'superseded', 'revoked']),
  escrowed: bool,
  operation: uuid,
  createdAt: count,
  invalidatedAt: (v: unknown) => nullable(v, count),
  binding: materialBinding,
}
function applicationValue(value: unknown) {
  const v = object(value)
  return { ...application(value), targetFingerprint: text(v['targetFingerprint']) }
}
export const applicationFields = {
  id: text,
  kind: (v: unknown) => choice(v, ['relying_party']),
  value: applicationValue,
}
function reference(value: unknown) {
  const v = closed(value, ['kind', 'id'])
  return { kind: choice(v['kind'], ['endpoint', 'association']), id: text(v['id']) }
}
export const computerFields = {
  key: text,
  reference,
  association: optionalRecord,
  endpoints: (v: unknown) =>
    list(v, (value) => {
      nativeComputer(value)
      return object(value)
    }),
}
export const bindingColumns = Object.keys(bindingFields)
export const materialColumns = Object.keys(materialFields)
export const applicationColumns = Object.keys(applicationFields)
export const computerColumns = Object.keys(computerFields)
function directory<C extends Record<string, (value: unknown) => unknown>, T>(
  value: unknown,
  fields: C,
  query: DirectoryQuery,
  normalize: (row: Record<string, unknown>) => T[],
  keys: (keyof C & string)[],
): DirectoryPage<T> {
  const selected = query.fields as (keyof C & string)[] | undefined
  const page = projectedPage(value, fields, selected, keys)
  const complete =
    query.fields === undefined ||
    Object.keys(fields).every((field) => query.fields!.includes(field))
  const items = page.items as Record<string, unknown>[]
  return { ...page, items, summaries: complete ? items.flatMap(normalize) : null }
}
export function bindingDirectory(
  value: unknown,
  device: string,
  query: DirectoryQuery,
): DirectoryPage<Binding> {
  const page = directory(value, bindingFields, query, (row) => [nativeBinding(row, device)], ['id'])
  page.items.forEach((row) => {
    if ('device' in row) same(row['device'], device)
  })
  return page
}
export function materialDirectory(
  value: unknown,
  device: string,
  query: DirectoryQuery,
): DirectoryPage<Material> {
  const page = directory(value, materialFields, query, (row) => [nativeMaterial(row, device)], [
    'id',
    'version',
  ])
  page.items.forEach((row) => {
    if ('binding' in row) same(object(row['binding'])['device'], device)
  })
  return page
}
export function applicationDirectory(
  value: unknown,
  query: DirectoryQuery,
): DirectoryPage<Application> {
  const page = directory(value, applicationFields, query, (row) => [application(row['value'])], [
    'id',
  ])
  page.items.forEach((row) => {
    if ('id' in row && 'value' in row) same(row['id'], 'rp:' + object(row['value'])['id'])
  })
  return page
}
export function computerDirectory(value: unknown, query: DirectoryQuery): DirectoryPage<Computer> {
  const page = directory(
    value,
    computerFields,
    query,
    (row) => list(row['endpoints'], nativeComputer),
    ['key'],
  )
  if (page.summaries)
    page.summaries = [...new Map(page.summaries.map((item) => [item.id, item])).values()]
  return page
}

export function bindingDetail(value: unknown, device: string): Binding {
  const row = projectedRow(value, bindingFields)
  return nativeBinding(row, device)
}
export function materialDetail(value: unknown, device: string): Material {
  const row = projectedRow(value, materialFields)
  return nativeMaterial(row, device)
}
export function applicationDetail(value: unknown, record: string): Application {
  const row = projectedRow(value, applicationFields)
  same(row.id, record)
  same(row.id, 'rp:' + row.value.id)
  return application(row.value)
}
