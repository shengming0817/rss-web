import type { HttpTransport } from '@rss/api/mdm'
import type { EnrollmentTargetResolver } from '../../../src/features/enrollment/target'
import { closed, enumeration, identifier, uuid } from '../../../src/services/decode'

/** Explicit Mock projection, separate from the current production enrollment status contract. */
export function createDemoEnrollmentTargetResolver(
  transport: HttpTransport,
): EnrollmentTargetResolver {
  return (enrollmentId) =>
    transport.request({
      method: 'GET',
      path: '/api/v1/mdm-candidate/devices/self-enrollments/{id}/target',
      pathParams: { id: uuid(enrollmentId) },
      successStatus: 200,
      decode(value) {
        const v = closed(value, ['evidence', 'enrollmentId', 'deviceId'])
        enumeration(v['evidence'], ['explicit_mock'] as const)
        if (uuid(v['enrollmentId']) !== enrollmentId) throw new Error('Wrong enrollment target')
        return { enrollmentId, deviceId: identifier(v['deviceId']) }
      },
    })
}
