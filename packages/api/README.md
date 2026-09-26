# @rss/api

`@rss/api/identity` provides the same-origin Identity HTTP v2 transport, strict success/error decoding and sanitized errors. The application owns endpoint DTOs and its cookie/CSRF session controller. Requests never replay automatically or accept caller-authored Authorization or tenant headers. Transport errors contain only cause, code and optional status; Axios request/response data never leaves the boundary.

`@rss/api/testing` supplies network and timeout failures for application tests. Production code consumes only the Identity export.
