import { afterEach, describe, expect, it, vi } from 'vitest'

import { createTask, getListTasksUrl, listTasks } from './generated/client'
import { apiFetch } from './http'
import { latestOnly } from './latestOnly'

function fakeFetch(implementation: typeof fetch) {
  const fetchFake = vi.fn(implementation)
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

// A response whose headers arrived but whose body dies on the wire, as when the connection drops mid-download.
function brokenBodyResponse(status: number): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new TypeError('network error'))
    },
  })
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('API client contract', () => {
  it('reports a connection lost while a successful body was being read as network, not server', async () => {
    fakeFetch(async () => brokenBodyResponse(200))

    await expect(apiFetch('/tasks')).rejects.toMatchObject({ name: 'ApiError', kind: 'network' })
  })

  it('leaves a filter that is null out of the list query string', () => {
    expect(getListTasksUrl({ status: null, search: null } as never)).toBe('/api/v1/tasks')
  })

  it('does not ask the API for tasks whose status or search is the text "null"', async () => {
    const fetchFake = fakeFetch(
      async () =>
        new Response(JSON.stringify({ items: [], total: 0, page: 1, page_size: 20, pages: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )

    await listTasks({ status: null, search: null, page: 1 } as never)

    expect(fetchFake).toHaveBeenCalledWith('/api/v1/tasks?page=1', expect.objectContaining({ method: 'GET' }))
  })

  it('leaves a filter that is undefined out of the list query string', () => {
    expect(getListTasksUrl({ status: undefined, search: undefined, page: 2 })).toBe('/api/v1/tasks?page=2')
  })

  it('reports a connection lost while a validation body was being read as network, not validation', async () => {
    fakeFetch(async () => brokenBodyResponse(422))

    await expect(createTask({ title: '' })).rejects.toMatchObject({ name: 'ApiError', kind: 'network' })
  })

  it('reports a connection lost under a signal that was never aborted as network', async () => {
    fakeFetch(async () => brokenBodyResponse(200))

    const request = listTasks({ page: 1 }, { signal: new AbortController().signal })

    await expect(request).rejects.toMatchObject({ name: 'ApiError', kind: 'network' })
  })

  it('rejects a list call superseded while its body was still downloading as aborted', async () => {
    // Headers arrive at once; the body stays open until the request's signal aborts.
    fakeFetch(async (_input, init) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason))
        },
      })
      return new Response(body, { status: 200 })
    })
    const loadPage = latestOnly((signal: AbortSignal, page: number) => listTasks({ page }, { signal }))

    const first = loadPage(1).then(
      () => 'resolved',
      (error: unknown) => error,
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    void loadPage(2).catch(() => undefined)

    expect(await first).toMatchObject({ name: 'ApiError', kind: 'aborted' })
  })

  it('aborts the call in flight when the next call fails before it is sent', async () => {
    const signals: AbortSignal[] = []
    const load = latestOnly((signal: AbortSignal, fail: boolean) => {
      signals.push(signal)
      if (fail) throw new Error('could not build the request')
      return new Promise<void>(() => undefined)
    })

    void load(false)
    expect(() => load(true)).toThrow('could not build the request')

    expect(signals[0].aborted).toBe(true)
  })
})
