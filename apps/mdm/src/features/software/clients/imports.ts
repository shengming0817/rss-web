import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import {
  array,
  count,
  digest,
  identifier,
  integer,
  nullable,
  string,
} from '../../../services/decode'
import {
  softwareSource,
  softwareArtifact,
  softwareBehavior,
} from '../../policies/clients/software-definition'
export function importRequest(value: unknown) {
  if (!wireSchemas.postApiV1SoftwareImportsBody.validateImportRequest(value))
    throw new Error('Invalid contract value')

  const v = value
  const raw = v['selection'],
    kind = raw['kind']
  let selection
  if (kind === 'winget') {
    selection = {
      kind,
      installerType: identifier(raw['installerType']),
      scope: identifier(raw['scope']),
      installerId: nullable(raw['installerId'], string),
      files: array(raw['files'], identifier),
    }
  } else {
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
    platform: v['platform'],
    architecture: v['architecture'],
    variant: identifier(v['variant']),
    selection,
    behavior: softwareBehavior(v['behavior']),
    installerLength: length,
    additionalArtifacts: Object.fromEntries(
      Object.entries(v['additionalArtifacts']).map(([key, v]) => [
        identifier(key),
        softwareArtifact(v),
      ]),
    ),
    dependencies: array(v['dependencies'], (value) => {
      const d = value
      return {
        package: identifier(d['package']),
        packageVersion: identifier(d['packageVersion']),
        resource: identifier(d['resource']),
        version: identifier(d['version']),
        sha256: digest(d['sha256']),
      }
    }),
    signatures: array(v['signatures'], (value) => {
      const s = value
      return {
        artifact: identifier(s['artifact']),
        mechanism: s['mechanism'],
        publisher: string(s['publisher']),
      }
    }),
    reboot: v['reboot'],
    downgrade: v['downgrade'],
    nativeExport: v['nativeExport'],
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
