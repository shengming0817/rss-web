import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import { queryParameters, projectedPage, type DirectoryQuery } from '@rss/api/mdm-query'
import { operationReceipt, origin, positive, sha256 } from './value'
import type { HttpTransport } from '@rss/api/mdm'
import { boolean, count, enumeration, nullable, string, uuid } from '../../../services/decode'

export function tenant(value: unknown) {
  if (!wireSchemas.getApiV1TenantAdministrationProvisioningsResponse.validateTenant(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    tenantId: uuid(v['tenantId']),
    management: v['management'],
    initialEpoch: positive(v['initialEpoch']),
    currentEpoch: positive(v['currentEpoch']),
    name: nullable(v['name'], string),
    notes: nullable(v['notes'], string),
    revision: positive(v['revision']),
    deletable: v['deletable'],
  }
}
export type Tenant = ReturnType<typeof tenant>
export function provisioning(value: unknown) {
  if (!wireSchemas.getApiV1TenantAdministrationProvisioningsResponse.validateProvisioning(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    operationId: uuid(v['operationId']),
    tenantId: uuid(v['tenantId']),
    administratorId: nullable(v['administratorId'], uuid),
    hostId: uuid(v['hostId']),
    revision: positive(v['revision']),
    phase: v['phase'],
    blocked: nullable(v['blocked'], (v) => v),
    origin: nullable(v['origin'], origin),
    application: nullable(v['application'], (value) => {
      const a = value
      return {
        requestedRevision: positive(a['requestedRevision']),
        materialDigest: sha256(a['materialDigest']),
        operationId: uuid(a['operationId']),
        observation: nullable(a['observation'], (value) => {
          const o = value
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
  if (!wireSchemas.putApiV1TenantAdministrationTenantsByTenantResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
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
  if (!wireSchemas.putApiV1TenantAdministrationTenantsByTenantResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value,
    operationId = uuid(v['operationId'])
  const action = v['action']
  if (action === 'provision') return provisionReceipt(value)
  if (action === 'administrator_create') {
    const a = v['result']
    if (!wireSchemas.getApiV1TenantAdministrationProvisioningsResponse.validateAdministrator(a))
      throw new Error('Wrong administrator receipt')
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
const tenantFields = {
  tenantId: (value: unknown) => uuid(value),
  management: (value: unknown) => boolean(value),
  initialEpoch: (value: unknown) => positive(value),
  currentEpoch: (value: unknown) => positive(value),
  name: (value: unknown) => nullable(value, string),
  notes: (value: unknown) => nullable(value, string),
  revision: (value: unknown) => positive(value),
  deletable: (value: unknown) => boolean(value),
}
const provisioningFields = {
  operationId: uuid,
  action: (v: unknown) => enumeration(v, ['provision'] as const),
  result: provisioning,
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
    async tenants<F extends keyof typeof tenantFields = keyof typeof tenantFields>(
      query: DirectoryQuery<F> = {},
    ) {
      return api.getApiV1TenantAdministrationTenants(
        transport,
        { query: queryParameters({ limit: 100, ...query }) },
        (value) => {
          return projectedPage(value, tenantFields, query.fields, ['tenantId'])
        },
      )
    },
    async provisionings<
      F extends keyof typeof provisioningFields = keyof typeof provisioningFields,
    >(query: DirectoryQuery<F> = {}) {
      return api.getApiV1TenantAdministrationProvisionings(
        transport,
        { query: queryParameters({ limit: 100, ...query }) },
        (value) => {
          return projectedPage(value, provisioningFields, query.fields, ['operationId'])
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
