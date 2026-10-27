import * as api from '@rss/api/mdm-operations'
import { queryParameters, windowPage, type DirectoryQuery } from '../../../services/directory-query'
import { operationReceipt, origin, positive, sha256 } from './value'
import type { HttpTransport } from '@rss/api/mdm'
import {
  boolean,
  closed,
  count,
  enumeration,
  nullable,
  string,
  uuid,
} from '../../../services/decode'

export function tenant(value: unknown) {
  const v = closed(value, [
    'tenantId',
    'management',
    'initialEpoch',
    'currentEpoch',
    'name',
    'notes',
    'revision',
    'deletable',
  ])
  return {
    tenantId: uuid(v['tenantId']),
    management: boolean(v['management']),
    initialEpoch: positive(v['initialEpoch']),
    currentEpoch: positive(v['currentEpoch']),
    name: nullable(v['name'], string),
    notes: nullable(v['notes'], string),
    revision: positive(v['revision']),
    deletable: boolean(v['deletable']),
  }
}
export type Tenant = ReturnType<typeof tenant>
export function provisioning(value: unknown) {
  const v = closed(value, [
    'operationId',
    'tenantId',
    'administratorId',
    'hostId',
    'revision',
    'phase',
    'blocked',
    'origin',
    'application',
  ])
  return {
    operationId: uuid(v['operationId']),
    tenantId: uuid(v['tenantId']),
    administratorId: nullable(v['administratorId'], uuid),
    hostId: uuid(v['hostId']),
    revision: positive(v['revision']),
    phase: enumeration(v['phase'], [
      'reserved',
      'database_ready',
      'accounts_ready',
      'host_pending',
      'enabled',
    ] as const),
    blocked: nullable(v['blocked'], (v) =>
      enumeration(v, [
        'capacity',
        'database',
        'authentication',
        'authorization',
        'host_unavailable',
        'material_missing',
        'material_expired',
        'material_revoked',
        'external_authorization',
        'outcome_unknown',
      ] as const),
    ),
    origin: nullable(v['origin'], origin),
    application: nullable(v['application'], (value) => {
      const a = closed(value, ['requestedRevision', 'materialDigest', 'operationId', 'observation'])
      return {
        requestedRevision: positive(a['requestedRevision']),
        materialDigest: sha256(a['materialDigest']),
        operationId: uuid(a['operationId']),
        observation: nullable(a['observation'], (value) => {
          const o = closed(value, [
            'hostId',
            'processGeneration',
            'appliedRevision',
            'materialDigest',
            'observedAt',
            'failure',
          ])
          return {
            hostId: uuid(o['hostId']),
            processGeneration: uuid(o['processGeneration']),
            appliedRevision: positive(o['appliedRevision']),
            materialDigest: sha256(o['materialDigest']),
            observedAt: count(o['observedAt']),
            failure: nullable(o['failure'], string),
          }
        }),
      }
    }),
  }
}
export type Provisioning = ReturnType<typeof provisioning>
export function provisionReceipt(value: unknown) {
  const v = closed(value, ['operationId', 'action', 'result'])
  if (v['action'] !== 'provision') throw new Error('Wrong provisioning receipt')
  const result = provisioning(v['result']),
    operationId = uuid(v['operationId'])
  if (operationId !== result.operationId) throw new Error('Wrong operation binding')
  return { operationId, action: 'provision' as const, result }
}
export interface ProvisionInput {
  name: string
  administratorLogin: string
  administratorPassword: string
}
export function registryReceipt(value: unknown) {
  const v = closed(value, ['operationId', 'action', 'result']),
    operationId = uuid(v['operationId'])
  const action = enumeration(v['action'], [
    'create',
    'update',
    'delete',
    'administrator_create',
    'provision',
  ] as const)
  if (action === 'provision') return provisionReceipt(value)
  if (action === 'administrator_create') {
    const a = closed(v['result'], ['tenantId', 'principalId', 'login', 'ruleId', 'ruleRevision'])
    return {
      operationId,
      action,
      result: {
        tenantId: uuid(a['tenantId']),
        principalId: uuid(a['principalId']),
        login: string(a['login']),
        ruleId: uuid(a['ruleId']),
        ruleRevision: positive(a['ruleRevision']),
      },
    }
  }
  return { operationId, action, result: tenant(v['result']) }
}
export function createPlatformClient(transport: HttpTransport) {
  return {
    registryOperation(id: string) {
      return api.getApiV1TenantAdministrationOperationsByOperation(
        transport,
        { pathParams: { operation: uuid(id) } },
        (value) => {
          const r = registryReceipt(value)
          if (r.operationId !== id) throw new Error('Wrong operation')
          return r
        },
      )
    },
    administrator(tenantId: string, id: string, body: { login: string; password: string }) {
      return api.postApiV1TenantAdministrationTenantsByTenantAdministrators(
        transport,
        { pathParams: { tenant: uuid(tenantId) }, headers: { 'Idempotency-Key': uuid(id) }, body },
        (value) => {
          const r = registryReceipt(value)
          if (
            r.operationId !== id ||
            r.action !== 'administrator_create' ||
            r.result.tenantId !== tenantId
          )
            throw new Error('Wrong administrator receipt')
          return r
        },
      )
    },
    remove(tenantId: string, id: string, expectedRevision: number) {
      return api.deleteApiV1TenantAdministrationTenantsByTenant(
        transport,
        {
          pathParams: { tenant: uuid(tenantId) },
          headers: { 'Idempotency-Key': uuid(id) },
          body: { expectedRevision },
        },
        (value) => {
          const r = registryReceipt(value)
          if (r.operationId !== id || r.action !== 'delete' || r.result.tenantId !== tenantId)
            throw new Error('Wrong deletion receipt')
          return r
        },
      )
    },
    tenant(id: string) {
      return api.getApiV1TenantAdministrationTenantsByTenant(
        transport,
        { pathParams: { tenant: uuid(id) } },
        (value) => {
          const row = tenant(value)
          if (row.tenantId !== id) throw new Error('Wrong tenant')
          return row
        },
      )
    },
    async tenants(query: DirectoryQuery = {}) {
      return api.getApiV1TenantAdministrationTenants(
        transport,
        { query: queryParameters({ limit: 100, ...query }) },
        (value) => {
          return windowPage(value, tenant)
        },
      )
    },
    async provisionings(query: DirectoryQuery = {}) {
      return api.getApiV1TenantAdministrationProvisionings(
        transport,
        { query: queryParameters({ limit: 100, ...query }) },
        (value) => {
          return windowPage(value, provisionReceipt)
        },
      )
    },
    operation(id: string) {
      return api.getApiV1TenantAdministrationProvisioningsByOperation(
        transport,
        { pathParams: { operation: uuid(id) } },
        operationReceipt(id, provisionReceipt),
      )
    },
    provision(id: string, input: ProvisionInput) {
      return api.postApiV1TenantAdministrationProvisionings(
        transport,
        { headers: { 'Idempotency-Key': uuid(id) }, body: input },
        (value) => {
          const receipt = provisionReceipt(value)
          if (receipt.operationId !== id) throw new Error('Wrong operation')
          return receipt
        },
      )
    },
    update(
      id: string,
      operationId: string,
      expectedRevision: number,
      input: { name: string | null; notes: string | null },
    ) {
      return api.putApiV1TenantAdministrationTenantsByTenant(
        transport,
        {
          pathParams: { tenant: uuid(id) },
          headers: { 'Idempotency-Key': uuid(operationId) },
          body: { expectedRevision, ...input },
        },
        (value) => {
          const v = value
          if (v['operationId'] !== operationId || v['action'] !== 'update')
            throw new Error('Wrong receipt')
          const result = tenant(v['result'])
          if (result.tenantId !== id) throw new Error('Wrong tenant')
          return result
        },
      )
    },
  }
}
