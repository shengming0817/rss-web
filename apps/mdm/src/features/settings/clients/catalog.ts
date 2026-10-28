import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import { array, count, enumeration, nullable, string, unique, uuid } from '../../../services/decode'
import { entryIds } from '../entries'
import { positive, sha256 } from './value'

export type Realm = 'tenant' | 'platform'
export function decodeCatalog(value: unknown, realm: Realm) {
  if (!wireSchemas.getApiV1SettingsCatalogResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    items: unique(
      array(v['items'], (value) => {
        const item = value
        const scope = item['scope']
        if ((scope === 'deployment' || scope === 'platform') !== (realm === 'platform'))
          throw new Error('Wrong settings scope')
        return {
          id: enumeration(item['id'], entryIds),
          scope,
          owner: string(item['owner']),
          custody: item['custody'],
          lifecycle: enumeration(item['lifecycle'], [
            'deployment_maintenance',
            'fixed_installation_identity',
            'fixed_ledger_key',
            'account_credential',
            'protection_key',
            'signing_trust',
            'external_certificate',
            'provider_credential',
            'business_configuration',
            'signed_package',
            'device_generated',
          ] as const),
          status: item['status'],
          revision: nullable(item['revision'], count),
          desiredRevision: nullable(item['desiredRevision'], count),
          appliedRevision: nullable(item['appliedRevision'], count),
          configuredCount: nullable(item['configuredCount'], count),
          reason: nullable(item['reason'], string),
          actions: array(item['actions'], (value) => {
            const a = value
            return { name: string(a['name']), href: apiLocator(a['href']) }
          }),
        }
      }),
      (v) => v.id,
    ),
    domains: unique(
      array(v['domains'], (value) => {
        const d = value
        return { id: string(d['id']), href: apiLocator(d['href']) }
      }),
      (v) => v.id,
    ),
  }
}
function apiLocator(value: unknown) {
  const v = string(value)
  if (!/^\/api\/v1\/[a-zA-Z0-9/_.-]+$/.test(v)) throw new Error('Invalid domain locator')
  return v
}
export type SettingsCatalog = ReturnType<typeof decodeCatalog>
export function decodeReadiness(value: unknown) {
  if (
    !wireSchemas.getReadyzResponse200.validateRoot(value) &&
    !wireSchemas.getReadyzResponse503.validateRoot(value)
  )
    throw new Error('Invalid readiness')
  const v = value
  return {
    ready: v['ready'],
    observation: nullable(v['observation'], (value) => {
      const o = value
      return {
        hostId: uuid(o['hostId']),
        operationId: uuid(o['operationId']),
        revision: positive(o['revision']),
        materialDigest: sha256(o['materialDigest']),
        processGeneration: uuid(o['processGeneration']),
        tenantId: uuid(o['tenantId']),
        instanceId: uuid(o['instanceId']),
      }
    }),
  }
}
export function createSettingsCatalog(
  transport: HttpTransport,
  publicTransport: HttpTransport,
  realm: Realm,
) {
  return {
    read: () =>
      (realm === 'platform'
        ? api.getApiV1TenantAdministrationSettingsCatalog
        : api.getApiV1SettingsCatalog)(transport, {}, (v) => decodeCatalog(v, realm)),
    readiness: () => api.getReadyz(publicTransport, {}, decodeReadiness),
  }
}
