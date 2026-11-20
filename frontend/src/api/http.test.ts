import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, apiFetch, failureKind } from './http'

function fakeFetch(implementation: typeof fetch) {
  const fetchFake = vi.fn(implementation)
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiFetch', () => {
  it('resolves with the parsed JSON body of a successful response', async () => {
    fakeFetch(async () => jsonResponse({ id: 7, title: 'Buy milk' }))

    const task = await apiFetch<{ id: number; title: string }>('/api/v1/tasks/7', { method: 'GET' })

    expect(task).toEqual({ id: 7, title: 'Buy milk' })
  })

  it('passes the request options through to fetch unchanged', async () => {
    const fetchFake = fakeFetch(async () => jsonResponse({ id: 1 }, 201))
    const signal = new AbortController().signal
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"title":"Buy milk"}',
      signal,
    }

    await apiFetch('/api/v1/tasks', options)

    expect(fetchFake).toHaveBeenCalledWith('/api/v1/tasks', options)
  })

  it('works without request options', async () => {
    fakeFetch(async () => jsonResponse({ status: 'ok' }))

    await expect(apiFetch('/api/v1/health')).resolves.toEqual({ status: 'ok' })
  })

  it.each([
    ['a generated path', '/api/v1/tasks/7'],
    ['a path with a query string', '/api/v1/tasks?page=2&page_size=10'],
    ['a path outside the API', '/status'],
  ])('requests %s exactly as given', async (_name, url) => {
    const fetchFake = fakeFetch(async () => jsonResponse({}))

    await apiFetch(url)

    expect(fetchFake).toHaveBeenCalledWith(url, {})
  })

  it('resolves with undefined when the response has no content', async () => {
    fakeFetch(async () => new Response(null, { status: 204 }))

    await expect(apiFetch('/api/v1/tasks/7', { method: 'DELETE' })).resolves.toBeUndefined()
  })
})

// A response whose headers arrived but whose body fails while it is read.
function brokenBodyResponse(status: number, failure: unknown = new TypeError('network error')): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(failure)
    },
  })
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
}

function abortedSignal(reason?: unknown): AbortSignal {
  const controller = new AbortController()
  controller.abort(reason)
  return controller.signal
}

async function failureOf(request: Promise<unknown>): Promise<unknown> {
  return request.then(
    () => 'resolved',
    (error: unknown) => error,
  )
}

describe('apiFetch errors', () => {
  it('rejects with an ApiError that is a real Error', async () => {
    fakeFetch(async () => jsonResponse({ detail: 'Task not found' }, 404))

    const failure = await failureOf(apiFetch('/api/v1/tasks/999'))

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toBeInstanceOf(Error)
    expect(failure).toMatchObject({ name: 'ApiError' })
  })

  it('reports a 404 response as not_found', async () => {
    fakeFetch(async () => jsonResponse({ detail: 'Task not found' }, 404))

    const failure = await failureOf(apiFetch('/api/v1/tasks/999'))

    expect(failure).toMatchObject({ kind: 'not_found', status: 404, fieldErrors: [] })
  })

  it.each([
    ['500 with a JSON body', () => jsonResponse({ detail: 'Internal server error' }, 500), 500],
    ['501', () => jsonResponse({ detail: 'Not implemented' }, 501), 501],
    ['400', () => jsonResponse({ detail: 'Bad request' }, 400), 400],
    ['409', () => jsonResponse({ detail: 'Conflict' }, 409), 409],
  ])('reports a %s response as server', async (_name, respond, status) => {
    fakeFetch(async () => respond())

    const failure = await failureOf(apiFetch('/api/v1/tasks'))

    expect(failure).toMatchObject({ kind: 'server', status, fieldErrors: [] })
  })

  // The app reaches the API through a proxy (the dev server, the frontend container): with the backend
  // stopped, the proxy answers in its place, so the server could not be reached, as with a lost connection.
  it.each([
    ['502 Bad Gateway', 502],
    ['503 Service Unavailable', 503],
    ['504 Gateway Timeout', 504],
  ])('reports a %s from the proxy in front of the API as network', async (_name, status) => {
    fakeFetch(async () => new Response('Bad Gateway', { status, headers: { 'Content-Type': 'text/plain' } }))

    const failure = await failureOf(apiFetch('/api/v1/tasks'))

    expect(failure).toMatchObject({ kind: 'network', status, fieldErrors: [] })
  })

  it.each([
    [
      'an HTML page',
      () =>
        new Response('<!doctype html><html><body></body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
    ],
    [
      'truncated JSON',
      () => new Response('{"status": "ok"', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ],
    ['an empty body', () => new Response(null, { status: 200 })],
  ])('reports a successful response carrying %s as server', async (_name, respond) => {
    fakeFetch(async () => respond())

    const failure = await failureOf(apiFetch('/api/v1/health'))

    expect(failure).toMatchObject({ kind: 'server', status: 200, fieldErrors: [] })
  })

  it('reports a request that could not reach the API as network', async () => {
    fakeFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    const failure = await failureOf(apiFetch('/api/v1/tasks'))

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({ kind: 'network', status: undefined, fieldErrors: [] })
  })

  it.each([
    ['without a reason', () => abortedSignal(), new DOMException('The operation was aborted.', 'AbortError')],
    ['with a custom reason', () => abortedSignal(new Error('filters changed')), new Error('filters changed')],
    ['with a reason that is not an Error', () => abortedSignal('filters changed'), 'filters changed'],
    ['by a timeout', () => AbortSignal.timeout(0), new DOMException('The operation timed out.', 'TimeoutError')],
  ])('reports a request whose signal was aborted %s as aborted', async (_name, makeSignal, rejection) => {
    const signal = makeSignal()
    await new Promise((resolve) => setTimeout(resolve, 5))
    fakeFetch(() => Promise.reject(rejection))

    const failure = await failureOf(apiFetch('/api/v1/tasks', { signal }))

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({ kind: 'aborted', status: undefined, fieldErrors: [] })
  })

  it('reports a failed request whose signal was never aborted as network', async () => {
    fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')))

    const failure = await failureOf(apiFetch('/api/v1/tasks', { signal: new AbortController().signal }))

    expect(failure).toMatchObject({ kind: 'network' })
  })

  it.each([
    ['a successful response', 200],
    ['a 422 response', 422],
  ])('reports a request aborted while the body of %s was being read as aborted', async (_name, status) => {
    const controller = new AbortController()
    fakeFetch(async () => {
      controller.abort()
      return brokenBodyResponse(status, controller.signal.reason)
    })

    const failure = await failureOf(apiFetch('/api/v1/tasks', { signal: controller.signal }))

    expect(failure).toMatchObject({ kind: 'aborted', status: undefined })
  })

  it.each([
    ['a successful response', 200],
    ['a 201 response', 201],
    ['a 422 response', 422],
  ])('reports a connection lost while the body of %s was being read as network', async (_name, status) => {
    fakeFetch(async () => brokenBodyResponse(status))

    const failure = await failureOf(apiFetch('/api/v1/tasks'))

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({ kind: 'network', status: undefined, fieldErrors: [] })
  })

  it.each([
    ['404', 404, 'not_found'],
    ['500', 500, 'server'],
  ])('reports a %s response by its status even when its body cannot be read', async (_name, status, kind) => {
    fakeFetch(async () => brokenBodyResponse(status))

    const failure = await failureOf(apiFetch('/api/v1/tasks/7'))

    expect(failure).toMatchObject({ kind, status })
  })

  it('reports a 422 response as validation with the type of each field error', async () => {
    fakeFetch(async () =>
      jsonResponse(
        {
          detail: [
            { loc: ['body', 'title'], msg: 'Field required', type: 'missing', input: {} },
            { loc: ['body', 'priority'], msg: 'Input should be low, medium or high', type: 'enum', input: 'urgent' },
          ],
        },
        422,
      ),
    )

    const failure = await failureOf(apiFetch('/api/v1/tasks', { method: 'POST', body: '{}' }))

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({
      kind: 'validation',
      status: 422,
      fieldErrors: [
        { field: 'title', type: 'missing' },
        { field: 'priority', type: 'enum' },
      ],
    })
  })

  it.each([
    ['a query parameter', ['query', 'limit'], 'limit'],
    ['a path parameter', ['path', 'task_id'], 'task_id'],
    ['a list item, by its index', ['body', 'tags', 0], '0'],
    ['the whole body', ['body'], 'body'],
  ])('names the field of a 422 error on %s by the last location segment', async (_name, loc, field) => {
    fakeFetch(async () => jsonResponse({ detail: [{ loc, msg: 'Invalid', type: 'int_parsing' }] }, 422))

    const failure = await failureOf(apiFetch('/api/v1/tasks'))

    expect(failure).toMatchObject({ fieldErrors: [{ field, type: 'int_parsing' }] })
  })

  it.each([
    ['a body that is not JSON', () => new Response('Unprocessable', { status: 422 })],
    ['a null body', () => jsonResponse(null, 422)],
    ['a bare string body', () => jsonResponse('invalid', 422)],
    ['no detail', () => jsonResponse({}, 422)],
    ['a detail that is not a list', () => jsonResponse({ detail: 'Invalid request' }, 422)],
    ['an empty detail list', () => jsonResponse({ detail: [] }, 422)],
  ])('reports a 422 response with %s as validation without field errors', async (_name, respond) => {
    fakeFetch(async () => respond())

    const failure = await failureOf(apiFetch('/api/v1/tasks'))

    expect(failure).toMatchObject({ kind: 'validation', status: 422, fieldErrors: [] })
  })

  it.each([
    ['null', null],
    ['a string', 'missing'],
    ['an entry without a location', { type: 'missing' }],
    ['an entry whose location is not a list', { loc: 'title', type: 'missing' }],
    ['an entry with an empty location', { loc: [], type: 'missing' }],
    ['an entry without a type', { loc: ['body', 'title'] }],
    ['an entry whose type is not a string', { loc: ['body', 'title'], type: 7 }],
  ])('skips a 422 detail entry that is %s and keeps the well-formed ones', async (_name, malformed) => {
    fakeFetch(async () =>
      jsonResponse({ detail: [malformed, { loc: ['body', 'status'], msg: 'Invalid', type: 'enum' }] }, 422),
    )

    const failure = await failureOf(apiFetch('/api/v1/tasks'))

    expect(failure).toMatchObject({ kind: 'validation', fieldErrors: [{ field: 'status', type: 'enum' }] })
  })

  it('reports a rejection that is not an Error as network', async () => {
    fakeFetch(() => Promise.reject('offline'))

    const failure = await failureOf(apiFetch('/api/v1/tasks'))

    expect(failure).toMatchObject({ kind: 'network' })
  })
})

describe('failureKind', () => {
  it.each(['network', 'server', 'not_found', 'validation', 'aborted'] as const)(
    'reads the kind of an ApiError: %s',
    (kind) => {
      expect(failureKind(new ApiError(kind))).toBe(kind)
    },
  )

  it.each([
    ['an ordinary error', new TypeError('boom')],
    ['something that is not an error at all', 'boom'],
  ])('reports %s as a server error, so it still gets a message', (_name, failure) => {
    expect(failureKind(failure)).toBe('server')
  })
})
