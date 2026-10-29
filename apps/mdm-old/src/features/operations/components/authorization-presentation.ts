import type { AccountRow } from '@rss/auth'
import { platformPermissions, type Grant } from '../clients/authorization'
export type LocalAccount = AccountRow & { principalId: string }
export const managedPermission = (value: Grant['operation']) =>
  (platformPermissions as readonly string[]).includes(value)
