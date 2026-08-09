/**
 * formatBytes — memory/size display helpers.
 *
 * formatMib — formats a mebibyte value as a human-readable MB string.
 * Used for system memory display (RuntimeInfo.memoryMB).
 *
 * Examples:
 *   formatMib(0)      → "0.0 MB"
 *   formatMib(87.4)   → "87.4 MB"
 *   formatMib(1024)   → "1024.0 MB"
 */
export function formatMib(mib: number): string {
  return `${mib.toFixed(1)} MB`
}

/**
 * formatBytes — formats raw bytes as a compact human-readable string.
 *
 * Examples:
 *   formatBytes(0)            → "0 B"
 *   formatBytes(1023)         → "1023 B"
 *   formatBytes(1024)         → "1.0 KB"
 *   formatBytes(1048576)      → "1.0 MB"
 *   formatBytes(1073741824)   → "1.0 GB"
 */
export function formatBytes(bytes: number): string {
  const b = Math.max(0, bytes)
  const KB = 1024
  const MB = KB * 1024
  const GB = MB * 1024

  if (b >= GB) return `${(b / GB).toFixed(1)} GB`
  if (b >= MB) return `${(b / MB).toFixed(1)} MB`
  if (b >= KB) return `${(b / KB).toFixed(1)} KB`
  return `${b} B`
}
