export function calendar(name: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: name,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
}
export function civil(at: number, formatter: Intl.DateTimeFormat) {
  const p = Object.fromEntries(
    formatter.formatToParts(new Date(at * 1000)).map((p) => [p.type, p.value]),
  )
  return {
    date: Date.UTC(Number(p['year']), Number(p['month']) - 1, Number(p['day'])) / 1000,
    minute: Number(p['hour']) * 60 + Number(p['minute']),
  }
}
export function local(date: number, minute: number, formatter: Intl.DateTimeFormat): number | null {
  if (minute === 1440) {
    date += 86400
    minute = 0
  }
  const nominal = date + minute * 60
  // Bounded demo conversion using the host IANA database. Search in UTC order:
  // a gap has no match, and a fold chooses its earlier instant, as the backend does.
  for (let at = nominal - 14 * 3600; at <= nominal + 14 * 3600; at += 60) {
    const c = civil(at, formatter)
    if (c.date === date && c.minute === minute) return at
  }
  return null
}
