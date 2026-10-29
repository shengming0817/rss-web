import { TENANT } from '../scenario'
import { ok } from '../http'
export const candidate = (body: object, status = 200) =>
  ok({ contract: 'policies-v1', tenantId: TENANT, source: 'mock', ...body }, status)
