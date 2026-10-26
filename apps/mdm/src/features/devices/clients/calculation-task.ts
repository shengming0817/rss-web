import { closed, count, enumeration, identifier, nullable, uuid } from '../../../services/decode'
/** Current Inventory task contract shared by Group and Scope calculations. */
export function calculationTask(
  value: unknown,
  kind: 'group' | 'group_preview' | 'group_definition' | 'scope',
  target: string,
  task: string,
) {
  const v = closed(value, [
    'task',
    'kind',
    'target',
    'status',
    'processed',
    'members',
    'failure',
    'failureDetail',
    'replacementTask',
  ])
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
    failureDetail: nullable(v['failureDetail'], (value) => {
      const f = closed(value, ['reason', 'device', 'stage'])
      return {
        reason: enumeration(f['reason'], [
          'capability_unknown',
          'platform_unsupported',
          'stale_plan',
          'owner_conflict',
        ] as const),
        device: nullable(f['device'], identifier),
        stage: enumeration(f['stage'], ['preview', 'save', 'execute'] as const),
      }
    }),
  }
}
