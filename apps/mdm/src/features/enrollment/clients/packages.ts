import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import { array, count, digest, identifier, string, unique, uuid } from '../../../services/decode'
export const platforms = ['windows', 'macos'] as const
export const architectures = ['x86_64', 'aarch64'] as const
export const installerFormats = ['windows_exe', 'windows_msi', 'windows_msix', 'macos_pkg'] as const
export function target(value: unknown) {
  if (!wireSchemas.getApiV1AgentPackagesResponse.validateTarget(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    platform: v['platform'],
    architecture: v['architecture'],
  }
}
export function httpsOrigin(value: unknown) {
  const result = string(value),
    url = new URL(result)
  if (url.protocol !== 'https:' || url.origin !== result || url.username || url.password)
    throw new Error('Invalid origin')
  return result
}
export function base64url(value: unknown, length: number) {
  const result = string(value)
  if (!/^[A-Za-z0-9_-]+$/.test(result)) throw new Error('Invalid encoding')
  const binary = atob(result.replaceAll('-', '+').replaceAll('_', '/'))
  if (
    binary.length !== length ||
    btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '') !== result
  )
    throw new Error('Invalid encoding')
  return result
}
export function installer(value: unknown, tenant: string) {
  if (!wireSchemas.postApiV1AgentPackagesResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  const result = {
    releaseId: uuid(v['releaseId']),
    tenantId: uuid(v['tenantId']),
    target: target(v['target']),
    version: identifier(v['version']),
    format: v['format'],
    filename: identifier(v['filename']),
    length: count(v['length']),
    installerSha256: digest(v['installerSha256']),
  }
  if (
    result.tenantId !== tenant ||
    !result.length ||
    !result.filename ||
    result.filename.length > 255 ||
    /[/\\\p{Cc}]/u.test(result.filename) ||
    (result.target.platform === 'macos') !== (result.format === 'macos_pkg') ||
    !result.filename
      .toLowerCase()
      .endsWith(
        { windows_exe: '.exe', windows_msi: '.msi', windows_msix: '.msix', macos_pkg: '.pkg' }[
          result.format
        ],
      )
  )
    throw new Error('Invalid installer')
  return result
}
export function createPackagesClient(transport: HttpTransport, tenant: string) {
  return {
    list: () =>
      api.getApiV1AgentEnrollPackages(transport, {}, (v) =>
        unique(
          array(v, (item) => installer(item, tenant)),
          (p) => p.releaseId,
        ),
      ),
    read: (id: string) =>
      api.getApiV1AgentEnrollPackagesById(transport, { pathParams: { id: uuid(id) } }, (v) => {
        const result = installer(v, tenant)
        if (result.releaseId !== id) throw new Error('Wrong release')
        return result
      }),
    content: (id: string) => api.getApiV1AgentEnrollPackagesByIdContent.url({ id: uuid(id) }),
  }
}
