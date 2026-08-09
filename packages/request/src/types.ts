import type { AxiosError } from 'axios'

export interface GoCellRequestError extends AxiosError {
  i18nKey?: string
}
