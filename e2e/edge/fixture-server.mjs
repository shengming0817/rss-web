import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import process from 'node:process'

const [listener, rawPort] = process.argv.slice(2)
const port = Number(rawPort)
let requestCount = 0

function tenantHeaders(rawHeaders) {
  const values = []
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === 'x-tenant-id') values.push(rawHeaders[index + 1])
  }
  return values
}

const server = createServer((request, response) => {
  if (request.url === '/__ready') {
    response.writeHead(204).end()
    return
  }
  if (request.url?.endsWith('/__fixture-count')) {
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ listener, requestCount }))
    return
  }

  const chunks = []
  request.on('data', (chunk) => chunks.push(chunk))
  request.on('end', () => {
    requestCount += 1
    const body = Buffer.concat(chunks)
    const payload = {
      listener,
      method: request.method,
      url: request.url,
      tenantHeaders: tenantHeaders(request.rawHeaders),
      authorizationPresent: typeof request.headers.authorization === 'string',
      forwarded: request.headers.forwarded ?? null,
      xForwardedFor: request.headers['x-forwarded-for'] ?? null,
      xOriginalUri: request.headers['x-original-uri'] ?? null,
      xOriginalUrl: request.headers['x-original-url'] ?? null,
      xForwardedPrefix: request.headers['x-forwarded-prefix'] ?? null,
      host: request.headers.host ?? null,
      bodyBytes: body.length,
      bodySha256: createHash('sha256').update(body).digest('hex'),
    }
    const status = request.url?.includes('fixture-status=418') ? 418 : 200
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'X-Fixture-Listener': listener,
    })
    response.end(JSON.stringify(payload))
  })
})

server.listen(port, '0.0.0.0')
