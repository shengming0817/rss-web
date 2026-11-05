import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vite'
import product from '../vite.config'
import { diagnosticScenario } from './diagnostics'
// Explicit isolated entry. Product build retains its boundary and never imports this directory.
export default mergeConfig(
  product,
  defineConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    plugins: [
      {
        name: 'explicit-runtime-diagnostics-scenario',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const url = new URL(req.url ?? '/', 'http://127.0.0.1')
            if (url.pathname !== '/__demo/diagnostics') return next()
            if (req.method !== 'GET') {
              res.statusCode = 405
              res.end()
              return
            }
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Cache-Control', 'no-store')
            res.end(
              JSON.stringify(diagnosticScenario(url.searchParams.get('scenario') ?? 'unknown')),
            )
          })
        },
      },
    ],
    server: {
      host: '127.0.0.1',
      fs: { allow: [fileURLToPath(new URL('../../..', import.meta.url))] },
    },
  }),
)
