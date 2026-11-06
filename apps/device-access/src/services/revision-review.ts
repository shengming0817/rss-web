import { useState } from 'react'
import { useRead } from './read'
export function useRevisionReview<T extends { id: string; revision: number }>(
  initial: T | null,
  load: (id: string, signal: AbortSignal) => Promise<T>,
) {
  const [revision, setRevision] = useState(initial?.revision ?? 0)
  const reader = useRead(
    async (signal) => {
      const value = await load(initial!.id, signal)
      if (value.id !== initial!.id) throw new Error('Wrong detail')
      return value
    },
    initial?.id ?? '',
    false,
  )
  const [current, setCurrent] = useState<T>()
  async function refresh() {
    setCurrent(undefined)
    const value = await reader.reload()
    if (value) setCurrent(value)
  }
  return {
    revision,
    current,
    busy: reader.busy,
    error: reader.error,
    refresh,
    accept: () => {
      if (!current) return false
      setRevision(current.revision)
      setCurrent(undefined)
      return true
    },
  }
}
