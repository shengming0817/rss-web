import {
  EXTERNAL_SOURCE,
  MANUAL_SOURCE,
  MOCK_SOURCE,
  RSS_SOURCE,
  UNAVAILABLE_SOURCE,
  type SourceMeta,
} from './index'

const rss: SourceMeta = RSS_SOURCE
const mock: SourceMeta = MOCK_SOURCE
const manual: SourceMeta = MANUAL_SOURCE
const external: SourceMeta = EXTERNAL_SOURCE
const unavailable: SourceMeta = UNAVAILABLE_SOURCE
void [rss, mock, manual, external, unavailable]

// @ts-expect-error Source metadata is a sealed display carrier, not an object-literal convention.
const forgedRss: SourceMeta = { kind: 'rss', authoritative: true, preview: false }

// @ts-expect-error Mock data can never be authoritative.
const authoritativeMock: SourceMeta = { kind: 'mock', authoritative: true, preview: true }
// @ts-expect-error RSS responses are not Preview data.
const previewRss: SourceMeta = { kind: 'rss', authoritative: true, preview: true }
// @ts-expect-error Manual coordinates are not authoritative discovery facts.
const authoritativeManual: SourceMeta = { kind: 'manual', authoritative: true, preview: false }
void [forgedRss, authoritativeMock, previewRss, authoritativeManual]
