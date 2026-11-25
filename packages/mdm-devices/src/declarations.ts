import { uuid } from './authoring'
export interface DdmItem {
  readonly operationId: string
  readonly deviceId: string
  readonly channel: 'mdm.apple'
  readonly userKey: string
  readonly nativeValuesRedacted: boolean
  readonly observation: Readonly<Record<string, unknown>> & {
    readonly protocol: 'mdm.apple'
    readonly observationScope: 'declarations'
    readonly progress: string
    readonly synchronization: string
    readonly inputVersion?: string | null
    readonly expected?: unknown
    readonly nativeStatus?: {
      readonly synchronized: boolean
      readonly completeness: string
      readonly declarations: readonly {
        readonly identifier: string
        readonly kind: string
        readonly serverToken: string
        readonly native: {
          readonly active: boolean | null
          readonly valid: string
          readonly reasons: readonly unknown[]
          readonly evidence?: string | null
        }
      }[]
      readonly errors: readonly unknown[]
      readonly unknownItems: readonly string[]
      readonly items: Readonly<Record<string, unknown>>
      readonly effect: 'unverified'
      readonly compliance: 'unknown'
    } | null
    readonly receivedAt?: number | null
  }
}
export interface DdmPage {
  readonly availability: 'current_registration' | 'no_current_registration'
  readonly effect: 'unverified'
  readonly compliance: 'unknown'
  readonly items: readonly DdmItem[]
  readonly nextCursor: string | null
}
export interface DeclarationsPort {
  declarations(device: string, cursor: string | null, signal?: AbortSignal): Promise<DdmPage>
}
export function createDeviceDeclarations(port: DeclarationsPort) {
  return {
    async declarations(device: string, cursor: string | null = null, signal?: AbortSignal) {
      const page = await port.declarations(uuid(device), cursor, signal)
      if (page.items.some((item) => item.deviceId !== device))
        throw new Error('Wrong DDM registration device')
      return page
    },
  }
}
