import type { HttpTransport } from '@rss/api/identity'
import { bool, object, text } from './decode'

export interface HostConfig {
  canonicalOrigin: string
  oidcEnabled: boolean
}
export async function loadConfig(transport: HttpTransport, origin: string): Promise<HostConfig> {
  return transport.request({
    method: 'GET',
    path: '/api/identity-host/v1/config.json',
    successStatus: 200,
    decode(value) {
      const v = object(value, ['canonicalOrigin', 'oidcEnabled'])
      const canonicalOrigin = text(v['canonicalOrigin'])
      const parsed = new URL(canonicalOrigin)
      if (
        parsed.protocol !== 'https:' ||
        parsed.origin !== canonicalOrigin ||
        canonicalOrigin !== origin
      )
        throw new Error('Invalid host configuration')
      return Object.freeze({ canonicalOrigin, oidcEnabled: bool(v['oidcEnabled']) })
    },
  })
}
