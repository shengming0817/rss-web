import { deviceId, uuid } from './authoring'
export interface Confirmation {
  readonly confirmed: true
}
export interface ControlIntent {
  readonly device: string
  readonly operationId: string
  readonly deadline: number
  readonly action:
    | { readonly kind: 'restart' }
    | (Confirmation & { readonly kind: 'lock' | 'wipe' })
}
export interface ControlReceipt {
  readonly operationId: string
  readonly revision: number
}
export interface ControlRecovery {
  readonly requestId: string
  readonly expectedRevision: number
  readonly confirmation?: Confirmation | null
}
export interface ControlPort {
  original(
    device: string,
    id: string,
    signal?: AbortSignal,
  ): Promise<ControlReceipt & { status: string }>
  create(input: ControlIntent, pin?: string): Promise<ControlReceipt>
  cancel(device: string, id: string, input: ControlRecovery): Promise<ControlReceipt>
  reauthorize(device: string, id: string, input: ControlRecovery): Promise<ControlReceipt>
}
export function validateControl(input: ControlIntent, pin?: string) {
  uuid(input.operationId)
  if (!input.device || /\p{Cc}/u.test(input.device) || !Number.isSafeInteger(input.deadline))
    throw new Error('Invalid control target')
  if (!['restart', 'lock', 'wipe'].includes(input.action.kind)) throw new Error('Invalid action')
  if (input.action.kind !== 'restart' && input.action.confirmed !== true)
    throw new Error('Explicit device confirmation required')
  if (input.action.kind === 'lock' && !/^[0-9]{6}$/.test(pin ?? ''))
    throw new Error('Six ASCII digit PIN required')
}
export function createDeviceControl(port: ControlPort) {
  const recover = async (
    kind: 'cancel' | 'reauthorize',
    device: string,
    id: string,
    input: ControlRecovery,
  ) => {
    uuid(id)
    uuid(input.requestId)
    if (!device || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1)
      throw new Error('Invalid operation revision')
    const value = await port[kind](
      device,
      id,
      Object.freeze({
        ...input,
        ...(input.confirmation ? { confirmation: Object.freeze({ ...input.confirmation }) } : {}),
      }),
    )
    if (value.operationId !== id) throw new Error('Wrong control recovery receipt')
    return value
  }
  return {
    async original(device: string, id: string, signal?: AbortSignal) {
      const value = await port.original(deviceId(device), uuid(id), signal)
      if (value.operationId !== id) throw new Error('Wrong original control operation')
      return value
    },
    async create(input: ControlIntent, pin?: string) {
      validateControl(input, pin)
      const value = await port.create(
        Object.freeze({ ...input, action: Object.freeze({ ...input.action }) }),
        pin,
      )
      if (value.operationId !== input.operationId) throw new Error('Wrong control receipt')
      return value
    },
    cancel: (device: string, id: string, input: ControlRecovery) =>
      recover('cancel', device, id, input),
    reauthorize: (device: string, id: string, input: ControlRecovery) =>
      recover('reauthorize', device, id, input),
  }
}
