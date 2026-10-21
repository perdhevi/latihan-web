import { useMutation } from '@tanstack/react-query'
import { unwrap, unwrapWithResponse } from '../../api/client'
import { useAuth } from '../../auth/context'

const fallbackName = 'latihan-export.json'

/**
 * The file name from a Content-Disposition header (`filename*=UTF-8''…` or
 * `filename="…"`), without any path, or the default name.
 */
export function filenameFrom(header: string | null): string {
  if (header === null) return fallbackName
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header)
  let name: string | undefined
  try {
    name = encoded !== null ? decodeURIComponent(encoded[1].trim()) : plain?.[1].trim()
  } catch {
    name = plain?.[1].trim()
  }
  // A name, never a path: the browser should not be told where to write.
  const base = name?.split(/[\\/]/).pop()?.trim()
  return base === undefined || base === '' || base === '.' || base === '..' ? fallbackName : base
}

/** Hands the browser a file to save, as a link to it would. */
export function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  // The download has started from the URL; let it go once it has been read.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Downloads everything the server holds about the user, as the server
 * writes it. The response is read as a file, not parsed: the user keeps the
 * server's document byte for byte. Rate limited (4 an hour by default).
 */
export function useExport() {
  const { api } = useAuth()
  return useMutation({
    mutationFn: async () => {
      const { data, response } = await unwrapWithResponse(api.GET('/api/v1/account/export', { parseAs: 'blob' }))
      const name = filenameFrom(response.headers.get('Content-Disposition'))
      saveFile(data as Blob, name)
      return name
    },
  })
}

/**
 * Erases the profile, its data and the login account (`DELETE /account`).
 * Repeating it is harmless, so a retry after a lost answer is safe.
 */
export function useErase() {
  const { api } = useAuth()
  return useMutation({
    mutationFn: () => unwrap(api.DELETE('/api/v1/account')),
  })
}
