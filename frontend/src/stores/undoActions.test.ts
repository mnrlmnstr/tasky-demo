import { flushPromises } from '@vue/test-utils'
import { createPinia, disposePinia, getActivePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskRead } from '../api/generated/client'
import { requestUrl } from '../test/requestUrl'
import { pageOf, task } from '../test/tasksApi'
import { useTasksStore } from './tasks'
import { useUndoStore } from './undo'
import { offerUndoOfCreate, offerUndoOfEdit, offerUndoOfStatusChange } from './undoActions'

interface SentRequest {
  method: string
  path: string
  body: unknown
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * Answers at once, like a server holding `rows`: a list request gets the rows as they are at that moment,
 * a change gets what `change` returns (by default: no content).
 */
function fakeServer(rows: TaskRead[], change: (request: SentRequest) => Response = () => new Response(null, { status: 204 })) {
  const sent: SentRequest[] = []
  const answer: typeof fetch = async (input, init) => {
    const request: SentRequest = {
      method: init?.method ?? 'GET',
      path: requestUrl(input).pathname,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    sent.push(request)
    if (request.method === 'GET') return json({ ...pageOf([]), items: [...rows], total: rows.length })
    return change(request)
  }
  vi.stubGlobal('fetch', vi.fn(answer))
  return {
    rows,
    get changes() {
      return sent.filter((request) => request.method !== 'GET')
    },
    get listRequests() {
      return sent.filter((request) => request.method === 'GET').length
    },
  }
}

async function openList() {
  const tasks = useTasksStore()
  tasks.start()
  await flushPromises()
  return tasks
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
  const pinia = getActivePinia()
  if (pinia) disposePinia(pinia)
})

describe('undo of a create', () => {
  it('offers the undo under the "created" label', () => {
    fakeServer([])

    offerUndoOfCreate(task('Write report', { id: 'task-1' }))

    expect(useUndoStore().label).toBe('created')
  })

  it('deletes the created task and reloads the list', async () => {
    const created = task('Write report', { id: 'task-1' })
    const server = fakeServer([created, task('Older')], () => {
      server.rows.shift()
      return new Response(null, { status: 204 })
    })
    const tasks = await openList()
    offerUndoOfCreate(created)

    await useUndoStore().run()
    await flushPromises()

    expect(server.changes).toEqual([{ method: 'DELETE', path: '/api/v1/tasks/task-1', body: undefined }])
    expect(server.listRequests).toBe(2)
    expect(tasks.items.map((row) => row.title)).toEqual(['Older'])
  })
})

describe('undo of an edit', () => {
  it('offers the undo under the "updated" label', () => {
    fakeServer([])
    const before = task('Write report', { id: 'task-1' })

    offerUndoOfEdit(before, { ...before, title: 'Write the report' })

    expect(useUndoStore().label).toBe('updated')
  })

  it('sends back only the previous values of the fields the edit changed', async () => {
    const before = task('Write report', { id: 'task-1', priority: 'low', description: 'Draft' })
    const after: TaskRead = {
      ...before,
      title: 'Write the report',
      priority: 'high',
      updated_at: '2026-01-11T09:00:00Z',
    }
    const server = fakeServer([after], () => json(before))
    await openList()
    offerUndoOfEdit(before, after)

    await useUndoStore().run()

    expect(server.changes).toEqual([
      { method: 'PATCH', path: '/api/v1/tasks/task-1', body: { title: 'Write report', priority: 'low' } },
    ])
  })

  it('sends null to clear a deadline and a description the edit added', async () => {
    const before = task('Write report', { id: 'task-1' })
    const after: TaskRead = { ...before, deadline: '2026-02-01T12:00:00Z', description: 'Draft' }
    const server = fakeServer([after], () => json(before))
    offerUndoOfEdit(before, after)

    await useUndoStore().run()

    expect(server.changes[0].body).toEqual({ deadline: null, description: null })
  })

  it('puts back a deadline and a description the edit cleared', async () => {
    const before = task('Write report', { id: 'task-1', deadline: '2026-02-01T12:00:00Z', description: 'Draft' })
    const after: TaskRead = { ...before, deadline: null, description: null }
    const server = fakeServer([after], () => json(before))
    offerUndoOfEdit(before, after)

    await useUndoStore().run()

    expect(server.changes[0].body).toEqual({ deadline: '2026-02-01T12:00:00Z', description: 'Draft' })
  })

  it('shows the task in the list exactly as it was before the edit', async () => {
    const before = task('Write report', { id: 'task-1', priority: 'low' })
    const after: TaskRead = { ...before, title: 'Write the report', priority: 'high' }
    const server = fakeServer([after], () => {
      server.rows[0] = before
      return json(before)
    })
    const tasks = await openList()
    expect(tasks.items).toEqual([after])
    offerUndoOfEdit(before, after)

    await useUndoStore().run()
    await flushPromises()

    expect(tasks.items).toEqual([before])
  })

  it('offers nothing, and keeps the pending offer, when the edit changed nothing', () => {
    fakeServer([])
    const before = task('Write report', { id: 'task-1' })
    offerUndoOfCreate(before)

    offerUndoOfEdit(before, { ...before, updated_at: '2026-01-11T09:00:00Z' })

    expect(useUndoStore().label).toBe('created')
  })
})

describe('undo of a status change', () => {
  it('offers the undo under the "status changed" label', () => {
    fakeServer([])
    const before = task('Write report', { id: 'task-1' })

    offerUndoOfStatusChange(before, { ...before, status: 'done' })

    expect(useUndoStore().label).toBe('statusChanged')
  })

  it('sends back the previous status and reloads the list', async () => {
    const before = task('Write report', { id: 'task-1', status: 'in_progress' })
    const after: TaskRead = { ...before, status: 'done' }
    const server = fakeServer([after], () => {
      server.rows[0] = before
      return json(before)
    })
    const tasks = await openList()
    offerUndoOfStatusChange(before, after)

    await useUndoStore().run()
    await flushPromises()

    expect(server.changes).toEqual([
      { method: 'PATCH', path: '/api/v1/tasks/task-1', body: { status: 'in_progress' } },
    ])
    expect(tasks.items).toEqual([before])
  })
})

describe('an undo the server refuses', () => {
  it('reports that the task is already gone and shows the list as the server has it', async () => {
    const before = task('Write report', { id: 'task-1', status: 'todo' })
    const after: TaskRead = { ...before, status: 'done' }
    const server = fakeServer([after, task('Other')], () => {
      // Someone else deleted the task in the meantime.
      server.rows.shift()
      return json({ detail: 'Task not found' }, 404)
    })
    const tasks = await openList()
    const undo = useUndoStore()
    offerUndoOfStatusChange(before, after)

    await undo.run()
    await flushPromises()

    expect(undo.error).toBe('not_found')
    expect(undo.label).toBeNull()
    expect(server.listRequests).toBe(2)
    expect(tasks.items.map((row) => row.title)).toEqual(['Other'])
  })

  it('reports a failed delete and still reloads the list', async () => {
    const created = task('Write report', { id: 'task-1' })
    const server = fakeServer([created], () => json({}, 500))
    const tasks = await openList()
    const undo = useUndoStore()
    offerUndoOfCreate(created)

    await undo.run()
    await flushPromises()

    expect(undo.error).toBe('server')
    expect(server.listRequests).toBe(2)
    expect(tasks.items).toEqual([created])
  })
})
