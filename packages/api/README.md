# @rss/api

Narrow same-origin HTTP mechanics for RSS Web. The public surface exposes one
transport factory, typed success decoders, cursor decoding, and sanitized
`RssApiError` values. It never exports Axios instances or responses.

Domain adapters own endpoint methods, paths, success statuses, and DTO decoders.
This package does not inject authentication or tenant headers, retry requests,
load contracts at runtime, or log request/response bodies.
