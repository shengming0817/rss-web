import { afterEach, expect, it, vi } from 'vitest'
import { downloadPublic } from './download'
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('delivers the exact public artifact filename and releases its temporary browser URL', () => {
  vi.useFakeTimers()
  const createObjectURL = vi.fn((blob: Blob) => {
      expect(blob).toBeInstanceOf(Blob)
      return 'blob:public-csr'
    }),
    revokeObjectURL = vi.fn()
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
  let clicked: { download: string; href: string } | undefined
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked = { download: this.download, href: this.href }
  })
  const publicCsr = '-----BEGIN CERTIFICATE REQUEST-----\nPUBLIC\n-----END CERTIFICATE REQUEST-----'
  downloadPublic('apns-2.csr', publicCsr)
  expect(clicked?.download).toBe('apns-2.csr')
  expect(clicked?.href).toBe('blob:public-csr')
  const blob = createObjectURL.mock.calls[0]?.[0] as Blob | undefined
  expect(blob?.size).toBe(new TextEncoder().encode(publicCsr).byteLength)
  expect(blob?.type).toBe('application/octet-stream')
  expect(revokeObjectURL).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1000)
  expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:public-csr')
})
