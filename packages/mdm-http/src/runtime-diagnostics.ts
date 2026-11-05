import type { DiagnosticsPort } from '@rss/mdm-runtime-diagnostics'
/** #3140: the published endpoint still merges independent owners. Never decode that retired model. */
export function createRuntimeDiagnosticsAdapter(): DiagnosticsPort {
  return {
    snapshot: () =>
      Promise.reject({ cause: 'wire', status: 501, code: 'diagnostics_contract_unavailable' }),
  }
}
