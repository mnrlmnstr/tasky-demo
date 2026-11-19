export const API_BASE_URL = '/api/v1'

const NO_CONTENT = 204
const NOT_FOUND = 404
const UNPROCESSABLE = 422

export type ApiErrorKind = 'not_found' | 'validation' | 'network' | 'aborted' | 'server'

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

// The OpenAPI spec lists full paths, so generated callers arrive with the base already in place.
function underBase(path: string): string {
  const alreadyUnderBase = path === API_BASE_URL || path.startsWith(`${API_BASE_URL}/`)
  return alreadyUnderBase ? path : `${API_BASE_URL}${path}`
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
}

async function send(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options)
  } catch (error) {
    throw new ApiError(isAbort(error) ? 'aborted' : 'network')
  }
}

const NOT_JSON = Symbol('not JSON')

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    if (isAbort(error)) {
      throw new ApiError('aborted')
    }
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

async function failureOf(response: Response): Promise<ApiError> {
  if (response.status === NOT_FOUND) {
    return new ApiError('not_found', response.status)
  }
  if (response.status === UNPROCESSABLE) {
    return new ApiError('validation', response.status, toFieldErrors(await readJson(response)))
  }
  return new ApiError('server', response.status)
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await send(underBase(url), options)
  if (!response.ok) {
    throw await failureOf(response)
  }
  if (response.status === NO_CONTENT) {
    return undefined as T
  }
  const body = await readJson(response)
  if (body === NOT_JSON) {
    throw new ApiError('server', response.status)
  }
  return body as T
}

// Wraps a request so that starting it again aborts the call still in flight.
export function latestOnly<Args extends unknown[], T>(
  request: (signal: AbortSignal, ...args: Args) => Promise<T>,
): (...args: Args) => Promise<T> {
  let inFlight: AbortController | undefined
  return (...args) => {
    inFlight?.abort()
    inFlight = new AbortController()
    return request(inFlight.signal, ...args)
  }
}
