import { readFileSync } from 'node:fs'

const WEB_REVISION = /^[0-9a-f]{40}$/
const ledger = JSON.parse(
  readFileSync(
    new URL('../../docs/contracts/20260812-rss-release-baseline.json', import.meta.url),
    'utf8',
  ),
)
if (
  ledger.id !== '20260812-release-consumed-contracts' ||
  !Array.isArray(ledger.supportedRssRevisions) ||
  ledger.supportedRssRevisions.length !== 1 ||
  !ledger.supportedRssRevisions.every((revision) => WEB_REVISION.test(revision)) ||
  new Set(ledger.supportedRssRevisions).size !== ledger.supportedRssRevisions.length
) {
  throw new Error('invalid supported RSS revisions in release contract ledger')
}

export const SUPPORTED_RSS_REVISIONS = Object.freeze([...ledger.supportedRssRevisions])
export const DEFAULT_RSS_REVISION = SUPPORTED_RSS_REVISIONS[0]

export function resolveSupportedRssRevision(requestedRevision) {
  const revision = requestedRevision ?? DEFAULT_RSS_REVISION
  if (!SUPPORTED_RSS_REVISIONS.includes(revision)) {
    throw new Error(`unsupported RSS source revision: ${revision}`)
  }
  return revision
}
