import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  closed,
  count,
  enumeration,
  nullable,
  string,
  unique,
  uuid,
  boolean,
} from '../../../services/decode'
import { entryIds } from '../entries'
import { positive, sha256 } from './value'

export type Realm = 'tenant' | 'platform'
export function decodeCatalog(value: unknown, realm: Realm) {
  const v = closed(value, ['items', 'domains'])
  return {
    items: unique(
      array(v['items'], (value) => {
        const item = closed(value, [
          'id',
          'scope',
          'owner',
          'custody',
          'lifecycle',
          'status',
          'revision',
          'desiredRevision',
          'appliedRevision',
          'configuredCount',
          'reason',
          'actions',
        ])
        const scope = enumeration(item['scope'], [
          'deployment',
          'platform',
          'tenant',
          'device',
        ] as const)
        if ((scope === 'deployment' || scope === 'platform') !== (realm === 'platform'))
          throw new Error('Wrong settings scope')
        return {
          id: enumeration(item['id'], entryIds),
          scope,
          owner: string(item['owner']),
          custody: enumeration(item['custody'], [
            'deployment_operator',
            'identity',
            'domain_service',
            'certificate_authority',
            'storage_provider',
            'device',
          ] as const),
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
          status: enumeration(item['status'], [
            'unknown',
            'unconfigured',
            'configured',
            'loaded',
            'pending',
            'unavailable',
          ] as const),
          revision: nullable(item['revision'], count),
          desiredRevision: nullable(item['desiredRevision'], count),
          appliedRevision: nullable(item['appliedRevision'], count),
          configuredCount: nullable(item['configuredCount'], count),
          reason: nullable(item['reason'], string),
          actions: array(item['actions'], (value) => {
            const a = closed(value, ['name', 'href'])
            return { name: string(a['name']), href: apiLocator(a['href']) }
          }),
        }
      }),
      (v) => v.id,
    ),
    domains: unique(
      array(v['domains'], (value) => {
        const d = closed(value, ['id', 'href'])
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
  const v = closed(value, ['ready', 'observation'])
  return {
    ready: boolean(v['ready']),
    observation: nullable(v['observation'], (value) => {
      const o = closed(value, [
        'hostId',
        'operationId',
        'revision',
        'materialDigest',
        'processGeneration',
        'tenantId',
        'instanceId',
      ])
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
      transport.request({
        method: 'GET',
        path:
          realm === 'platform'
            ? '/api/v1/tenant-administration/settings/catalog'
            : '/api/v1/settings/catalog',
        successStatus: 200,
        decode: (v) => decodeCatalog(v, realm),
      }),
    readiness: () =>
      publicTransport.request({
        method: 'GET',
        path: '/readyz',
        successStatus: 200,
        decode: decodeReadiness,
      }),
  }
}
