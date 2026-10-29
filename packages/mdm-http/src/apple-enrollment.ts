import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { projectedPage, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import {
  type AccountEnrollment,
  type AccountMapping,
  type AdeDevice,
  type AdeProfile,
  type AdeSetup,
  type AdeStatus,
  type AppleEnrollmentPort,
  type OrganizationRow,
  type Page,
  type Query,
  validateSetup,
  setupPanes,
} from '@rss/mdm-enrollment'
import { boolean, count, enumeration, text, uuid } from './decode'
import { attachment } from './download'
function accountEnrollment(value: unknown): AccountEnrollment | null {
  if (!schema.getApiV1AppleOrganizationsByIdAccountEnrollmentResponse.validateRoot(value))
    throw new Error('Invalid account enrollment contract')
  if (value === null) return null
  if (value.externalOrganizationVerification !== 'not_observed')
    throw new Error('Invalid organization evidence')
  uuid(value.serverUuid)
  count(value.revision)
  return value
}
function ade(value: unknown, id?: string): AdeStatus {
  if (!schema.getApiV1AppleOrganizationsResponse.validateAde(value))
    throw new Error('Invalid ADE contract')
  if (
    (id !== undefined && value.organizationId !== id) ||
    value.externalDeviceVerification !== 'not_observed'
  )
    throw new Error('Wrong ADE organization evidence')
  uuid(value.organizationId)
  uuid(value.serverUuid)
  uuid(value.keyId)
  return value
}
function setup(value: unknown): AdeSetup {
  if (!schema.getApiV1AppleOrganizationsByIdAdeProfilesResponse.validateSetup(value))
    throw new Error('Invalid setup contract')
  const result = { ...value, skip: value.skip.map((pane) => enumeration(pane, setupPanes)) }
  validateSetup(result)
  return result
}
function query(value: Query, identity: string, maximum = 1000) {
  if (
    (value.fields && !value.fields.includes(identity)) ||
    (value.limit !== undefined && value.limit > maximum)
  )
    throw new Error('Invalid Apple directory query')
  return queryParameters({ limit: 20, ...value })
}
/** Apple organization control plane; protocol callback and external qualification stay with their owners. */
export function createAppleEnrollmentAdapter(transport: HttpTransport): AppleEnrollmentPort {
  const accountFields = {
      account: text,
      principalId: uuid,
      instanceId: uuid,
      revision: count,
      enabled: boolean,
    },
    profileFields = {
      id: uuid,
      revision: count,
      configuration: setup,
      remoteUuid: (v: unknown) => (v === null ? null : uuid(v)),
    },
    deviceFields = {
      serial: text,
      deleted: boolean,
      profileUuid: (v: unknown) => (v === null ? null : uuid(v)),
      observedAt: count,
      registration: (v: unknown): 'not_implied' => {
        if (v !== 'not_implied') throw new Error('Invalid ADE device evidence')
        return v
      },
    }
  return {
    organizations: (input) =>
      api.getApiV1AppleOrganizations(
        transport,
        { query: query(input, 'id') },
        (value) =>
          projectedPage(
            value,
            { id: uuid, accountEnrollment, ade: (v: unknown) => (v === null ? null : ade(v)) },
            input.fields,
            ['id'],
          ) as Page<OrganizationRow>,
      ),
    accountOrganization: (id) =>
      api.getApiV1AppleOrganizationsByIdAccountEnrollment(
        transport,
        { pathParams: { id: uuid(id) } },
        accountEnrollment,
      ),
    saveAccountOrganization: (id, operationId, body) =>
      api.putApiV1AppleOrganizationsByIdAccountEnrollment(
        transport,
        { pathParams: { id: uuid(id) }, headers: { 'Idempotency-Key': uuid(operationId) }, body },
        (value) => count(value.revision),
      ),
    accounts: (id, input) =>
      api.getApiV1AppleOrganizationsByIdAccountEnrollmentAccounts(
        transport,
        { pathParams: { id: uuid(id) }, query: query(input, 'account') },
        (value) =>
          projectedPage(value, accountFields, input.fields, ['account']) as Page<
            Partial<AccountMapping> & { readonly account: string }
          >,
      ),
    account: (id, name) =>
      api.getApiV1AppleOrganizationsByIdAccountEnrollmentAccountsByAccount(
        transport,
        { pathParams: { id: uuid(id), account: name } },
        (value) => {
          if (value.account !== name) throw new Error('Wrong managed account')
          uuid(value.principalId)
          uuid(value.instanceId)
          count(value.revision)
          return value
        },
      ),
    saveAccount: (id, name, operationId, body) =>
      api.putApiV1AppleOrganizationsByIdAccountEnrollmentAccountsByAccount(
        transport,
        {
          pathParams: { id: uuid(id), account: name },
          headers: { 'Idempotency-Key': uuid(operationId) },
          body,
        },
        (value) => count(value.revision),
      ),
    ade: (id) =>
      api.getApiV1AppleOrganizationsByIdAde(transport, { pathParams: { id: uuid(id) } }, (value) =>
        ade(value, id),
      ),
    configureAde: (id, operationId, body) =>
      api.putApiV1AppleOrganizationsByIdAdeConfiguration(
        transport,
        { pathParams: { id: uuid(id) }, headers: { 'Idempotency-Key': uuid(operationId) }, body },
        (value) => {
          if (
            value.operationId !== operationId ||
            value.state !== 'succeeded' ||
            value.revision !== body.expectedRevision + 1
          )
            throw new Error('Wrong ADE configuration receipt')
          return { operationId, state: 'succeeded', revision: count(value.revision) }
        },
      ),
    adePublicKey: (id) =>
      api.getApiV1AppleOrganizationsByIdAdePublicKey(
        transport,
        { pathParams: { id: uuid(id) } },
        (value) => attachment(value, 'application/x-pem-file', 'RSS-ADE-public.pem', 65536),
      ),
    adeProfiles: (id, input) =>
      api.getApiV1AppleOrganizationsByIdAdeProfiles(
        transport,
        { pathParams: { id: uuid(id) }, query: query(input, 'id') },
        (value) => projectedPage(value, profileFields, input.fields, ['id']) as Page<AdeProfile>,
      ),
    adeDevices: (id, input) =>
      api.getApiV1AppleOrganizationsByIdAdeDevices(
        transport,
        { pathParams: { id: uuid(id) }, query: query(input, 'serial') },
        (value) => projectedPage(value, deviceFields, input.fields, ['serial']) as Page<AdeDevice>,
      ),
    adeCommand: (id, operationId, command) => {
      const body =
        command.kind === 'profile'
          ? {
              ...command,
              configuration: { ...command.configuration, skip: [...command.configuration.skip] },
            }
          : command.kind === 'assign' || command.kind === 'clear'
            ? { ...command, devices: [...command.devices] }
            : command
      return api.postApiV1AppleOrganizationsByIdAdeOperations(
        transport,
        { pathParams: { id: uuid(id) }, headers: { 'Idempotency-Key': uuid(operationId) }, body },
        (value) => {
          if (
            value.operationId !== operationId ||
            (value.state !== 'pending' && value.state !== 'succeeded')
          )
            throw new Error('Wrong ADE operation receipt')
          return { operationId, state: value.state }
        },
      )
    },
    adeOperation: (id, operationId) =>
      api.getApiV1AppleOrganizationsByIdAdeOperationsByOperation(
        transport,
        { pathParams: { id: uuid(id), operation: uuid(operationId) } },
        (value) => {
          if (value.operationId !== operationId) throw new Error('Wrong ADE operation')
          return { ...value, result: value.result === null ? null : { ...value.result } }
        },
      ),
  }
}
