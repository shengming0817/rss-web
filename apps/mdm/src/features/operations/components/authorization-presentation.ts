import type { Runtime } from '@rss/auth'
import { platformPermissions, type Grant } from '../clients/authorization'
export type LocalAccount = Awaited<ReturnType<Runtime['api']['accounts']>>['accounts'][number]
export const managedPermission = (value: Grant['operation']) =>
  (platformPermissions as readonly string[]).includes(value)
