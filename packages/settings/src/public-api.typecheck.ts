import type { SettingsApi } from './index'

declare const api: SettingsApi
// @ts-expect-error callers cannot provide headers or tenant authority
api.get('app.k', { headers: { 'X-Tenant-ID': 'forged' } })
// @ts-expect-error delete is void and exposes no response body
const response: { data: unknown } = await api.delete('app.k')
void response
// @ts-expect-error rollback callers cannot provide headers or tenant authority
api.rollback('app.k', { toVersion: 1 }, { headers: { Authorization: 'forged' } })
// @ts-expect-error rollback accepts only an explicit version coordinate
api.rollback('app.k', { toVersion: 1, value: 'secret' })
