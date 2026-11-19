import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiFetch } from './http'
import { latestOnly } from './latestOnly'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function failureOf(request: Promise<unknown>): Promise<unknown> {
  return request.then(
    () => 'resolved',
    (error: unknown) => error,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// Answers like a real fetch: stays pending until told to respond, and rejects once its signal aborts.
function fakeAbortableFetch() {
  const pending: Array<(response: Response) => void> = []
  const pendingFetch: typeof fetch = (_input, init) =>
    new Promise<Response>((resolve, reject) => {
      pending.push(resolve)
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      })
    })
  vi.stubGlobal('fetch', vi.fn(pendingFetch))
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
