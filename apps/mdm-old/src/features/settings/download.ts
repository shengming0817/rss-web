/** Public artifacts only; callers never pass credentials or private keys. */
export function downloadPublic(name: string, value: string) {
  const url = URL.createObjectURL(new Blob([value], { type: 'application/octet-stream' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
