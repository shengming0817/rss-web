export function boundedTimeout(deadlineMs: number, requestedMs: number, nowMs?: number): number
export function isCleanWebStatus(output: string): boolean
export function classifyPlaywrightReport(report: unknown): 'passed' | 'product' | 'environment'
export function finalizeOutcome<Outcome extends { readonly status: string }>(
  outcome: Outcome,
  cleanup:
    | { readonly status: 'passed'; readonly project: string }
    | { readonly status: 'failed'; readonly project: string; readonly recoveryPath: string },
):
  | (Outcome & { readonly cleanup: { readonly status: 'passed'; readonly project: string } })
  | {
      readonly status: 'failed'
      readonly failure: {
        readonly stage: 'environment:cleanup'
        readonly classification: 'environment'
      }
      readonly cleanup: {
        readonly status: 'failed'
        readonly project: string
        readonly recoveryPath: string
      }
    }
export function authorsTenantHeader(source: string): boolean
