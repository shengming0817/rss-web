import axios from 'axios'
import type { AxiosInstance } from 'axios'

/**
 * Shared transport primitive. RSS base URLs, authentication and retry policy are
 * intentionally installed by later migration issues after the RSS contracts exist.
 */
export const http: AxiosInstance = axios.create()
