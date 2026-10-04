import type { HttpTransport } from '@rss/api/mdm'
import { count } from '../../../services/decode'
import { candidate } from './candidate'
import { experience } from './experience-model'
import { supportContext, supportRecord } from './support-model'
export function createSupportClient(transport: HttpTransport, tenant: string, demo: boolean) {
  return {
    experience: (device: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/security/support/devices/{device}/experience',
        pathParams: { device },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['experience', 'asOf']),
            result = experience(v['experience']),
            asOf = count(v['asOf'])
          if (result.device !== device || result.evaluatedAt > asOf)
            throw new Error('Wrong experience response')
          return { experience: result, asOf }
        },
      }),
    context: (device: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/security/support/devices/{device}',
        pathParams: { device },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['context', 'asOf']),
            context = supportContext(v['context']),
            asOf = count(v['asOf'])
          if (context.device !== device || context.evaluatedAt > asOf)
            throw new Error('Wrong support context')
          return { context, asOf }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/security/support/requests/{id}',
        pathParams: { id },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['support', 'asOf']),
            support = supportRecord(v['support']),
            asOf = count(v['asOf'])
          if (support.request !== id) throw new Error('Wrong support request')
          const d = support.details,
            times =
              d.kind === 'elevation'
                ? [d.grant.observedAt, d.usage.startedAt, d.usage.endedAt]
                : d.kind === 'remote_support'
                  ? [d.consent.at, d.session.startedAt, d.session.endedAt]
                  : [d.collection?.at ?? null, d.uploadedAt, d.scan.at]
          if (
            times.some((at) => at !== null && at > asOf) ||
            (d.kind === 'remote_support' &&
              d.consent.state === 'granted' &&
              (d.consent.validUntil ?? 0) <= asOf) ||
            (d.kind === 'diagnostics' &&
              ((d.state === 'ready' && (d.availableUntil ?? 0) <= asOf) ||
                (d.state === 'expired' && (d.availableUntil === null || d.availableUntil > asOf))))
          )
            throw new Error('Invalid support observation time')
          return { support, asOf }
        },
      }),
  }
}
