import type { DirectoryQuery, Page, WindowQuery } from '@rss/mdm-devices'
import type { AssetCut, Condition, Operation } from '@rss/mdm-inventory'

export type Status = 'compliant' | 'non_compliant' | 'unknown' | 'not_applicable'
export type Decision = 'match' | 'no_match' | 'unknown'
export type Reason =
  | 'platform_not_applicable'
  | 'group_not_applicable'
  | 'platform_unknown'
  | 'group_unknown'
  | 'rule_satisfied'
  | 'rule_failed'
  | 'facts_unknown'
export interface Definition {
  readonly presentation: Readonly<Record<string, unknown>>
  readonly severity: 'low' | 'medium' | 'high' | 'critical'
  readonly enabled: boolean
  readonly platform: 'all' | 'windows' | 'macos'
  readonly target:
    | { readonly kind: 'all' }
    | { readonly kind: 'groups'; readonly ids: readonly string[] }
  readonly criteria: Condition
}
export interface Rule {
  readonly id: string
  readonly revision: number
  readonly definition: Definition
}
export interface RuleRow {
  readonly id: string
  readonly revision?: number
  readonly name?: string | null
  readonly enabled?: boolean | null
  readonly deleted?: boolean
  readonly severity?: Definition['severity'] | null
  readonly platform?: Definition['platform'] | null
  readonly targetKind?: 'all' | 'groups' | null
  readonly definition?: Definition | null
}
export interface Changed {
  readonly id: string
  readonly revision: number
  readonly task: string | null
}
export interface Deleted {
  readonly id: string
  readonly revision: number
  readonly deleted: true
}
export interface GroupInput {
  readonly id: string
  readonly revision: number
  readonly memberSet: string | null
  readonly memberVersion: number
  readonly assetCut: AssetCut | null
  readonly ready: boolean
}
export interface FactReference {
  readonly source: string
  readonly dataset: string | null
  readonly registration: string | null
  readonly registrationGeneration: number | null
  readonly epoch: string | null
  readonly snapshotId: string
  readonly observedAt: number
  readonly receivedAt: number
  readonly actor: string | null
}
export interface Assessment {
  readonly ruleId: string
  readonly ruleVersion: number
  readonly dictionaryVersion: string
  readonly assetCut: AssetCut
  readonly evaluatedAt: number
  readonly groups: readonly GroupInput[]
  readonly status: Status
  readonly reason: Reason
  readonly condition: Decision
  readonly applicability: {
    readonly platform: Definition['platform']
    readonly platformDecision: Decision
    readonly sources: readonly {
      readonly source: string
      readonly registration: string
      readonly generation: string
      readonly epoch: string
    }[]
    readonly groups: readonly {
      readonly id: string
      readonly memberSet: string | null
      readonly decision: Decision
    }[]
  }
  readonly explanations: readonly {
    readonly context: string
    readonly path: readonly number[]
    readonly outcome:
      | 'match'
      | 'no_match'
      | 'null'
      | 'missing'
      | 'deleted'
      | 'unsupported'
      | 'conflict'
  }[]
  readonly evidence: readonly {
    readonly context: string
    readonly field: string
    readonly sources: readonly FactReference[]
  }[]
}
export type CurrentRule = {
  readonly ruleId: string
  readonly ruleVersion: number
  readonly previous: Assessment | null
} & (
  | { readonly status: 'pending'; readonly current: null }
  | { readonly status: Status; readonly current: Assessment | null }
)
export interface Current {
  readonly device: string
  readonly status: Status | 'pending'
  readonly reason: 'no_rules' | null
  readonly rules: readonly CurrentRule[]
}
export interface HistoryEntry extends Assessment {
  readonly task: string
  readonly disposition: 'published' | 'superseded' | 'failed'
}
export interface HistoryQuery extends WindowQuery {
  readonly from?: number
  readonly until?: number
}
export interface Task {
  readonly task: string
  readonly ruleId: string
  readonly ruleVersion: number
  readonly assetCut: AssetCut
  readonly phase: 'queued' | 'evaluating' | 'published' | 'superseded' | 'failed'
  readonly processed: number
  readonly completed: boolean
  readonly failure: string | null
  readonly diagnostic: { readonly reason: 'group_input_pending' } | null
}
/** This capability owns its task/evaluation views, without a central workflow bridge. */
export interface CompliancePort {
  list(query: DirectoryQuery<keyof RuleRow>): Promise<Page<RuleRow>>
  read(id: string): Promise<Rule>
  version(id: string, revision: number): Promise<Rule>
  put(id: string, change: Operation<Definition>): Promise<Changed>
  remove(id: string, change: Operation<Record<string, never>>): Promise<Deleted>
  recompute(
    id: string,
    change: Operation<Record<string, never>>,
  ): Promise<{ readonly task: string }>
  task(id: string, task: string): Promise<Task>
  current(device: string): Promise<Current>
  history(device: string, query: HistoryQuery): Promise<Page<HistoryEntry>>
}
