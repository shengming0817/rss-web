import type { MdmRuntime } from '../../context'
/** Presentation lifetime only; the shared session controller remains the authority owner. */
export function deviceBinding(runtime: MdmRuntime) {
  const s = runtime.session.state.value
  return [runtime.tenant, s.status, s.tenant ?? undefined, s.identity?.principalId, s.session?.id]
}
