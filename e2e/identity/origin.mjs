// jsdom 25 omits Fetch's same-origin POST Origin header (xhr-utils only adds it for CORS).
// Supply only that browser metadata. jsdom owns cookies; production transport owns CSRF/body.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const xhr = require('jsdom/lib/jsdom/living/xhr/xhr-utils.js')
const createClient = xhr.createClient
xhr.createClient = function (request) {
  if (!['GET', 'HEAD'].includes(request.flag.method.toUpperCase()))
    request.flag.requestHeaders.Origin = request.flag.origin
  return createClient(request)
}
