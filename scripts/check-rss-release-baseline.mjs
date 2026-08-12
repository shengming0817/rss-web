import { createHash } from 'node:crypto'

const EXPECTED_ID = '20260812-release-consumed-contracts'
const SUPPORTED_RSS_REVISIONS = Object.freeze(['b7f3e1d0bcc5b2e59639a81b4f37937914b53f00'])
const HISTORICAL_COMPARISON_REVISION = 'b513d3390d73d4f291bb31afc588ca1307ce19af'
const REVIEWED_RSS_REVISION = '1f6c131f0759f921551a81e12e0adb0071346927'
const SHA256 = /^[0-9a-f]{64}$/
const SOURCE_PATH =
  /^contracts\/(?:http|components)\/[a-z0-9./-]+(?:\.schema\.json|contract\.toml)$/
const CONTRACT_SOURCE_BY_ID = Object.freeze({
  'settings.config-delete': 'contracts/http/settings/v5/contract.toml',
  'settings.config-get': 'contracts/http/settings/v4/contract.toml',
  'settings.config-publish': 'contracts/http/settings/v1/contract.toml',
  'settings.config-rollback': 'contracts/http/settings/v6/contract.toml',
  'settings.secret-publish': 'contracts/http/settings/v2/contract.toml',
  'settings.secret-resolve': 'contracts/http/settings/v7/contract.toml',
})

function expectedContractSource(id) {
  return (
    CONTRACT_SOURCE_BY_ID[id] ??
    `contracts/http/${id.replace('.', '/v1/').replaceAll('.', '-')}/contract.toml`
  )
}

function record(value, keys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} fields drifted`)
  }
  return value
}

function nonempty(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be nonempty`)
  return value
}

function unique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique`)
}

export function auditRssReleaseBaseline(input, selectedEndpoints) {
  const manifest = record(
    input,
    [
      'schemaVersion',
      'id',
      'historicalComparisonRevision',
      'reviewedRssRevision',
      'supportedRssRevisions',
      'closureSha256',
      'contracts',
      'files',
    ],
    'release baseline',
  )
  if (manifest.schemaVersion !== 1 || manifest.id !== EXPECTED_ID) {
    throw new Error('release baseline identity drifted')
  }
  if (
    manifest.historicalComparisonRevision !== HISTORICAL_COMPARISON_REVISION ||
    manifest.reviewedRssRevision !== REVIEWED_RSS_REVISION
  ) {
    throw new Error('reviewed RSS identities drifted')
  }
  if (
    !Array.isArray(manifest.supportedRssRevisions) ||
    manifest.supportedRssRevisions.length !== SUPPORTED_RSS_REVISIONS.length ||
    manifest.supportedRssRevisions.some(
      (revision, index) => revision !== SUPPORTED_RSS_REVISIONS[index],
    )
  ) {
    throw new Error('supported RSS revisions drifted')
  }
  if (!Array.isArray(manifest.contracts) || manifest.contracts.length !== 25) {
    throw new Error('selected contract count drifted')
  }
  if (!Array.isArray(manifest.files) || manifest.files.length !== 80) {
    throw new Error('source closure count drifted')
  }
  if (!Array.isArray(selectedEndpoints) || selectedEndpoints.length !== 25) {
    throw new Error('typed endpoint count drifted')
  }

  const files = new Map()
  for (const [index, rawFile] of manifest.files.entries()) {
    const file = record(rawFile, ['path', 'sha256'], `files[${index}]`)
    const path = nonempty(file.path, `files[${index}].path`)
    if (!SOURCE_PATH.test(path) || files.has(path))
      throw new Error(`invalid or duplicate source ${path}`)
    if (typeof file.sha256 !== 'string' || !SHA256.test(file.sha256)) {
      throw new Error(`invalid source hash for ${path}`)
    }
    files.set(path, file)
  }
  const closureSha256 = createHash('sha256')
    .update([...files.values()].map((file) => `${file.path}\0${file.sha256}\n`).join(''))
    .digest('hex')
  if (manifest.closureSha256 !== closureSha256) throw new Error('source closure hash drifted')

  const endpoints = new Map()
  for (const rawEndpoint of selectedEndpoints) {
    const endpoint = record(
      rawEndpoint,
      ['id', 'method', 'path', 'successStatus'],
      'typed endpoint',
    )
    const id = nonempty(endpoint.id, 'typed endpoint id')
    if (endpoints.has(id)) throw new Error(`duplicate typed endpoint ${id}`)
    endpoints.set(id, endpoint)
  }

  const ids = []
  const referencedFiles = new Set()
  let compatibleExact = 0
  let compatibleAdopted = 0
  for (const [index, rawContract] of manifest.contracts.entries()) {
    const contract = record(
      rawContract,
      [
        'id',
        'method',
        'path',
        'successStatus',
        'decision',
        'contractSource',
        'sourceClosureSha256',
        'sourceFiles',
      ],
      `contracts[${index}]`,
    )
    const id = nonempty(contract.id, `contracts[${index}].id`)
    ids.push(id)
    const endpoint = endpoints.get(id)
    if (
      endpoint === undefined ||
      contract.method !== endpoint.method ||
      contract.path !== endpoint.path ||
      contract.successStatus !== endpoint.successStatus
    ) {
      throw new Error(`endpoint coordinate drifted for ${id}`)
    }
    if (!Array.isArray(contract.sourceFiles) || contract.sourceFiles.length < 3) {
      throw new Error(`source closure missing for ${id}`)
    }
    unique(contract.sourceFiles, `${id} source files`)
    const expectedSource = expectedContractSource(id)
    if (
      contract.contractSource !== expectedSource ||
      !contract.sourceFiles.includes(expectedSource)
    )
      throw new Error(`contract source drifted for ${id}`)
    const contractDirectory = expectedSource.slice(0, -'/contract.toml'.length)
    const privateSources = contract.sourceFiles.filter((path) => path.startsWith('contracts/http/'))
    if (privateSources.some((path) => !path.startsWith(`${contractDirectory}/`)))
      throw new Error(`private source ownership drifted for ${id}`)
    for (const path of contract.sourceFiles) {
      if (typeof path !== 'string' || !files.has(path)) throw new Error(`unknown source for ${id}`)
      referencedFiles.add(path)
    }
    const sourceClosureSha256 = createHash('sha256')
      .update(contract.sourceFiles.map((path) => `${path}\0${files.get(path).sha256}\n`).join(''))
      .digest('hex')
    if (contract.sourceClosureSha256 !== sourceClosureSha256)
      throw new Error(`contract source closure drifted for ${id}`)
    if (contract.decision === 'compatible-exact') compatibleExact += 1
    else if (contract.decision === 'compatible-adopted' && id === 'runtime.inventory') {
      compatibleAdopted += 1
    } else {
      throw new Error(`non-compatible or invalid decision for ${id}`)
    }
  }
  unique(ids, 'contract ids')
  if (ids.some((id) => !endpoints.has(id)) || endpoints.size !== ids.length) {
    throw new Error('selected endpoint set drifted')
  }
  if (referencedFiles.size !== files.size) throw new Error('unreferenced source in closure')
  if (compatibleExact !== 24 || compatibleAdopted !== 1) {
    throw new Error('compatibility decision counts drifted')
  }
  return Object.freeze({ contracts: 25, files: 80, compatibleAdopted, compatibleExact })
}
