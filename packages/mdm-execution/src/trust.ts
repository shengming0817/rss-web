import { freeze, uuid } from '@rss/mdm-inventory'
export interface Trust {
  readonly serviceId: string
  readonly tenant: string
  readonly revision: number
  readonly keys: readonly {
    readonly id: string
    readonly publicKey: string
    readonly state: 'prepared' | 'active' | 'verify_only'
  }[]
}
export type TrustChange =
  | { readonly action: 'prepare'; readonly expectedRevision: number }
  | {
      readonly action: 'activate' | 'retire'
      readonly expectedRevision: number
      readonly keyId: string
    }
export interface TrustObservation {
  readonly device: string
  readonly state: string
  readonly reason: string | null
  readonly targetRevision: number | null
  readonly actualRevision: number | null
  readonly receivedAt: number
}
export interface TrustPort {
  trust(): Promise<Trust>
  changeTrust(operationId: string, input: TrustChange): Promise<Trust>
  trustOperation(id: string): Promise<Trust>
  trustObservation(device: string): Promise<TrustObservation | null>
}
export function createTrust(port: TrustPort) {
  return {
    trust: () => port.trust(),
    changeTrust(id: string, input: TrustChange) {
      uuid(id)
      if (
        !Number.isSafeInteger(input.expectedRevision) ||
        input.expectedRevision < 0 ||
        !['prepare', 'activate', 'retire'].includes(input.action) ||
        ('keyId' in input && !input.keyId)
      )
        throw new Error('Invalid trust change')
      return port.changeTrust(id, freeze(input)).then((value) => {
        if (value.revision !== input.expectedRevision + 1)
          throw new Error('Wrong trust change revision')
        return value
      })
    },
    trustOperation: (id: string) => port.trustOperation(uuid(id)),
    trustObservation: (device: string) => port.trustObservation(device),
  }
}
