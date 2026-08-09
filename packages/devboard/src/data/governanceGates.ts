/**
 * Governance gates — STATIC SNAPSHOT.
 *
 * The CH-01..CH-06 contract-health gates are produced by the backend
 * `gocell validate --strict` pipeline; there is no HTTP endpoint exposing
 * their live verdicts yet. This is a labelled snapshot for the /contracts
 * page — the UI must render it under a visible "snapshot" affordance and must
 * NOT present it as a live result. Descriptions are i18n keys (zero hardcode).
 */

export type GateVerdict = 'pass' | 'warn' | 'fail'

export interface GovernanceGate {
  /** Gate id, e.g. 'CH-01'. */
  readonly id: string
  /** i18n key for the human description of what the gate checks. */
  readonly descKey: string
  readonly verdict: GateVerdict
  readonly passed: number
  readonly total: number
  /** Recently-introduced gate (renders a "new" affordance). */
  readonly isNew?: boolean
}

export const GOVERNANCE_GATES: readonly GovernanceGate[] = [
  { id: 'CH-01', descKey: 'contracts.gates.ch01', verdict: 'pass', passed: 45, total: 45 },
  { id: 'CH-02', descKey: 'contracts.gates.ch02', verdict: 'pass', passed: 45, total: 45 },
  { id: 'CH-03', descKey: 'contracts.gates.ch03', verdict: 'pass', passed: 45, total: 45 },
  { id: 'CH-04', descKey: 'contracts.gates.ch04', verdict: 'warn', passed: 44, total: 45 },
  { id: 'CH-05', descKey: 'contracts.gates.ch05', verdict: 'pass', passed: 45, total: 45 },
  {
    id: 'CH-06',
    descKey: 'contracts.gates.ch06',
    verdict: 'pass',
    passed: 45,
    total: 45,
    isNew: true,
  },
] as const
