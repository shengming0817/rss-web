import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  record,
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
  const v = closed(value, [
    'organizationId',
    'revision',
    'enabled',
    'serverUuid',
    'orgId',
    'keyId',
    'tokenRevision',
    'tokenExpiresAt',
    'tokenState',
    'syncedAt',
    'externalDeviceVerification',
  ])
  if (uuid(v['organizationId']) !== id || v['externalDeviceVerification'] !== 'not_observed')
    throw new Error('Wrong organization')
  return {
    organizationId: id,
    revision: count(v['revision']),
    enabled: boolean(v['enabled']),
    serverUuid: uuid(v['serverUuid']),
    orgId: bounded(v['orgId'], 256),
    keyId: uuid(v['keyId']),
    tokenRevision: count(v['tokenRevision']),
    tokenExpiresAt: nullable(v['tokenExpiresAt'], count),
    tokenState: enumeration(v['tokenState'], [
      'missing',
      'expired',
      'invalid',
      'verified',
      'unverified',
    ] as const),
    syncedAt: nullable(v['syncedAt'], count),
    externalDeviceVerification: 'not_observed' as const,
  }
}
export function appleOrganizations(value: unknown) {
  return unique(
    array(closed(value, ['items'])['items'], (value) => {
      const v = closed(value, ['id', 'accountEnrollment', 'ade']),
        id = uuid(v['id'])
      const accountEnrollment = nullable(v['accountEnrollment'], (value) => {
        const a = closed(value, [
          'domain',
          'serverUuid',
          'signingKey',
          'enabled',
          'revision',
          'signingKeyConfigured',
          'accounts',
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
          accounts: unique(
            array(a['accounts'], (value) => {
              const b = closed(value, [
                  'account',
                  'principalId',
                  'instanceId',
                  'revision',
                  'enabled',
                ]),
                name = account(b['account'])
              if (name.split('@')[1] !== d) throw new Error('Wrong organization domain')
              return {
                account: name,
                principalId: uuid(b['principalId']),
                instanceId: uuid(b['instanceId']),
                revision: count(b['revision']),
                enabled: boolean(b['enabled']),
              }
            }),
            (v) => v.account,
          ),
        }
      })
      return { id, accountEnrollment, ade: nullable(v['ade'], (value) => adeStatus(value, id)) }
    }),
    (v) => v.id,
  )
}
export function setup(value: unknown) {
  const v = closed(value, ['name', 'mandatory', 'removable', 'skip']),
    mandatory = boolean(v['mandatory']),
    removable = boolean(v['removable'])
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
const reasons = [
  'interrupted_external_effect',
  'authority_changed',
  'cursor_reset',
  'token_invalid',
  'throttled',
  'external_outcome_unknown',
  'invalid_response',
  'invalid_cursor',
  'invalid_page',
  'missing_profile_receipt',
  'profile_changed',
  'missing_device_observation',
  'incomplete_device_observation',
  'invalid_device_observation',
  'effect_confirmed',
  'effect_not_confirmed',
  'profile_mismatch',
  'cursor_no_progress',
] as const
function operationResult(value: unknown): Record<string, unknown> {
  const v = record(value),
    keys = Object.keys(v).sort().join()
  if (keys === 'reason') return { reason: enumeration(v['reason'], reasons) }
  if (keys === 'remoteProfile' || keys === 'recoveredBy,remoteProfile')
    return {
      remoteProfile: uuid(v['remoteProfile']),
      ...(v['recoveredBy'] === undefined ? {} : { recoveredBy: uuid(v['recoveredBy']) }),
    }
  if (keys === 'reason,recoveredBy,registration') {
    if (v['registration'] !== 'not_implied') throw new Error('Invented registration')
    return {
      reason: enumeration(v['reason'], ['effect_confirmed', 'effect_not_confirmed'] as const),
      recoveredBy: uuid(v['recoveredBy']),
      registration: 'not_implied',
    }
  }
  if (keys === 'moreToFollow,pageDevices,registration') {
    if (v['registration'] !== 'not_implied') throw new Error('Invented registration')
    return {
      moreToFollow: boolean(v['moreToFollow']),
      pageDevices: count(v['pageDevices']),
      registration: 'not_implied',
    }
  }
  if (keys === 'devices,registration,retryAfterSeconds') {
    if (v['registration'] !== 'not_implied') throw new Error('Invented registration')
    const devices = Object.entries(record(v['devices']))
    if (devices.length > 1000) throw new Error('Too many outcomes')
    return {
      devices: Object.fromEntries(
        devices.map(([serial, outcome]) => [
          bounded(serial, 128),
          enumeration(outcome, [
            'SUCCESS',
            'FAILED',
            'UNKNOWN',
            'THROTTLED',
            'NOT_ACCESSIBLE',
          ] as const),
        ]),
      ),
      retryAfterSeconds: nullable(v['retryAfterSeconds'], count),
      registration: 'not_implied',
    }
  }
  if (keys === 'operationId,state' || keys === 'operationId,revision,state')
    return {
      operationId: uuid(v['operationId']),
      state: enumeration(v['state'], ['pending', 'succeeded'] as const),
      ...(v['revision'] === undefined ? {} : { revision: count(v['revision']) }),
    }
  throw new Error('Invalid ADE result')
}
export function adeOperation(value: unknown, id: string) {
  const v = closed(value, ['operationId', 'kind', 'state', 'result'])
  if (uuid(v['operationId']) !== id) throw new Error('Wrong operation')
  return {
    operationId: id,
    kind: enumeration(v['kind'], [
      'configuration',
      'token',
      'sync',
      'profile',
      'assign',
      'clear',
      'reconcile',
      'resolve',
    ] as const),
    state: enumeration(v['state'], adeStates),
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
    const v = closed(value, ['revision']),
      result = count(v['revision'])
    if (result !== expected + 1) throw new Error('Wrong revision')
    return result
  }
  return {
    organizations: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/apple/organizations',
        successStatus: 200,
        decode: appleOrganizations,
      }),
    accountOrganization: (id: string, operation: string, body: AccountOrganization) =>
      transport.request({
        method: 'PUT',
        path: '/api/v1/apple/organizations/{id}/account-enrollment',
        pathParams: params(id),
        headers: { 'Idempotency-Key': uuid(operation) },
        body,
        successStatus: 200,
        decode: (v) => revision(v, body.expectedRevision),
      }),
    accountMapping: (id: string, name: string, operation: string, body: AccountMapping) =>
      transport.request({
        method: 'PUT',
        path: '/api/v1/apple/organizations/{id}/account-enrollment/accounts/{account}',
        pathParams: { ...params(id), account: account(name) },
        headers: { 'Idempotency-Key': uuid(operation) },
        body,
        successStatus: 200,
        decode: (v) => revision(v, body.expectedRevision),
      }),
    ade: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/apple/organizations/{id}/ade',
        pathParams: params(id),
        successStatus: 200,
        decode: (v) => adeStatus(v, id),
      }),
    configure: (id: string, operation: string, body: AdeConfiguration) =>
      transport.request({
        method: 'PUT',
        path: '/api/v1/apple/organizations/{id}/ade/configuration',
        pathParams: params(id),
        headers: { 'Idempotency-Key': uuid(operation) },
        body,
        successStatus: 200,
        decode: (v) => {
          const raw = closed(v, ['operationId', 'state', 'revision'])
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
      }),
    publicKey: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/apple/organizations/{id}/ade/public-key',
        pathParams: params(id),
        responseType: 'arraybuffer',
        successStatus: 200,
        decode: (v) => attachment(v, 'application/x-pem-file', 'RSS-ADE-public.pem', 65_536),
      }),
    command: (id: string, operation: string, body: AdeCommand) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/apple/organizations/{id}/ade/operations',
        pathParams: params(id),
        headers: { 'Idempotency-Key': uuid(operation) },
        body,
        successStatus: 200,
        decode: (v) => {
          const raw = closed(v, ['operationId', 'state'])
          if (uuid(raw['operationId']) !== operation) throw new Error('Wrong operation receipt')
          return {
            operationId: operation,
            state: enumeration(raw['state'], ['pending', 'succeeded'] as const),
          }
        },
      }),
    operation: (id: string, operation: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/apple/organizations/{id}/ade/operations/{operation}',
        pathParams: { ...params(id), operation: uuid(operation) },
        successStatus: 200,
        decode: (v) => adeOperation(v, operation),
      }),
    profiles: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/apple/organizations/{id}/ade/profiles',
        pathParams: params(id),
        successStatus: 200,
        decode: (v) =>
          unique(
            array(closed(v, ['items'])['items'], (item) => {
              const p = closed(item, ['id', 'revision', 'configuration', 'remoteUuid'])
              return {
                id: uuid(p['id']),
                revision: count(p['revision']),
                configuration: setup(p['configuration']),
                remoteUuid: nullable(p['remoteUuid'], uuid),
              }
            }),
            (v) => v.id,
          ),
      }),
    devices: (id: string, after?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/apple/organizations/{id}/ade/devices',
        pathParams: params(id),
        query: { after },
        successStatus: 200,
        decode: (v) => {
          const p = closed(v, ['items', 'nextCursor'])
          return {
            items: unique(
              array(p['items'], (value) => {
                const d = closed(value, [
                  'serial',
                  'deleted',
                  'profileUuid',
                  'observedAt',
                  'registration',
                ])
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
            nextCursor: nullable(p['nextCursor'], (v) => bounded(v, 128)),
          }
        },
      }),
    bridge: '/api/v1/apple/account-enrollment/authenticate',
  }
}
