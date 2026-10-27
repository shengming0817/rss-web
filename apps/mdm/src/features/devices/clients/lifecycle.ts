import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  closed,
  count,
  enumeration,
  identifier,
  integer,
  nullable,
  uuid,
} from '../../../services/decode'
import { deviceObject, type ObjectRef } from './objects'
export function retirement(value: unknown, id: string) {
  const v = closed(value, [
    'id',
    'policy',
    'version',
    'target',
    'createdAt',
    'forcedAt',
    'channels',
  ])
  if (v['id'] !== id) throw new Error('Wrong retirement')
  return {
    id: uuid(v['id']),
    policy: uuid(v['policy']),
    version: uuid(v['version']),
    target: deviceObject(v['target']),
    createdAt: integer(v['createdAt']),
    forcedAt: nullable(v['forcedAt'], integer),
    channels: array(v['channels'], (x) => {
      const c = closed(x, [
        'device',
        'channel',
        'registration',
        'generation',
        'parentRegistration',
        'stage',
        'effect',
        'execution',
        'blockingExecution',
        'reason',
      ])
      return {
        device: identifier(c['device']),
        channel: enumeration(c['channel'], ['mdm', 'agent'] as const),
        registration: uuid(c['registration']),
        generation: count(c['generation']),
        parentRegistration: nullable(c['parentRegistration'], uuid),
        stage: enumeration(c['stage'], ['cleanup', 'unenroll', 'revoke', 'complete'] as const),
        effect: enumeration(c['effect'], ['pending', 'confirmed', 'unknown', 'blocked'] as const),
        execution: nullable(c['execution'], uuid),
        blockingExecution: nullable(c['blockingExecution'], uuid),
        reason: nullable(c['reason'], identifier),
      }
    }),
  }
}
export function createLifecycleClient(transport: HttpTransport) {
  return {
    read: (id: string) =>
      api.getApiV1DeviceRetirementsById(transport, { pathParams: { id } }, (v) =>
        retirement(v, id),
      ),
    force: (id: string, operationId: string, reason: string) =>
      api.postApiV1DeviceRetirementsByIdForceRevoke(
        transport,
        { pathParams: { id }, body: { operationId, reason } },
        (value) => {
          const v = value
          if (
            v['operationId'] !== operationId ||
            v['retirementId'] !== id ||
            v['revocation'] !== 'pending'
          )
            throw new Error('Wrong force receipt')
          return { operationId, retirementId: id, revocation: 'pending' as const }
        },
      ),
    asset: (target: ObjectRef, operationId: string, state: 'active' | 'archived' | 'deleted') =>
      api.postApiV1DeviceViewsByKindByIdAssetState(
        transport,
        { pathParams: { ...target }, body: { operationId, state } },
        (value) => {
          const v = value
          if (v['operationId'] !== operationId || v['state'] !== state)
            throw new Error('Wrong asset receipt')
          return { operationId, devices: array(v['devices'], identifier), state }
        },
      ),
  }
}
