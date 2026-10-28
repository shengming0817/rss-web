import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import {
  queryParameters,
  projectedPage,
  projectedRow,
  comparison,
  type DirectoryQuery,
} from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  closed,
  record,
  boolean,
  count,
  enumeration,
  identifier,
  nullable,
  unique,
  uuid,
} from '../../../services/decode'
import { attachment } from './binary'
export const setupPanes = [
  'AppleID',
  'Appearance',
  'AppStore',
  'Biometric',
  'Diagnostics',
  'FileVault',
  'EnableLockdownMode',
  'iCloudDiagnostics',
  'iCloudStorage',
  'Location',
  'Payment',
  'Passcode',
  'Privacy',
  'Restore',
  'ScreenTime',
  'Siri',
  'TOS',
  'Welcome',
  'TermsOfAddress',
  'UnlockWithWatch',
  'Accessibility',
  'Intelligence',
] as const
export const adeStates = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'unknown',
  'superseded',
] as const
function bounded(value: unknown, max: number) {
  const v = identifier(value)
  if (new TextEncoder().encode(v).byteLength > max) throw new Error('Invalid size')
  return v
}
function domain(value: unknown) {
  const v = bounded(value, 253)
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(v))
    throw new Error('Invalid domain')
  return v
}
function account(value: unknown) {
  const v = bounded(value, 320)
  if (!/^[^\s@]+@[^\s@]+$/.test(v)) throw new Error('Invalid account')
  domain(v.split('@')[1])
  return v
}
export function adeStatus(value: unknown, id: string) {
  if (!wireSchemas.getApiV1AppleOrganizationsResponse.validateAde(value))
    throw new Error('Invalid contract value')

  const v = value
  if (uuid(v['organizationId']) !== id || v['externalDeviceVerification'] !== 'not_observed')
    throw new Error('Wrong organization')
  return {
    organizationId: id,
    revision: count(v['revision']),
    enabled: v['enabled'],
    serverUuid: uuid(v['serverUuid']),
    orgId: bounded(v['orgId'], 256),
    keyId: uuid(v['keyId']),
    tokenRevision: count(v['tokenRevision']),
    tokenExpiresAt: nullable(v['tokenExpiresAt'], count),
    tokenState: v['tokenState'],
    syncedAt: nullable(v['syncedAt'], count),
    externalDeviceVerification: 'not_observed' as const,
  }
}
function accountEnrollment(value: unknown) {
  return nullable(value, (value) => {
    const a = closed(value, [
      'domain',
      'serverUuid',
      'signingKey',
      'enabled',
      'revision',
      'signingKeyConfigured',
      'externalOrganizationVerification',
    ])
    if (a['externalOrganizationVerification'] !== 'not_observed')
      throw new Error('Invalid verification')
    const d = domain(a['domain'])
    return {
      domain: d,
      serverUuid: uuid(a['serverUuid']),
      signingKey: bounded(a['signingKey'], 128),
      enabled: boolean(a['enabled']),
      revision: count(a['revision']),
      signingKeyConfigured: boolean(a['signingKeyConfigured']),
      externalOrganizationVerification: 'not_observed' as const,
    }
  })
}
const organizationFields = {
  id: uuid,
  accountEnrollment,
  ade: (value: unknown) =>
    nullable(value, (v) => {
      const r = record(v)
      return adeStatus(v, uuid(r['organizationId']))
    }),
}
const accountFields = {
  account,
  principalId: uuid,
  instanceId: uuid,
  revision: count,
  enabled: boolean,
}
const profileFields = {
  id: uuid,
  revision: count,
  configuration: setup,
  remoteUuid: (v: unknown) => nullable(v, uuid),
}
const deviceFields = {
  serial: (v: unknown) => bounded(v, 128),
  deleted: boolean,
  profileUuid: (v: unknown) => nullable(v, uuid),
  observedAt: count,
  registration: (v: unknown) => enumeration(v, ['not_implied'] as const),
}
export function appleOrganizations(value: unknown) {
  return projectedPage(value, organizationFields, undefined, ['id'])
}

export function setup(value: unknown) {
  if (!wireSchemas.getApiV1AppleOrganizationsByIdAdeProfilesResponse.validateSetup(value))
    throw new Error('Invalid contract value')

  const v = value,
    mandatory = v['mandatory'],
    removable = v['removable']
  if (!mandatory && !removable) throw new Error('Locked profile must be mandatory')
  return {
    name: bounded(v['name'], 128),
    mandatory,
    removable,
    skip: unique(
      array(v['skip'], (v) => enumeration(v, setupPanes)),
      (v) => v,
    ),
  }
}

function operationResult(value: unknown) {
  if (
    !wireSchemas.getApiV1AppleOrganizationsByIdAdeOperationsByOperationResponse.validateOperationResult(
      value,
    )
  )
    throw new Error('Invalid operation result')
  return { ...value }
}
export function adeOperation(value: unknown, id: string) {
  if (
    !wireSchemas.getApiV1AppleOrganizationsByIdAdeOperationsByOperationResponse.validateRoot(value)
  )
    throw new Error('Invalid contract value')

  const v = value
  if (uuid(v['operationId']) !== id) throw new Error('Wrong operation')
  return {
    operationId: id,
    kind: v['kind'],
    state: v['state'],
    result: nullable(v['result'], operationResult),
  }
}
export interface AccountOrganization {
  expectedRevision: number
  domain: string
  serverUuid: string
  signingKey: string
  enabled: boolean
}
export interface AccountMapping {
  expectedRevision: number
  principalId: string
  instanceId: string
  enabled: boolean
}
export interface AdeConfiguration {
  expectedRevision: number
  enabled: boolean
  serverUuid: string
  orgId: string
  rotateKey: boolean
}
export type AdeCommand =
  | { kind: 'token'; expectedRevision: number; p7m: string }
  | { kind: 'sync'; full: boolean }
  | {
      kind: 'profile'
      id: string
      expectedRevision: number
      configuration: ReturnType<typeof setup>
    }
  | { kind: 'assign'; profile: string; revision: number; devices: string[] }
  | { kind: 'clear'; devices: string[] }
  | { kind: 'reconcile'; operation: string }
  | { kind: 'resolve'; operation: string; remoteProfile: string }
export function createAppleClient(transport: HttpTransport) {
  const params = (id: string) => ({ id: uuid(id) })
  function revision(value: unknown, expected: number) {
    if (!wireSchemas.putApiV1AppleOrganizationsByIdAccountEnrollmentResponse.validateRoot(value))
      throw new Error('Invalid contract value')

    const v = value,
      result = count(v['revision'])
    if (result !== expected + 1) throw new Error('Wrong revision')
    return result
  }
  return {
    organizations: <F extends keyof typeof organizationFields = keyof typeof organizationFields>(
      query: DirectoryQuery<F> = {},
    ) =>
      api.getApiV1AppleOrganizations(
        transport,
        { query: queryParameters({ limit: 100, ...query }) },
        (v) => projectedPage(v, organizationFields, query.fields, ['id']),
      ),
    accounts: <F extends keyof typeof accountFields = keyof typeof accountFields>(
      id: string,
      query: DirectoryQuery<F> = {},
    ) =>
      api.getApiV1AppleOrganizationsByIdAccountEnrollmentAccounts(
        transport,
        { pathParams: params(id), query: queryParameters({ limit: 100, ...query }) },
        (v) => projectedPage(v, accountFields, query.fields, ['account']),
      ),
    accountConfiguration: (id: string) =>
      api.getApiV1AppleOrganizationsByIdAccountEnrollment(
        transport,
        { pathParams: params(id) },
        (value) => {
          const result = accountEnrollment(value)
          if (!result) throw new Error('Missing organization')
          return result
        },
      ),
    account: (id: string, name: string) =>
      api.getApiV1AppleOrganizationsByIdAccountEnrollmentAccountsByAccount(
        transport,
        { pathParams: { ...params(id), account: account(name) } },
        (value) => {
          const row = projectedRow(value, accountFields)
          if (row.account !== name) throw new Error('Wrong account')
          return row
        },
      ),
    profile: (id: string, profile: string) =>
      api.getApiV1AppleOrganizationsByIdAdeProfiles(
        transport,
        {
          pathParams: params(id),
          query: queryParameters({ filter: comparison('id', '==', uuid(profile)), limit: 1 }),
        },
        (value) => {
          const page = projectedPage(value, profileFields)
          const row = page.items[0]
          if (!row || row.id !== profile || page.nextCursor) throw new Error('Wrong profile')
          return row
        },
      ),
    accountOrganization: (id: string, operation: string, body: AccountOrganization) =>
      api.putApiV1AppleOrganizationsByIdAccountEnrollment(
        transport,
        { pathParams: params(id), headers: { 'Idempotency-Key': uuid(operation) }, body },
        (v) => revision(v, body.expectedRevision),
      ),
    accountMapping: (id: string, name: string, operation: string, body: AccountMapping) =>
      api.putApiV1AppleOrganizationsByIdAccountEnrollmentAccountsByAccount(
        transport,
        {
          pathParams: { ...params(id), account: account(name) },
          headers: { 'Idempotency-Key': uuid(operation) },
          body,
        },
        (v) => revision(v, body.expectedRevision),
      ),
    ade: (id: string) =>
      api.getApiV1AppleOrganizationsByIdAde(transport, { pathParams: params(id) }, (v) =>
        adeStatus(v, id),
      ),
    configure: (id: string, operation: string, body: AdeConfiguration) =>
      api.putApiV1AppleOrganizationsByIdAdeConfiguration(
        transport,
        { pathParams: params(id), headers: { 'Idempotency-Key': uuid(operation) }, body },
        (v) => {
          const raw = v
          if (
            uuid(raw['operationId']) !== operation ||
            raw['state'] !== 'succeeded' ||
            count(raw['revision']) !== body.expectedRevision + 1
          )
            throw new Error('Wrong configuration receipt')
          return {
            operationId: operation,
            state: 'succeeded' as const,
            revision: count(raw['revision']),
          }
        },
      ),
    publicKey: (id: string) =>
      api.getApiV1AppleOrganizationsByIdAdePublicKey(transport, { pathParams: params(id) }, (v) =>
        attachment(v, 'application/x-pem-file', 'RSS-ADE-public.pem', 65_536),
      ),
    command: (id: string, operation: string, body: AdeCommand) =>
      api.postApiV1AppleOrganizationsByIdAdeOperations(
        transport,
        { pathParams: params(id), headers: { 'Idempotency-Key': uuid(operation) }, body },
        (v) => {
          const raw = v
          if (uuid(raw['operationId']) !== operation) throw new Error('Wrong operation receipt')
          return {
            operationId: operation,
            state: enumeration(raw['state'], ['pending', 'succeeded'] as const),
          }
        },
      ),
    operation: (id: string, operation: string) =>
      api.getApiV1AppleOrganizationsByIdAdeOperationsByOperation(
        transport,
        { pathParams: { ...params(id), operation: uuid(operation) } },
        (v) => adeOperation(v, operation),
      ),
    profiles: <F extends keyof typeof profileFields = keyof typeof profileFields>(
      id: string,
      query: DirectoryQuery<F> = {},
    ) =>
      api.getApiV1AppleOrganizationsByIdAdeProfiles(
        transport,
        { pathParams: params(id), query: queryParameters({ limit: 100, ...query }) },
        (v) => projectedPage(v, profileFields, query.fields, ['id']),
      ),
    devices: <F extends keyof typeof deviceFields = keyof typeof deviceFields>(
      id: string,
      query: DirectoryQuery<F> = {},
    ) =>
      api.getApiV1AppleOrganizationsByIdAdeDevices(
        transport,
        { pathParams: params(id), query: queryParameters({ limit: 50, ...query }) },
        (value) => projectedPage(value, deviceFields, query.fields, ['serial']),
      ),
    bridge: '/api/v1/apple/account-enrollment/authenticate',
  }
}
