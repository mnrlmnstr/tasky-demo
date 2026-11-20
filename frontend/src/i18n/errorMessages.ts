import type { ApiErrorKind } from '../api/http'

/**
 * The message key that explains a failed request, by its kind. Every kind is listed, so a new one
 * does not compile until it has a message. A lost connection has its own message: the server could
 * not be reached, which is not the same as the server answering with an error.
 */
export const ERROR_MESSAGES: Record<ApiErrorKind, string> = {
  network: 'errors.network',
  server: 'errors.server',
  not_found: 'errors.not_found',
  validation: 'errors.generic',
  aborted: 'errors.generic',
  client: 'errors.generic',
}

export function errorMessageKey(kind: ApiErrorKind): string {
  return ERROR_MESSAGES[kind]
}
