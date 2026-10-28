import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import {
  queryParameters,
  windowPage,
  nextCursor,
  type DirectoryQuery,
} from '../../../services/directory-query'
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
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
export function appleOrganizations(value: unknown) {
  if (!wireSchemas.getApiV1AppleOrganizationsResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  return windowPage(value, (value) => {
    const v = value,
      id = uuid(v['id'])
    const accountEnrollment = nullable(v['accountEnrollment'], (value) => {
      if (!wireSchemas.getApiV1AppleOrganizationsResponse.validateAccountConfiguration(value))
        throw new Error('Invalid account configuration')
      const a = value
      if (a['externalOrganizationVerification'] !== 'not_observed')
        throw new Error('Invalid verification')
      const d = domain(a['domain'])
      return {
        domain: d,
        serverUuid: uuid(a['serverUuid']),
        signingKey: bounded(a['signingKey'], 128),
        enabled: a['enabled'],
        revision: count(a['revision']),
        signingKeyConfigured: a['signingKeyConfigured'],
        externalOrganizationVerification: 'not_observed' as const,
      }
    })
    return { id, accountEnrollment, ade: nullable(v['ade'], (value) => adeStatus(value, id)) }
  })
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
    organizations: (query: DirectoryQuery = {}) =>
      api.getApiV1AppleOrganizations(
        transport,
        { query: queryParameters({ limit: 100, ...query }) },
        appleOrganizations,
      ),
    accounts: (id: string, query: DirectoryQuery = {}) =>
      api.getApiV1AppleOrganizationsByIdAccountEnrollmentAccounts(
        transport,
        { pathParams: params(id), query: queryParameters({ limit: 100, ...query }) },
        (v) =>
          windowPage(v, (value) => {
            if (
              !wireSchemas.getApiV1AppleOrganizationsByIdAccountEnrollmentAccountsResponse.validateProjection_Account(
                value,
              )
            )
              throw new Error('Invalid contract value')

            const a = value
            return {
              account: account(a['account']),
              principalId: uuid(a['principalId']),
              instanceId: uuid(a['instanceId']),
              revision: count(a['revision']),
              enabled: boolean(a['enabled']),
            }
          }),
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
    profiles: (id: string, query: DirectoryQuery = {}) =>
      api.getApiV1AppleOrganizationsByIdAdeProfiles(
        transport,
        { pathParams: params(id), query: queryParameters({ limit: 100, ...query }) },
        (v) =>
          windowPage(v, (item) => {
            const p = item
            return {
              id: uuid(p['id']),
              revision: count(p['revision']),
              configuration: setup(p['configuration']),
              remoteUuid: nullable(p['remoteUuid'], uuid),
            }
          }),
      ),
    devices: (id: string, query: DirectoryQuery = {}) =>
      api.getApiV1AppleOrganizationsByIdAdeDevices(
        transport,
        { pathParams: params(id), query: queryParameters({ limit: 100, ...query }) },
        (v) => {
          const p = v
          return {
            items: unique(
              array(p['items'], (value) => {
                const d = value
                if (d['registration'] !== 'not_implied') throw new Error('Invented registration')
                return {
                  serial: bounded(d['serial'], 128),
                  deleted: boolean(d['deleted']),
                  profileUuid: nullable(d['profileUuid'], uuid),
                  observedAt: count(d['observedAt']),
                  registration: 'not_implied' as const,
                }
              }),
              (v) => v.serial,
            ),
            nextCursor: nextCursor(p['nextCursor']),
          }
        },
      ),
    bridge: api.getApiV1AppleAccountEnrollmentAuthenticate.url({}),
  }
}
