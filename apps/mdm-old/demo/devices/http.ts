import { TENANT } from '../scenario'
import { ok } from '../http'
export const asset = (body: object, status = 200) => ok({ tenantId: TENANT, asset: body }, status)
