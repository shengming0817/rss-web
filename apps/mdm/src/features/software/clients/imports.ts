import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import {
  array,
  boolean,
  closed,
  count,
  digest,
  enumeration,
  identifier,
  integer,
  nullable,
  record,
  string,
} from '../../../services/decode'
import {
  softwareSource,
  softwareArtifact,
  softwareBehavior,
} from '../../policies/clients/software-definition'
export function importRequest(value: unknown) {
  const v = closed(value, [
    'asOfUnixSeconds',
    'source',
    'resource',
    'resourceVersion',
    'package',
    'packageVersion',
    'platform',
    'architecture',
    'variant',
    'selection',
    'behavior',
    'installerLength',
    'additionalArtifacts',
    'dependencies',
    'signatures',
    'reboot',
    'downgrade',
    'nativeExport',
  ])
  const raw = record(v['selection']),
    kind = enumeration(raw['kind'], ['winget', 'brew'] as const)
  let selection
  if (kind === 'winget') {
    closed(raw, ['kind', 'installerType', 'scope', 'installerId', 'files'])
    selection = {
      kind,
      installerType: identifier(raw['installerType']),
      scope: identifier(raw['scope']),
      installerId: nullable(raw['installerId'], string),
      files: array(raw['files'], identifier),
    }
  } else {
    closed(raw, ['kind', 'path', 'bottleTag', 'sourceLength'])
    selection = {
      kind,
      path: identifier(raw['path']),
      bottleTag: identifier(raw['bottleTag']),
      sourceLength: nullable(raw['sourceLength'], count),
    }
  }
  const length = count(v['installerLength'])
  if (!length) throw new Error('Missing installer length')
  return {
    asOfUnixSeconds: integer(v['asOfUnixSeconds']),
    source: softwareSource(v['source']),
    resource: identifier(v['resource']),
    resourceVersion: identifier(v['resourceVersion']),
    package: identifier(v['package']),
    packageVersion: identifier(v['packageVersion']),
    platform: enumeration(v['platform'], ['windows', 'macos'] as const),
    architecture: enumeration(v['architecture'], ['x86_64', 'aarch64'] as const),
    variant: identifier(v['variant']),
    selection,
    behavior: softwareBehavior(v['behavior']),
    installerLength: length,
    additionalArtifacts: Object.fromEntries(
      Object.entries(record(v['additionalArtifacts'])).map(([key, v]) => [
        identifier(key),
        softwareArtifact(v),
      ]),
    ),
    dependencies: array(v['dependencies'], (value) => {
      const d = closed(value, ['package', 'packageVersion', 'resource', 'version', 'sha256'])
      return {
        package: identifier(d['package']),
        packageVersion: identifier(d['packageVersion']),
        resource: identifier(d['resource']),
        version: identifier(d['version']),
        sha256: digest(d['sha256']),
      }
    }),
    signatures: array(v['signatures'], (value) => {
      const s = closed(value, ['artifact', 'mechanism', 'publisher'])
      return {
        artifact: identifier(s['artifact']),
        mechanism: enumeration(s['mechanism'], [
          'authenticode',
          'apple_developer_id',
          'msix',
        ] as const),
        publisher: string(s['publisher']),
      }
    }),
    reboot: enumeration(v['reboot'], ['forbid', 'report'] as const),
    downgrade: enumeration(v['downgrade'], ['deny', 'allow'] as const),
    nativeExport: boolean(v['nativeExport']),
  }
}
export type ImportRequest = ReturnType<typeof importRequest>
export function createImportsClient(transport: HttpTransport) {
  return {
    import: (body: Operation<ImportRequest>) =>
      api.postApiV1SoftwareImports(
        transport,
        { body: { ...body, input: importRequest(body.input) } },
        (value) => {
          const v = value
          if (v['resource'] !== body.input.resource || v['version'] !== body.input.resourceVersion)
            throw new Error('Wrong import result')
          return {
            resource: identifier(v['resource']),
            version: identifier(v['version']),
            resourceDigest: digest(v['resourceDigest']),
            storageRevision: count(v['storageRevision']),
          }
        },
      ),
  }
}
