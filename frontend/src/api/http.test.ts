import { afterEach, describe, expect, it, vi } from 'vitest'

import { API_BASE_URL, ApiError, apiFetch, latestOnly } from './http'

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
    ['a path below the base', '/tasks', '/api/v1/tasks'],
    ['a path with a query string', '/tasks?limit=20&offset=0', '/api/v1/tasks?limit=20&offset=0'],
    ['a path that already carries the base', '/api/v1/tasks/7', '/api/v1/tasks/7'],
    ['the base itself', '/api/v1', '/api/v1'],
    ['a path that only shares a prefix with the base', '/api/v10/tasks', '/api/v1/api/v10/tasks'],
  ])('requests %s under the API base URL', async (_name, path, requested) => {
    const fetchFake = fakeFetch(async () => jsonResponse({}))

    await apiFetch(path)

    expect(fetchFake).toHaveBeenCalledWith(requested, {})
  })

  it('exposes the API base URL', () => {
    expect(API_BASE_URL).toBe('/api/v1')
  })

  it('resolves with undefined when the response has no content', async () => {
    fakeFetch(async () => new Response(null, { status: 204 }))

    await expect(apiFetch('/api/v1/tasks/7', { method: 'DELETE' })).resolves.toBeUndefined()
  })
})

// Answers like a real fetch: stays pending until told to respond, and rejects once its signal aborts.
function fakeAbortableFetch() {
  const pending: Array<(response: Response) => void> = []
  fakeFetch(
    (_input, init) =>
      new Promise<Response>((resolve, reject) => {
        pending.push(resolve)
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      }),
  )
  return {
    respondTo(callIndex: number, body: unknown) {
      pending[callIndex](jsonResponse(body))
    },
  }
}

describe('latestOnly', () => {
  it('passes its arguments to the request and resolves with its result', async () => {
    const listTitles = latestOnly(async (_signal: AbortSignal, status: string, limit: number) => [
      `${status}:${limit}`,
    ])

    await expect(listTitles('done', 20)).resolves.toEqual(['done:20'])
  })

  it('hands the request a signal that is not aborted', async () => {
    const signals: AbortSignal[] = []
    const load = latestOnly(async (signal: AbortSignal) => {
      signals.push(signal)
    })

    await load()

    expect(signals).toHaveLength(1)
    expect(signals[0].aborted).toBe(false)
  })

  it('rejects the previous call as aborted when a new call starts, and resolves the new one', async () => {
    const api = fakeAbortableFetch()
    const listTasks = latestOnly((signal: AbortSignal, status: string) =>
      apiFetch<{ items: string[] }>(`/api/v1/tasks?status=${status}`, { signal }),
    )

    const first = failureOf(listTasks('todo'))
    const second = listTasks('done')
    api.respondTo(1, { items: ['Buy milk'] })

    expect(await first).toMatchObject({ kind: 'aborted' })
    await expect(second).resolves.toEqual({ items: ['Buy milk'] })
  })

  it('keeps only the last of several overlapping calls', async () => {
    const api = fakeAbortableFetch()
    const listTasks = latestOnly((signal: AbortSignal, status: string) =>
      apiFetch<{ items: string[] }>(`/api/v1/tasks?status=${status}`, { signal }),
    )

    const first = failureOf(listTasks('todo'))
    const second = failureOf(listTasks('in_progress'))
    const third = listTasks('done')
    api.respondTo(2, { items: [] })

    expect(await first).toMatchObject({ kind: 'aborted' })
    expect(await second).toMatchObject({ kind: 'aborted' })
    await expect(third).resolves.toEqual({ items: [] })
  })

  it('leaves a call that already finished alone when the next one starts', async () => {
    const api = fakeAbortableFetch()
    const listTasks = latestOnly((signal: AbortSignal) => apiFetch<{ items: string[] }>('/api/v1/tasks', { signal }))

    const first = listTasks()
    api.respondTo(0, { items: ['Buy milk'] })
    const firstPage = await first
    const second = listTasks()
    api.respondTo(1, { items: ['Walk the dog'] })

    expect(firstPage).toEqual({ items: ['Buy milk'] })
    await expect(second).resolves.toEqual({ items: ['Walk the dog'] })
  })

  it('does not abort calls made through another latest-only wrapper', async () => {
    const api = fakeAbortableFetch()
    const listTasks = latestOnly((signal: AbortSignal) => apiFetch<{ items: string[] }>('/api/v1/tasks', { signal }))
    const checkHealth = latestOnly((signal: AbortSignal) => apiFetch<{ status: string }>('/api/v1/health', { signal }))

    const tasks = listTasks()
    const health = checkHealth()
    api.respondTo(0, { items: [] })
    api.respondTo(1, { status: 'ok' })

    await expect(tasks).resolves.toEqual({ items: [] })
    await expect(health).resolves.toEqual({ status: 'ok' })
  })
})

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
    ['502 with a text body', () => new Response('Bad Gateway', { status: 502 }), 502],
    ['400', () => jsonResponse({ detail: 'Bad request' }, 400), 400],
    ['409', () => jsonResponse({ detail: 'Conflict' }, 409), 409],
  ])('reports a %s response as server', async (_name, respond, status) => {
    fakeFetch(async () => respond())

    const failure = await failureOf(apiFetch('/api/v1/tasks'))

    expect(failure).toMatchObject({ kind: 'server', status, fieldErrors: [] })
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

  it('reports a request aborted through its signal as aborted', async () => {
    fakeFetch(async () => {
      throw new DOMException('The operation was aborted.', 'AbortError')
    })

    const failure = await failureOf(apiFetch('/api/v1/tasks'))

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({ kind: 'aborted', status: undefined, fieldErrors: [] })
  })

  it('reports a request aborted while its body was being read as aborted', async () => {
    fakeFetch(async () => {
      const response = jsonResponse({ items: [] })
      vi.spyOn(response, 'json').mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'))
      return response
    })

    const failure = await failureOf(apiFetch('/api/v1/tasks'))

    expect(failure).toMatchObject({ kind: 'aborted' })
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

  it('reports a 422 response aborted while its body was being read as aborted', async () => {
    fakeFetch(async () => {
      const response = jsonResponse({ detail: [] }, 422)
      vi.spyOn(response, 'json').mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'))
      return response
    })

    const failure = await failureOf(apiFetch('/api/v1/tasks'))

    expect(failure).toMatchObject({ kind: 'aborted' })
  })

  it('reports a rejection that is not an Error as network', async () => {
    fakeFetch(() => Promise.reject('offline'))

    const failure = await failureOf(apiFetch('/api/v1/tasks'))

    expect(failure).toMatchObject({ kind: 'network' })
  })
})
