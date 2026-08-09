import type { AxiosError } from 'axios'

export interface RssRequestError extends AxiosError {
  i18nKey?: string
}
