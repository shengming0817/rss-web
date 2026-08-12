const WEB_REVISION = /^[0-9a-f]{40}$/
const HASHED_ASSET = /^assets\/.+-[A-Za-z0-9_-]{8}\.(?:css|js)$/

export const ROLLBACK_WEB_REVISION = 'a2b90c97d2da7079b0a593fd7b445fd595e6b897'

function requireWebRevision(revision, name) {
  if (!WEB_REVISION.test(revision)) throw new Error(`${name} must be a lowercase 40-character SHA`)
  return revision
}

export function createStaticRollbackPlan(candidateRevision) {
  const candidate = requireWebRevision(candidateRevision, 'candidate revision')
  const rollback = requireWebRevision(ROLLBACK_WEB_REVISION, 'rollback revision')
  if (candidate === rollback) throw new Error('candidate and rollback revisions must differ')
  return Object.freeze({ candidateRevision: candidate, rollbackRevision: rollback })
}

export function candidateOnlyHashedAssets(candidateFiles, rollbackFiles) {
  const rollback = new Set(rollbackFiles)
  return candidateFiles.filter((file) => HASHED_ASSET.test(file) && !rollback.has(file)).sort()
}
