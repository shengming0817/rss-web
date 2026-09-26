import { TENANT } from '../scenario'
import { ok } from '../http'
export const asset = (body: object, status = 200) => ok({ tenantId: TENANT, asset: body }, status)
export const candidate = (body: object, status = 200) =>
  ok({ contract: 'devices-v1', tenantId: TENANT, source: 'mock', ...body }, status)
