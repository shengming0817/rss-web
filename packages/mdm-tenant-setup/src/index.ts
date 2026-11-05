export type * from './model'
export { channels, capabilities, stepIds, stepStatuses } from './model'
import { channels, capabilities } from './model'
import type { Capability, Channel, Command, Decision, Intent, Receipt, SetupPort } from './model'
const requiredChannel: Partial<Record<Capability, Channel>> = {
  agent_package: 'agent',
  task_signing: 'agent',
  windows_push: 'windows_mdm',
  apple_ade: 'macos_mdm',
  apple_account: 'macos_mdm',
}
export function identifier(value: string): string {
  if (
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value) ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)
  )
    throw new Error('Invalid identifier')
  return value
}
export function revision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid revision')
  return value
}
export function intent(value: Intent): Intent {
  if (
    typeof value.completionRequested !== 'boolean' ||
    value.channels.some((c) => !channels.includes(c)) ||
    new Set(value.channels).size !== value.channels.length ||
    Object.keys(value.capabilities).some((k) => !capabilities.includes(k as Capability))
  )
    throw new Error('Invalid selection')
  const decisions: Partial<Record<Capability, Decision>> = {}
  for (const key of capabilities) {
    const decision = value.capabilities[key]
    if (!decision) continue
    if (decision.kind === 'configure') {
      const channel = requiredChannel[key]
      if (channel && !value.channels.includes(channel))
        throw new Error('Capability requires channel')
      decisions[key] = Object.freeze({ kind: 'configure' })
    } else if (
      decision.kind === 'skip' &&
      decision.reason.trim() &&
      !/\p{Cc}/u.test(decision.reason) &&
      new TextEncoder().encode(decision.reason).length <= 1024
    )
      decisions[key] = Object.freeze({ kind: 'skip', reason: decision.reason })
    else throw new Error('Invalid skip reason')
  }
  const result = Object.freeze({
    channels: Object.freeze(channels.filter((c) => value.channels.includes(c))),
    capabilities: Object.freeze(decisions),
    completionRequested: value.completionRequested,
  })
  if (new TextEncoder().encode(JSON.stringify(result)).length > 16000)
    throw new Error('Intent budget exceeded')
  return result
}
export function sameIntent(a: Intent, b: Intent): boolean {
  return JSON.stringify(intent(a)) === JSON.stringify(intent(b))
}
/** Holds only this session's non-secret original request. No configuration authority is cached. */
export function createTenantSetup(port: SetupPort, tenant: string) {
  identifier(tenant)
  let pending: Command | null = null
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((listener) => listener())
  function accept(receipt: Receipt, command?: Command) {
    identifier(receipt.operationId)
    revision(receipt.saved.revision)
    intent(receipt.saved.intent)
    if (
      command &&
      (receipt.operationId !== command.operationId ||
        receipt.saved.revision !== command.expectedRevision + 1 ||
        !sameIntent(receipt.saved.intent, command.intent))
    )
      throw new Error('Mismatched original receipt')
    return receipt
  }
  return Object.freeze({
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => pending,
    catalog: port.catalog,
    async read() {
      const value = await port.read()
      if (value.tenantId !== tenant) throw new Error('Wrong setup tenant')
      revision(value.saved.revision)
      intent(value.saved.intent)
      return value
    },
    prepare(operationId: string, expectedRevision: number, selection: Intent): Command {
      if (pending) throw new Error('Original request unresolved')
      if (expectedRevision >= Number.MAX_SAFE_INTEGER)
        throw new Error('Revision cannot advance safely')
      pending = Object.freeze({
        operationId: identifier(operationId),
        expectedRevision: revision(expectedRevision),
        intent: intent(selection),
      })
      emit()
      return pending
    },
    async submit(command: Command) {
      if (pending !== command) throw new Error('Wrong original request')
      const result = accept(await port.update(command), command)
      if (pending === command) {
        pending = null
        emit()
      }
      return result
    },
    async operation(id: string) {
      const command = pending
      const receipt = accept(
        await port.operation(identifier(id)),
        command?.operationId === id ? command : undefined,
      )
      if (receipt.operationId !== id) throw new Error('Wrong operation')
      if (pending === command && command?.operationId === id) {
        pending = null
        emit()
      }
      return receipt
    },
    /** Only an explicit known business rejection may release an original intent. */
    rejected(command: Command) {
      if (pending === command) {
        pending = null
        emit()
      }
    },
  })
}
