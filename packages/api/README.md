# @rss/api

Narrow same-origin HTTP mechanics for RSS Web. The public surface exposes one
transport factory, typed success decoders, cursor decoding, and sanitized
`RssApiError` values recognized through `isRssApiError`. Error construction is
internal so consumers cannot bypass WireError sanitization. It never exports
Axios instances or responses.

Domain adapters own endpoint methods, paths, success statuses, and DTO decoders.
The restricted `@rss/api/session` subpath provides the one reviewed transport
decorator used by `@rss/identity`: it injects a capability-owned bearer only on
adapter-marked protected requests, recognizes only a sanitized RSS
`ERR_CORE_UNAUTHENTICATED` 401, and delegates one retry after recovery. The main
API surface does not expose this capability. Browser-authored `Authorization`
and `X-Tenant-ID` headers are rejected before network I/O.

The package does not store credentials, choose tenant authority, load contracts
at runtime, log request/response bodies, or provide general retry middleware.

Selected endpoint coordinates may be exposed through reviewed `./endpoints/*`
subpaths for their owning domain adapter. They are static coordinates, not a
runtime contract registry, and applications must consume the domain adapter.
