const NO_CONTENT = 204
const NOT_FOUND = 404
const UNPROCESSABLE = 422
const FIRST_SERVER_ERROR = 500
// What a proxy in front of the API (the dev server, the frontend container) answers when the backend
// behind it is down or does not answer: to the user, the server could not be reached.
const UNREACHABLE = new Set([502, 503, 504])

// `client` is any other 4xx: the request was refused (unauthorised, a conflict, too many requests), which the
// server did not fail at. It has no message of its own.
export type ApiErrorKind = 'not_found' | 'validation' | 'network' | 'aborted' | 'client' | 'server'

export interface FieldError {
  field: string
  type: string
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | undefined
  readonly fieldErrors: readonly FieldError[]

  constructor(kind: ApiErrorKind, status?: number, fieldErrors: readonly FieldError[] = []) {
    super(kind)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

/**
 * The kind of a failed request, for its message. The client rejects with an `ApiError`; anything else
 * (a bug, a broken response) is still reported, as a server error, rather than not at all.
 */
export function failureKind(failure: unknown): ApiErrorKind {
  return failure instanceof ApiError ? failure.kind : 'server'
}

// The caller's signal decides: an abort with a custom reason or a timeout does not reject with an AbortError.
function interrupted(options: RequestInit): ApiError {
  return new ApiError(options.signal?.aborted ? 'aborted' : 'network')
}

async function send(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options)
  } catch {
    throw interrupted(options)
  }
}

const NOT_JSON = Symbol('not JSON')

// A body that never fully arrives is a lost connection; only one that arrives and does not parse is not JSON.
async function readJson(response: Response, options: RequestInit): Promise<unknown> {
  let text: string
  try {
    text = await response.text()
  } catch {
    throw interrupted(options)
  }
  try {
    return JSON.parse(text)
  } catch {
    return NOT_JSON
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toFieldError(entry: unknown): FieldError[] {
  if (!isRecord(entry) || !Array.isArray(entry.loc) || entry.loc.length === 0 || typeof entry.type !== 'string') {
    return []
  }
  return [{ field: String(entry.loc[entry.loc.length - 1]), type: entry.type }]
}

function toFieldErrors(body: unknown): FieldError[] {
  if (!isRecord(body) || !Array.isArray(body.detail)) {
    return []
  }
  return body.detail.flatMap(toFieldError)
}

async function failureOf(response: Response, options: RequestInit): Promise<ApiError> {
  if (response.status === NOT_FOUND) {
    return new ApiError('not_found', response.status)
  }
  if (response.status === UNPROCESSABLE) {
    return new ApiError('validation', response.status, toFieldErrors(await readJson(response, options)))
  }
  if (UNREACHABLE.has(response.status)) {
    return new ApiError('network', response.status)
  }
  if (response.status < FIRST_SERVER_ERROR) {
    return new ApiError('client', response.status)
  }
  return new ApiError('server', response.status)
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await send(url, options)
  if (!response.ok) {
    throw await failureOf(response, options)
  }
  if (response.status === NO_CONTENT) {
    return undefined as T
  }
  const body = await readJson(response, options)
  if (body === NOT_JSON) {
    throw new ApiError('server', response.status)
  }
  return body as T
}
