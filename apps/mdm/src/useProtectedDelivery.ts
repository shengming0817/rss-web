import { useEffect, useRef, useState } from 'react'
import { useSecretVisibility } from './SecretTabs'
interface File {
  readonly bytes: ArrayBuffer
  readonly contentType: string
  readonly filename: string
}
/** Component-owned disclosure and Blob lifetime only. It never retries or stores a write intent. */
export function useProtectedDelivery(clearInputs: () => void = () => {}, permitted = true) {
  const visible = useSecretVisibility() && permitted,
    visibleNow = useRef(visible)
  visibleNow.current = visible
  const generation = useRef(0),
    live = useRef(true),
    inputClear = useRef(clearInputs),
    file = useRef<{ bytes: ArrayBuffer; url: string } | null>(null),
    [download, setDownload] = useState<{ url: string; filename: string } | null>(null)
  inputClear.current = clearInputs
  function clear() {
    generation.current++
    const current = file.current
    file.current = null
    if (current) {
      URL.revokeObjectURL(current.url)
      new Uint8Array(current.bytes).fill(0)
    }
    if (live.current) setDownload(null)
  }
  useEffect(() => {
    if (!visible) {
      clear()
      inputClear.current()
    }
  }, [visible])
  useEffect(() => {
    live.current = true
    const hide = () => {
        if (document.visibilityState === 'hidden') {
          clear()
          inputClear.current()
        }
      },
      leave = () => {
        clear()
        inputClear.current()
      }
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', leave)
    return () => {
      live.current = false
      clear()
      inputClear.current()
      document.removeEventListener('visibilitychange', hide)
      window.removeEventListener('pagehide', leave)
    }
  }, [])
  return {
    download,
    clear,
    capture: () => generation.current,
    isCurrent: (expectedGeneration: number) =>
      live.current &&
      visibleNow.current &&
      document.visibilityState === 'visible' &&
      expectedGeneration === generation.current,
    deliver(value: File, expectedGeneration: number): boolean {
      if (
        !live.current ||
        !visibleNow.current ||
        document.visibilityState !== 'visible' ||
        expectedGeneration !== generation.current
      ) {
        new Uint8Array(value.bytes).fill(0)
        return false
      }
      clear()
      try {
        const url = URL.createObjectURL(new Blob([value.bytes], { type: value.contentType }))
        file.current = { bytes: value.bytes, url }
        setDownload({ url, filename: value.filename })
        return true
      } catch (error) {
        new Uint8Array(value.bytes).fill(0)
        throw error
      }
    },
  }
}
/** Ephemeral comparison for re-entered private input; never an authorization or persisted proof. */
export async function inputFingerprint(value: string): Promise<string> {
  const input = new TextEncoder().encode(value)
  try {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', input))]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  } finally {
    input.fill(0)
  }
}
export function generateEnrollmentSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  try {
    return btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '')
  } finally {
    bytes.fill(0)
  }
}
