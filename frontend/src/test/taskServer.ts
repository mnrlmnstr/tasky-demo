import { vi } from 'vitest'

import type { TaskRead } from '../api/generated/client'
import { requestUrl } from './requestUrl'

interface SentChange {
  method: string
  path: string
  body: unknown
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * Stands in for `fetch` like the real API holding `rows`: it lists them by page and status filter as they are
 * at that moment, and applies a PATCH or a DELETE to them. A change can be held back to look at the page
 * while it is in flight, or made to fail.
 */
export function taskServer(rows: TaskRead[]) {
  const changes: SentChange[] = []
  let lists = 0
  let gate = Promise.resolve()
  let failure: number | 'offline' | null = null
  let offline = false

  function list(query: URLSearchParams): Response {
    lists += 1
    const page = Number(query.get('page'))
    const pageSize = Number(query.get('page_size'))
    const status = query.get('status')
    const matching = rows.filter((row) => status === null || row.status === status)
    return json({
      items: matching.slice((page - 1) * pageSize, page * pageSize),
      total: matching.length,
      page,
      page_size: pageSize,
      pages: Math.ceil(matching.length / pageSize),
    })
  }

  const answer: typeof fetch = async (input, init) => {
    const url = requestUrl(input)
    const { method, body } = init as RequestInit
    if (method === 'GET') {
      if (offline) throw new TypeError('Failed to fetch')
      return list(url.searchParams)
    }
    const sent = typeof body === 'string' ? JSON.parse(body) : undefined
    changes.push({ method: String(method), path: decodeURIComponent(url.pathname), body: sent })
    await gate
    if (failure === 'offline') throw new TypeError('Failed to fetch')
    if (failure !== null) return json({}, failure)
    const index = rows.findIndex((row) => decodeURIComponent(url.pathname).endsWith(`/${row.id}`))
    if (index === -1) return json({ detail: 'Task not found' }, 404)
    if (method === 'DELETE') {
      rows.splice(index, 1)
      return new Response(null, { status: 204 })
    }
    rows[index] = { ...rows[index], ...sent }
    return json(rows[index])
  }
  vi.stubGlobal('fetch', vi.fn(answer))

  return {
    /** The PATCH and DELETE requests sent so far, in order. */
    changes,
    /** How many times the list was asked for. */
    get lists() {
      return lists
    },
    /** Keeps every change from now on unanswered until the returned function is called. */
    hold(): () => void {
      let release!: () => void
      gate = new Promise<void>((resolve) => {
        release = resolve
      })
      return release
    },
    /** Makes every change from now on fail: with this HTTP status, or with a lost connection; `null` applies them again. */
    failChanges(how: number | 'offline' | null): void {
      failure = how
    },
    /** Makes every list request from now on fail with a lost connection, or answers them again. */
    loseListConnection(lost = true): void {
      offline = lost
    },
  }
}
