import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  closed,
  enumeration,
  identifier,
  integer,
  nullable,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import { member, positive, type Member } from './endpoint-model'
import { pageCursor } from '@rss/api/mdm-query'
export interface ConfirmAssociation {
  operationId: string
  associationId: string | null
  expectedVersion: number
  mdm: Member
  agent: Member
  evidence: string
}
export interface RevokeAssociation {
  operationId: string
  expectedVersion: number
  reason: string
}
export function association(value: unknown) {
  const v = closed(value, [
    'id',
    'version',
    'state',
    'members',
    'evidence',
    'confirmedBy',
    'confirmedAt',
    'revokedBy',
    'revokedAt',
    'reason',
  ])
  const members = unique(array(v['members'], member), (m) => m.device)
  if (members.length !== 2 || new Set(members.map((m) => m.channel)).size !== 2)
    throw new Error('Invalid association members')
  return {
    id: uuid(v['id']),
    version: positive(v['version']),
    state: enumeration(v['state'], ['confirmed', 'needs_verification', 'revoked'] as const),
    members,
    evidence: string(v['evidence']),
    confirmedBy: identifier(v['confirmedBy']),
    confirmedAt: integer(v['confirmedAt']),
    revokedBy: nullable(v['revokedBy'], identifier),
    revokedAt: nullable(v['revokedAt'], integer),
    reason: nullable(v['reason'], string),
  }
}
export type Association = ReturnType<typeof association>
export function verificationText(value: string) {
  return !!value.trim() && new TextEncoder().encode(value).length <= 2048 && !/\p{Cc}/u.test(value)
}
export function createAssociationsClient(transport: HttpTransport) {
  return {
    candidates: (device: string, channel: Member['channel'], cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/association-candidates',
        pathParams: { device },
        query: {
          channel,
          cursor: cursor === undefined ? undefined : pageCursor(cursor),
          limit: 20,
        },
        successStatus: 200,
        decode: (value) => {
          const v = closed(value, ['items', 'nextCursor']),
            items = unique(array(v['items'], member), (m) => m.device)
          if (items.some((m) => m.device === device || m.channel === channel))
            throw new Error('Wrong candidate channel')
          return { items, nextCursor: nullable(v['nextCursor'], pageCursor) }
        },
      }),
    get: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/device-associations/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (value) => {
          const a = association(value)
          if (a.id !== id) throw new Error('Wrong association')
          return a
        },
      }),
    confirm: (body: ConfirmAssociation) => {
      uuid(body.operationId)
      if (body.associationId === null) {
        if (body.expectedVersion !== 0) throw new Error('Invalid create version')
      } else {
        uuid(body.associationId)
        positive(body.expectedVersion)
      }
      const mdm = member(body.mdm),
        agent = member(body.agent)
      if (
        mdm.channel !== 'mdm' ||
        agent.channel !== 'agent' ||
        mdm.device === agent.device ||
        !verificationText(body.evidence)
      )
        throw new Error('Invalid confirmation')
      return transport.request({
        method: 'POST',
        path: '/api/v1/device-associations',
        body,
        successStatus: 200,
        decode: (value) => {
          const a = association(value)
          if (
            (body.associationId !== null && a.id !== body.associationId) ||
            a.version !== body.expectedVersion + 1 ||
            a.state !== 'confirmed' ||
            [mdm, agent].some(
              (m) =>
                !a.members.some(
                  (x) =>
                    x.device === m.device &&
                    x.channel === m.channel &&
                    x.registrationId === m.registrationId &&
                    x.generation === m.generation,
                ),
            )
          )
            throw new Error('Wrong confirmation receipt')
          return a
        },
      })
    },
    revoke: (id: string, body: RevokeAssociation) => {
      uuid(id)
      uuid(body.operationId)
      positive(body.expectedVersion)
      if (!verificationText(body.reason)) throw new Error('Invalid revoke reason')
      return transport.request({
        method: 'POST',
        path: '/api/v1/device-associations/{id}/revoke',
        pathParams: { id },
        body,
        successStatus: 200,
        decode: (value) => {
          const a = association(value)
          if (a.id !== id || a.version !== body.expectedVersion + 1 || a.state !== 'revoked')
            throw new Error('Wrong revoke receipt')
          return a
        },
      })
    },
  }
}
