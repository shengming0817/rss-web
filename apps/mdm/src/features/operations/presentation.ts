/** UTC seconds from domain contracts; never reinterpret as browser local time. */
export function utc(seconds: number) {
  return seconds <= 253402300799 ? new Date(seconds * 1000).toISOString() : String(seconds)
}
