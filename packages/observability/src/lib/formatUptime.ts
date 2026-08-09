/**
 * formatUptime — compact human-readable uptime from seconds.
 *
 * Examples:
 *   formatUptime(0)       → "<1m"
 *   formatUptime(-30)     → "<1m"
 *   formatUptime(45)      → "<1m"
 *   formatUptime(90)      → "1m"
 *   formatUptime(3720)    → "1h 2m"
 *   formatUptime(90000)   → "1d 1h"
 */
export function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))

  const MINUTE = 60
  const HOUR = 3600
  const DAY = 86400

  if (s < MINUTE) return '<1m'

  const days = Math.floor(s / DAY)
  const hours = Math.floor((s % DAY) / HOUR)
  const minutes = Math.floor((s % HOUR) / MINUTE)

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  return `${minutes}m`
}
