import type { RssApiError } from './index'

// @ts-expect-error RSS API errors are minted internally after sanitization.
const forbiddenConstructor: new (init: unknown) => RssApiError = RssApiError
void forbiddenConstructor
