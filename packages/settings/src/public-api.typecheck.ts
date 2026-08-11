import type { SecretMaterialBase64, SecretVersion, SettingsApi } from './index'

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
api.publishSecret({ key: 'vault.db', storeId: 'vault', refKey: 'app/db' })
api.publishSecret({ key: 'vault.db', storeId: 'vault', refKey: 'app/db', refVersion: 'v3' })
// @ts-expect-error secret material can never enter the reference-only request
api.publishSecret({ key: 'vault.db', storeId: 'vault', refKey: 'app/db', material: 'secret' })
// @ts-expect-error the request is an exact coordinate with no extra properties
api.publishSecret({ key: 'vault.db', storeId: 'vault', refKey: 'app/db', extra: true })
api.publishSecret(
  { key: 'vault.db', storeId: 'vault', refKey: 'app/db' },
  // @ts-expect-error callers cannot provide tenant or authorization headers
  { headers: { 'X-Tenant-ID': 'forged' } },
)
// @ts-expect-error the server-decoded version brand cannot be forged from a number
const forgedSecretVersion: SecretVersion = 1
void forgedSecretVersion

const resolvedMaterial: SecretMaterialBase64 = (await api.resolveSecret('vault.db')).data
  .materialBase64
void resolvedMaterial
// @ts-expect-error material is minted only by the strict response decoder
const forgedMaterial: SecretMaterialBase64 = 'bWF0ZXJpYWw='
void forgedMaterial
// @ts-expect-error callers cannot override the endpoint-owned no-store posture
api.resolveSecret('vault.db', { cache: 'no-store' })
// @ts-expect-error callers cannot provide transport or authority headers
api.resolveSecret('vault.db', { headers: { Authorization: 'forged' } })
