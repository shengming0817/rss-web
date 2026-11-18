import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { queryParameters, projectedPage } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import {
  confirmOperation,
  provisioningEntry,
  type TenantAdministrationPort,
  type Tenant,
  type Provisioning,
  type Receipt,
  type ProvisionReceipt,
} from '@rss/mdm-tenant-administration'
import { uuid, text, positive, boolean, nullable, enumeration } from './decode'
function tenant(value: unknown): Tenant {
  if (!schema.getApiV1TenantAdministrationProvisioningsResponse.validateTenant(value))
    throw new Error('Invalid tenant contract')
  uuid(value.tenantId)
  positive(value.revision)
  return value
}
function provisioning(value: unknown): Provisioning {
  if (!schema.getApiV1TenantAdministrationProvisioningsResponse.validateProgress(value))
    throw new Error('Invalid provisioning contract')
  uuid(value.tenantId)
  if (value.administratorId !== null) uuid(value.administratorId)
  provisioningEntry(value)
  return value
}
function receipt(value: unknown): Receipt {
  if (!schema.putApiV1TenantAdministrationTenantsByTenantResponse.validateRoot(value))
    throw new Error('Invalid tenant receipt contract')
  const operationId = uuid(value.operationId)
  if (value.action === 'provision') {
    const result = provisioning(value.result)
    return { operationId, action: 'provision', result }
  }
  if (value.action === 'administrator_create') {
    if (
      !schema.getApiV1TenantAdministrationProvisioningsResponse.validateAdministrator(value.result)
    )
      throw new Error('Invalid administrator receipt')
    uuid(value.result.tenantId)
    uuid(value.result.principalId)
    uuid(value.result.ruleId)
    positive(value.result.ruleRevision)
    return { operationId, action: value.action, result: value.result }
  }
  return { operationId, action: value.action, result: tenant(value.result) }
}
function provisionReceipt(value: unknown, operationId: string): ProvisionReceipt {
  const result = receipt(value)
  if (result.action !== 'provision' || result.operationId !== operationId)
    throw new Error('Wrong provisioning operation')
  return result
}
const tenantFields = {
  tenantId: uuid,
  management: boolean,
  name: (v: unknown) => nullable(v, text),
  notes: (v: unknown) => nullable(v, text),
  revision: positive,
  deletable: boolean,
}
const provisioningFields = {
  operationId: uuid,
  action: (v: unknown) => enumeration(v, ['provision'] as const),
  result: provisioning,
}
export function createTenantAdministrationAdapter(
  transport: HttpTransport,
): TenantAdministrationPort {
  return {
    tenants: (query = {}) =>
      api.getApiV1TenantAdministrationTenants(transport, { query: queryParameters(query) }, (v) =>
        projectedPage(v, tenantFields, query.fields, ['tenantId']),
      ),
    tenant: (id) =>
      api.getApiV1TenantAdministrationTenantsByTenant(
        transport,
        { pathParams: { tenant: uuid(id) } },
        (v) => {
          const result = tenant(v)
          if (result.tenantId !== id) throw new Error('Wrong tenant detail')
          return result
        },
      ),
    provisionings: (query = {}) =>
      api.getApiV1TenantAdministrationProvisionings(
        transport,
        { query: queryParameters(query) },
        (v) => projectedPage(v, provisioningFields, query.fields, ['operationId']),
      ),
    provisioning: (id) =>
      api.getApiV1TenantAdministrationProvisioningsByOperation(
        transport,
        { pathParams: { operation: uuid(id) } },
        (v) => provisionReceipt(v, id),
      ),
    provision: (id, input) =>
      api.postApiV1TenantAdministrationProvisionings(
        transport,
        { headers: { 'Idempotency-Key': uuid(id) }, body: input },
        (v) => provisionReceipt(v, id),
      ),
    operation: (id) =>
      api.getApiV1TenantAdministrationOperationsByOperation(
        transport,
        { pathParams: { operation: uuid(id) } },
        (v) => {
          const result = receipt(v)
          if (result.operationId !== id) throw new Error('Wrong tenant operation')
          return result
        },
      ),
    update: (input) =>
      api.putApiV1TenantAdministrationTenantsByTenant(
        transport,
        {
          pathParams: { tenant: uuid(input.tenantId) },
          headers: { 'Idempotency-Key': uuid(input.operationId) },
          body: { expectedRevision: input.expectedRevision, name: input.name, notes: input.notes },
        },
        (v) => {
          const result = confirmOperation(receipt(v), input.operationId, 'update', input.tenantId)
          if (result.action !== 'update' || result.result.revision !== input.expectedRevision + 1)
            throw new Error('Wrong tenant revision')
          return result
        },
      ),
    remove: (tenantId, operationId, expectedRevision) =>
      api.deleteApiV1TenantAdministrationTenantsByTenant(
        transport,
        {
          pathParams: { tenant: uuid(tenantId) },
          headers: { 'Idempotency-Key': uuid(operationId) },
          body: { expectedRevision },
        },
        (v) => confirmOperation(receipt(v), operationId, 'delete', tenantId),
      ),
    administrator: (tenantId, operationId, input) =>
      api.postApiV1TenantAdministrationTenantsByTenantAdministrators(
        transport,
        {
          pathParams: { tenant: uuid(tenantId) },
          headers: { 'Idempotency-Key': uuid(operationId) },
          body: input,
        },
        (v) => confirmOperation(receipt(v), operationId, 'administrator_create', tenantId),
      ),
  }
}
