/**
 * Runtime system information used by the retained RSS health foundation.
 *
 * The migration endpoint may be unavailable; callers degrade gracefully.
 */
import { http } from '@gocell/request'

/** System info endpoint. */
export const SYSTEM_URL = '/api/v1/admin/system'

export interface BuildInfo {
  version: string
  commit: string
  commitDate: string
  buildDate: string
  goVersion: string
  tags: string[]
  dirty: boolean
}

export interface RuntimeInfo {
  uptimeSeconds: number
  goroutines: number
  memoryMB: number
  memoryAllocBytes: number
  gcPauseTotalNs: number
  cpuPercent: number
  pid: number
}

export interface AssemblyInfo {
  name: string
  cells: string[]
  primaryAddr: string
  internalAddr: string
}

export interface EnvironmentInfo {
  env: string
  hostname: string
  containerized: boolean
}

export interface SystemInfoResponse {
  build: BuildInfo
  runtime: RuntimeInfo
  assembly: AssemblyInfo
  environment: EnvironmentInfo
}

/**
 * Lightweight shape guard for SystemInfoResponse.
 * Throws if the top-level required fields are absent, directing the store to
 * 'unavailable' rather than silently rendering empty data.
 *
 * Issue #4 replaces this provisional shape with a selected RSS contract.
 */
function assertSystemShape(data: unknown): asserts data is SystemInfoResponse {
  if (data === null || typeof data !== 'object' || !('build' in data) || !('runtime' in data)) {
    throw new Error('fetchSystemInfo: response missing required fields "build" or "runtime"')
  }
}

/** GET /api/v1/admin/system — runtime system snapshot. */
export async function fetchSystemInfo(): Promise<SystemInfoResponse> {
  const res = await http.get<unknown>(SYSTEM_URL)
  assertSystemShape(res.data)
  return res.data
}
