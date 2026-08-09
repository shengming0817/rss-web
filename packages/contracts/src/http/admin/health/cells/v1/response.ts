/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 * Source: gocell/contracts/http/admin/health/cells/v1/response.schema.json
 * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。
 */

/**
 * Aggregated runtime health for operator/admin consoles. A single composite resource wrapped in the {data: {...}} envelope (NOT a paginated list): the cell set is bounded by the assembly. `cells` carries per-cell live/ready/status plus the cell's own readiness probes (deps); `adapters` carries the assembly-global infrastructure probes (postgres_ready/redis_ready/... and framework probes) that are not owned by any single cell.
 */
export interface HttpAdminHealthCellsV1Response {
  data: {
    /**
     * Worst-case status across every cell and adapter probe. One of: healthy | degraded | unhealthy.
     */
    overall: string;
    /**
     * Per-cell health, in assembly registration order.
     */
    cells: {
      /**
       * Cell identifier (assembly closed set).
       */
      id: string;
      /**
       * Cell is running in the started assembly. In-process liveness equals assembly-started, so this is true while the endpoint is reachable; the discriminating signals are ready and status.
       */
      live: boolean;
      /**
       * Cell reports itself ready to serve (CellStatus.Ready).
       */
      ready: boolean;
      /**
       * Cell health snapshot. One of: healthy | degraded | unhealthy.
       */
      status: string;
      /**
       * Readiness probes this cell registered (structurally per-cell).
       */
      deps: {
        name: string;
        /**
         * Probe status. One of: healthy | degraded | unhealthy | timeout.
         */
        status: string;
        durationMs: number;
      }[];
    }[];
    /**
     * Assembly-global infrastructure probes not owned by any cell (adapter *_ready probes plus framework probes), by structural set-difference against the per-cell probe sets.
     */
    adapters: {
      name: string;
      /**
       * Probe status. One of: healthy | degraded | unhealthy | timeout.
       */
      status: string;
      durationMs: number;
    }[];
  };
}
