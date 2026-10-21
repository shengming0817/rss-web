import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  closed,
  count,
  digest,
  enumeration,
  identifier,
  record,
  string,
  unique,
  uuid,
} from '../../../services/decode'
export const platforms = ['windows', 'macos'] as const
export const architectures = ['x86_64', 'aarch64'] as const
export const installerFormats = ['nsis_exe', 'windows_msi', 'windows_msix', 'macos_pkg'] as const
export function target(value: unknown) {
  const v = closed(value, ['platform', 'architecture'])
  return {
    platform: enumeration(v['platform'], platforms),
    architecture: enumeration(v['architecture'], architectures),
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
  const v = closed(value, [
    'releaseId',
    'tenantId',
    'target',
    'version',
    'format',
    'filename',
    'length',
    'installerSha256',
    'candidateSha256',
    'origin',
    'signingKeys',
  ])
  const result = {
    releaseId: uuid(v['releaseId']),
    tenantId: uuid(v['tenantId']),
    target: target(v['target']),
    version: identifier(v['version']),
    format: enumeration(v['format'], installerFormats),
    filename: identifier(v['filename']),
    length: count(v['length']),
    installerSha256: digest(v['installerSha256']),
    candidateSha256: digest(v['candidateSha256']),
    origin: httpsOrigin(v['origin']),
    signingKeys: Object.fromEntries(
      Object.entries(record(v['signingKeys'])).map(([key, value]) => {
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(key)) throw new Error('Invalid key')
        return [key, base64url(value, 32)]
      }),
    ),
  }
  if (
    result.tenantId !== tenant ||
    !result.length ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(result.filename) ||
    (result.target.platform === 'macos') !== (result.format === 'macos_pkg') ||
    !result.filename.endsWith(
      { nsis_exe: '.exe', windows_msi: '.msi', windows_msix: '.msix', macos_pkg: '.pkg' }[
        result.format
      ],
    ) ||
    !Object.keys(result.signingKeys).length ||
    Object.keys(result.signingKeys).length > 16
  )
    throw new Error('Invalid installer')
  return result
}
export function createPackagesClient(transport: HttpTransport, tenant: string) {
  return {
    list: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/agent/enroll/packages',
        successStatus: 200,
        decode: (v) =>
          unique(
            array(v, (item) => installer(item, tenant)),
            (p) => p.releaseId,
          ),
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/agent/enroll/packages/{id}',
        pathParams: { id: uuid(id) },
        successStatus: 200,
        decode: (v) => {
          const result = installer(v, tenant)
          if (result.releaseId !== id) throw new Error('Wrong release')
          return result
        },
      }),
    content: (id: string) => `/api/v1/agent/enroll/packages/${uuid(id)}/content`,
  }
}
