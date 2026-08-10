import { defineEndpoint } from './coordinate'

const coordinate = defineEndpoint({ method: 'GET', path: '/api/v1/example', successStatus: 200 })
const exactPath: '/api/v1/example' = coordinate.path
void exactPath

// @ts-expect-error Endpoint paths are always same-origin API paths.
defineEndpoint({ method: 'GET', path: 'https://example.test/api', successStatus: 200 })
// @ts-expect-error Endpoint statuses use the reviewed success-status closed set.
defineEndpoint({ method: 'GET', path: '/api/v1/example', successStatus: 202 })
