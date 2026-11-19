import { afterEach, describe, expect, it, vi } from 'vitest'

import { createTask, deleteTask, getHealth, getTask, listTasks, updateTask, type TaskRead } from './generated/client'

const TASK_ID = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b'

const task: TaskRead = {
  id: TASK_ID,
  title: 'Buy milk',
  description: null,
  status: 'todo',
  priority: 'high',
  deadline: null,
  created_at: '2026-01-05T10:00:00Z',
  updated_at: '2026-01-05T10:00:00Z',
}

// The backend is the one part replaced here: the generated functions and the HTTP layer run for real.
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

describe('generated API client', () => {
  it('reads the health status with GET /api/v1/health', async () => {
    const fetchFake = fakeFetch(async () => jsonResponse({ status: 'ok' }))

    const health = await getHealth()

    expect(health).toEqual({ status: 'ok' })
    expect(fetchFake).toHaveBeenCalledWith('/api/v1/health', expect.objectContaining({ method: 'GET' }))
  })

  it('lists tasks with GET /api/v1/tasks and the filters in the query string', async () => {
    const page = { items: [task], total: 1, page: 2, page_size: 10, pages: 2 }
    const fetchFake = fakeFetch(async () => jsonResponse(page))

    const listed = await listTasks({ status: 'todo', search: 'milk', ordering: '-deadline', page: 2, page_size: 10 })

    expect(listed).toEqual(page)
    expect(fetchFake).toHaveBeenCalledWith(
      '/api/v1/tasks?status=todo&search=milk&ordering=-deadline&page=2&page_size=10',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('lists tasks without a query string when no filters are given', async () => {
    const fetchFake = fakeFetch(async () => jsonResponse({ items: [], total: 0, page: 1, page_size: 20, pages: 0 }))

    await listTasks()

    expect(fetchFake).toHaveBeenCalledWith('/api/v1/tasks', expect.objectContaining({ method: 'GET' }))
  })

  it('hands the abort signal of a list request to fetch', async () => {
    const fetchFake = fakeFetch(async () => jsonResponse({ items: [], total: 0, page: 1, page_size: 20, pages: 0 }))
    const signal = new AbortController().signal

    await listTasks({ page: 1 }, { signal })

    expect(fetchFake).toHaveBeenCalledWith('/api/v1/tasks?page=1', expect.objectContaining({ signal }))
  })

  it('creates a task with POST /api/v1/tasks and a JSON body', async () => {
    const fetchFake = fakeFetch(async () => jsonResponse(task, 201))

    const created = await createTask({ title: 'Buy milk', priority: 'high' })

    expect(created).toEqual(task)
    expect(fetchFake).toHaveBeenCalledWith('/api/v1/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"title":"Buy milk","priority":"high"}',
    })
  })

  it('reads one task with GET /api/v1/tasks/{id}', async () => {
    const fetchFake = fakeFetch(async () => jsonResponse(task))

    const found = await getTask(TASK_ID)

    expect(found).toEqual(task)
    expect(fetchFake).toHaveBeenCalledWith(`/api/v1/tasks/${TASK_ID}`, expect.objectContaining({ method: 'GET' }))
  })

  it('updates a task with PATCH /api/v1/tasks/{id} and only the fields given', async () => {
    const fetchFake = fakeFetch(async () => jsonResponse({ ...task, status: 'done' }))

    const updated = await updateTask(TASK_ID, { status: 'done' })

    expect(updated).toEqual({ ...task, status: 'done' })
    expect(fetchFake).toHaveBeenCalledWith(`/api/v1/tasks/${TASK_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{"status":"done"}',
    })
  })

  it('deletes a task with DELETE /api/v1/tasks/{id} and resolves with nothing', async () => {
    const fetchFake = fakeFetch(async () => new Response(null, { status: 204 }))

    const deleted = await deleteTask(TASK_ID)

    expect(deleted).toBeUndefined()
    expect(fetchFake).toHaveBeenCalledWith(`/api/v1/tasks/${TASK_ID}`, expect.objectContaining({ method: 'DELETE' }))
  })

  it('rejects with a not_found ApiError when the task does not exist', async () => {
    fakeFetch(async () => jsonResponse({ detail: 'Task not found' }, 404))

    await expect(getTask(TASK_ID)).rejects.toMatchObject({ name: 'ApiError', kind: 'not_found', status: 404 })
  })

  it('rejects with the field errors when the API refuses a new task', async () => {
    const detail = [{ loc: ['body', 'title'], msg: 'String should have at least 1 character', type: 'string_too_short' }]
    fakeFetch(async () => jsonResponse({ detail }, 422))

    await expect(createTask({ title: '' })).rejects.toMatchObject({
      kind: 'validation',
      fieldErrors: [{ field: 'title', type: 'string_too_short' }],
    })
  })

  it('rejects with a network ApiError when the API cannot be reached', async () => {
    fakeFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    await expect(getHealth()).rejects.toMatchObject({ name: 'ApiError', kind: 'network' })
  })
})
