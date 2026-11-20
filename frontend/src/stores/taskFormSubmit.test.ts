import { createPinia, disposePinia, getActivePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { requestUrl } from '../test/requestUrl'
import { task } from '../test/tasksApi'
import { onTasksChanged, type TasksChange } from './taskChanges'
import { useTaskFormStore } from './taskForm'
import { useTaskFormSubmit, type TaskFormPayload } from './taskFormSubmit'
import { useUndoStore } from './undo'

interface SentRequest {
  method: string
  path: string
  body: unknown
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// Answers every request with `answer`, and keeps what was sent.
function fakeServer(answer: () => Response) {
  const sent: SentRequest[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        method: init?.method ?? 'GET',
        path: requestUrl(input).pathname,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      })
      return answer()
    }),
  )
  return sent
}

function payload(overrides: Partial<TaskFormPayload> = {}): TaskFormPayload {
  return { title: 'Write report', description: null, status: 'todo', priority: 'medium', deadline: null, ...overrides }
}

function followChanges(): TasksChange[] {
  const changes: TasksChange[] = []
  onTasksChanged((change) => changes.push(change))
  return changes
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
  const pinia = getActivePinia()
  if (pinia) disposePinia(pinia)
})

describe('creating', () => {
  it('sends the filled fields, closes the form, reloads and offers the undo', async () => {
    const sent = fakeServer(() => json(task('Write report', { id: 'task-1' }), 201))
    const changes = followChanges()
    const form = useTaskFormStore()
    form.openCreate()
    const { saving, save } = useTaskFormSubmit()

    const saved = save(payload({ description: 'Draft' }), payload())
    expect(saving.value).toBe(true)

    expect(await saved).toBeNull()
    expect(saving.value).toBe(false)
    expect(sent).toEqual([
      {
        method: 'POST',
        path: '/api/v1/tasks',
        body: { title: 'Write report', description: 'Draft', status: 'todo', priority: 'medium' },
      },
    ])
    expect(form.open).toBe(false)
    expect(changes).toEqual([{}])
    expect(useUndoStore().label).toBe('created')
  })

  it('reports a 404 as a server failure, as there is no task to be missing', async () => {
    fakeServer(() => json({}, 404))
    useTaskFormStore().openCreate()

    expect(await useTaskFormSubmit().save(payload(), payload())).toEqual({ fieldErrors: [], kind: 'server', gone: false })
    expect(useTaskFormStore().open).toBe(true)
  })
})

describe('editing', () => {
  const before = task('Write report', { id: 'task-1' })

  it('sends only the fields that changed and offers the undo of the edit', async () => {
    const sent = fakeServer(() => json({ ...before, priority: 'high' }))
    const form = useTaskFormStore()
    form.openEdit(before)

    expect(await useTaskFormSubmit().save(payload({ priority: 'high' }), payload())).toBeNull()

    expect(sent).toEqual([{ method: 'PATCH', path: '/api/v1/tasks/task-1', body: { priority: 'high' } }])
    expect(form.open).toBe(false)
    expect(useUndoStore().label).toBe('updated')
  })

  it('closes without a request when nothing changed', async () => {
    const sent = fakeServer(() => json(before))
    const form = useTaskFormStore()
    form.openEdit(before)

    expect(await useTaskFormSubmit().save(payload(), payload())).toBeNull()

    expect(sent).toEqual([])
    expect(form.open).toBe(false)
  })

  it('hands the 422 field errors back, with no failure of its own', async () => {
    fakeServer(() => json({ detail: [{ loc: ['body', 'title'], type: 'string_too_long' }] }, 422))
    useTaskFormStore().openEdit(before)

    expect(await useTaskFormSubmit().save(payload({ title: 'Longer' }), payload())).toEqual({
      fieldErrors: [{ field: 'title', type: 'string_too_long' }],
      kind: null,
      gone: false,
    })
    expect(useTaskFormStore().open).toBe(true)
  })

  it('reports the task gone and takes it from the tasks when it was deleted meanwhile', async () => {
    fakeServer(() => json({}, 404))
    const changes = followChanges()
    useTaskFormStore().openEdit(before)

    expect(await useTaskFormSubmit().save(payload({ title: 'Longer' }), payload())).toEqual({
      fieldErrors: [],
      kind: 'not_found',
      gone: true,
    })
    expect(changes).toEqual([{ deleted: 'task-1' }])
  })
})
