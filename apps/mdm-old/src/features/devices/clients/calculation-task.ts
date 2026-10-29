import * as wireSchemas from '@rss/api/mdm-schemas'
import { count, enumeration, identifier, nullable, uuid } from '../../../services/decode'
/** Current Inventory task contract shared by Group and Scope calculations. */
export function calculationTask(
  value: unknown,
  kind: 'group' | 'group_preview' | 'group_definition' | 'scope',
  target: string,
  task: string,
) {
  if (!wireSchemas.getApiV1GroupsByGroupTasksByTaskResponse200.validateTaskRead(value))
    throw new Error('Invalid contract value')

  const v = value
  if (uuid(v['task']) !== task || v['kind'] !== kind || v['target'] !== target)
    throw new Error('Wrong calculation task')
  return {
    task,
    kind,
    status: enumeration(v['status'], [
      'pending',
      'running',
      'completed',
      'failed',
      'superseded',
    ] as const),
    processed: count(v['processed']),
    members: count(v['members']),
    failure: nullable(v['failure'], identifier),
    replacementTask: nullable(v['replacementTask'], uuid),
    failureDetail: v.failureDetail,
  }
}
