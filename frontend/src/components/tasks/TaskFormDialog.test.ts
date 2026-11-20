import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskRead } from '../../api/generated/client'
import { CLOCK, type Clock } from '../../i18n/clock'
import type { Locale } from '../../stores/settings'
import { useTaskFormStore } from '../../stores/taskForm'
import { useTasksStore } from '../../stores/tasks'
import { useUndoStore } from '../../stores/undo'
import { appPlugins } from '../../test/appPlugins'
import { pageOf, task } from '../../test/tasksApi'
import TaskFormDialog from './TaskFormDialog.vue'

// Noon UTC on 5 March 2026, edited in Kyiv time (UTC+2 on that day, UTC+3 in summer).
const KYIV_NOON: Clock = { now: () => new Date('2026-03-05T12:00:00Z'), timeZone: 'Europe/Kyiv' }

interface SentRequest {
  method: string
  path: string
  body: unknown
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function invalid(...errors: [field: string, type: string][]): Response {
  return json({ detail: errors.map(([field, type]) => ({ loc: ['body', field], type, msg: 'no' })) }, 422)
}

type Answer = (request: SentRequest) => Response | Promise<Response>

// Like the API: a create answers with the new task, an edit with the task as changed.
const accept: Answer = (request) =>
  json({ ...task('Saved'), ...(request.body as Partial<TaskRead>) }, request.method === 'POST' ? 201 : 200)

/** Answers list requests with an empty page and records every change, answered by `answer`. */
function fakeServer(answer: Answer = accept) {
  const changes: SentRequest[] = []
  let lists = 0
  const respond: typeof fetch = async (input, init) => {
    const method = init?.method ?? 'GET'
    if (method === 'GET') {
      lists += 1
      return json(pageOf([]))
    }
    const request: SentRequest = {
      method,
      path: new URL(String(input), 'http://localhost').pathname,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    changes.push(request)
    return answer(request)
  }
  vi.stubGlobal('fetch', vi.fn(respond))
  return {
    changes,
    get lists() {
      return lists
    },
  }
}

/** A change that stays unanswered until the test answers it. */
function heldAnswer() {
  let release: (response: Response) => void = () => {}
  const held = new Promise<Response>((resolve) => {
    release = resolve
  })
  return { answer: (() => held) satisfies Answer, release }
}

let mounted: VueWrapper | undefined

/** Lets reka-ui finish its deferred work: focus moves and the outside-press listener are set up on a timer. */
async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

function mountForm(locale: Locale = 'en') {
  mounted = mount(TaskFormDialog, {
    attachTo: document.body,
    global: { plugins: appPlugins(locale), provide: { [CLOCK as symbol]: KYIV_NOON } },
  })
}

async function openCreate(locale: Locale = 'en') {
  mountForm(locale)
  useTaskFormStore().openCreate()
  await settle()
}

async function openEdit(edited: TaskRead, locale: Locale = 'en') {
  mountForm(locale)
  useTaskFormStore().openEdit(edited)
  await settle()
}

function findDialog(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[role="dialog"]:not([data-testid="deadline-calendar"])')
}

function get<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = document.body.querySelector<T>(selector)
  if (!found) throw new Error(`Nothing on the page matches ${selector}`)
  return found
}

function dialogTitle(): string | null | undefined {
  return document.getElementById(get('[role="dialog"]').getAttribute('aria-labelledby') ?? '')?.textContent
}

function labelOf(field: HTMLElement): string | undefined {
  return document.body.querySelector(`label[for="${field.id}"]`)?.textContent.trim()
}

const titleField = () => get<HTMLInputElement>('[data-field="title"] input')
const descriptionField = () => get<HTMLTextAreaElement>('[data-field="description"] textarea')
const dateButton = () => get<HTMLButtonElement>('[data-testid="deadline-date"]')
const timeField = () => get<HTMLInputElement>('[data-testid="deadline-time"]')
const submitButton = () => get<HTMLButtonElement>('[data-testid="dialog-footer"] button[data-variant="primary"]')
const cancelButton = () => get<HTMLButtonElement>('[data-testid="dialog-footer"] button[data-variant="secondary"]')

async function type(field: HTMLInputElement | HTMLTextAreaElement, text: string) {
  field.value = text
  field.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

function segments(group: string): HTMLButtonElement[] {
  return [...get(`[role="group"][aria-label="${group}"]`).querySelectorAll('button')]
}

function selected(group: string): string | undefined {
  return segments(group)
    .find((segment) => segment.getAttribute('aria-pressed') === 'true')
    ?.textContent.trim()
}

async function choose(group: string, label: string) {
  const segment = segments(group).find((candidate) => candidate.textContent.trim() === label)
  if (!segment) throw new Error(`"${group}" has no option "${label}"`)
  segment.click()
  await flushPromises()
}

async function openCalendar() {
  dateButton().click()
  await settle()
}

async function pickDay(day: string) {
  await openCalendar()
  get(`[data-testid="deadline-calendar"] [data-value="${day}"]`).click()
  await settle()
}

async function submit() {
  submitButton().click()
  await settle()
}

function errorOf(field: string): string {
  return document.body.querySelector(`[data-testid="error-${field}"]`)?.textContent.trim() ?? ''
}

function formErrors(): string[] {
  return [...document.body.querySelectorAll('[data-testid="form-error"] p')].map((line) => line.textContent.trim())
}

describe('TaskFormDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    history.replaceState(null, '', '/')
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = undefined
    vi.unstubAllGlobals()
    const pinia = getActivePinia()
    if (pinia) disposePinia(pinia)
  })

  describe('opening', () => {
    it('shows nothing until something opens the form', async () => {
      fakeServer()
      mountForm()
      await settle()

      expect(findDialog()).toBeNull()
    })

    it('opens as "New task" with empty fields, "To do" and "Medium" chosen and no deadline', async () => {
      fakeServer()

      await openCreate()

      expect(dialogTitle()).toBe('New task')
      expect(titleField().value).toBe('')
      expect(descriptionField().value).toBe('')
      expect(selected('Status')).toBe('To do')
      expect(selected('Priority')).toBe('Medium')
      expect(dateButton().textContent.trim()).toBe('Pick a date')
      expect(dateButton().getAttribute('aria-label')).toBe('Deadline date')
      expect(timeField().value).toBe('')
      expect(submitButton().textContent.trim()).toBe('Create')
      expect(cancelButton().textContent.trim()).toBe('Cancel')
    })

    it('offers the three statuses and the three priorities', async () => {
      fakeServer()

      await openCreate()

      expect(segments('Status').map((segment) => segment.textContent.trim())).toEqual(['To do', 'In progress', 'Done'])
      expect(segments('Priority').map((segment) => segment.textContent.trim())).toEqual(['Low', 'Medium', 'High'])
    })

    it('labels the title and the description', async () => {
      fakeServer()

      await openCreate()

      expect(labelOf(titleField())).toBe('Title')
      expect(labelOf(descriptionField())).toBe('Description')
    })

    it('puts the cursor in the title', async () => {
      fakeServer()

      await openCreate()

      expect(document.activeElement).toBe(titleField())
    })

    it('opens as "Edit task" with the values of the task', async () => {
      fakeServer()

      await openEdit(
        task('Write report', {
          description: 'Numbers for Q1',
          status: 'in_progress',
          priority: 'high',
          deadline: '2026-03-05T16:30:00Z',
        }),
      )

      expect(dialogTitle()).toBe('Edit task')
      expect(titleField().value).toBe('Write report')
      expect(descriptionField().value).toBe('Numbers for Q1')
      expect(selected('Status')).toBe('In progress')
      expect(selected('Priority')).toBe('High')
      expect(submitButton().textContent.trim()).toBe('Save')
    })

    it('shows the deadline of the task in the local time of the user', async () => {
      fakeServer()

      await openEdit(task('Write report', { deadline: '2026-03-05T16:30:00Z' }))

      expect(dateButton().textContent.trim()).toBe('Mar 5, 2026')
      expect(dateButton().getAttribute('aria-label')).toBe('Deadline date: Mar 5, 2026')
      expect(timeField().value).toBe('18:30')
    })

    it('shows a deadline that cannot be read as no deadline', async () => {
      fakeServer()

      await openEdit(task('Write report', { deadline: 'soon' }))

      expect(dateButton().textContent.trim()).toBe('Pick a date')
      expect(timeField().value).toBe('')
    })

    it('speaks Ukrainian when the language is Ukrainian', async () => {
      fakeServer()

      await openEdit(task('Звіт', { deadline: '2026-03-05T16:30:00Z' }), 'uk')

      expect(dialogTitle()).toBe('Редагування задачі')
      expect([...document.body.querySelectorAll('label')].map((label) => label.textContent.trim())).toEqual([
        'Назва',
        'Опис',
      ])
      expect(segments('Статус').map((segment) => segment.textContent.trim())).toEqual([
        'До виконання',
        'У роботі',
        'Виконано',
      ])
      expect(segments('Пріоритет')).toHaveLength(3)
      expect(dateButton().textContent.trim()).toBe('5 бер. 2026 р.')
      expect(timeField().getAttribute('aria-label')).toBe('Час дедлайну')
      expect(submitButton().textContent.trim()).toBe('Зберегти')
      expect(cancelButton().textContent.trim()).toBe('Скасувати')
    })

    it('starts blank again when it is opened for a new task after an edit', async () => {
      fakeServer()
      await openEdit(task('Write report', { priority: 'high', deadline: '2026-03-05T16:30:00Z' }))
      await type(titleField(), '')
      await submit()
      expect(errorOf('title')).not.toBe('')
      cancelButton().click()
      await settle()

      useTaskFormStore().openCreate()
      await settle()

      expect(titleField().value).toBe('')
      expect(selected('Priority')).toBe('Medium')
      expect(dateButton().textContent.trim()).toBe('Pick a date')
      expect(errorOf('title')).toBe('')
    })
  })

  describe('deadline', () => {
    it('opens a calendar on the month of the deadline', async () => {
      fakeServer()
      await openEdit(task('Write report', { deadline: '2026-03-05T16:30:00Z' }))

      await openCalendar()

      expect(get('[data-testid="deadline-month"]').textContent.trim()).toBe('March 2026')
      expect(get('[data-testid="deadline-calendar"] [data-selected]').textContent.trim()).toBe('5')
    })

    it('names the calendar and its month buttons', async () => {
      fakeServer()
      await openCreate()

      await openCalendar()

      const calendar = get('[data-testid="deadline-calendar"]')
      expect(calendar.querySelector('[aria-label^="Deadline, "]')).not.toBeNull()
      expect(calendar.querySelector('button[aria-label="Previous month"]')).not.toBeNull()
      expect(calendar.querySelector('button[aria-label="Next month"]')).not.toBeNull()
    })

    it('shows the calendar in Ukrainian, with the week starting on Monday', async () => {
      fakeServer()
      await openEdit(task('Звіт', { deadline: '2026-03-05T16:30:00Z' }), 'uk')

      await openCalendar()

      const calendar = get('[data-testid="deadline-calendar"]')
      expect(get('[data-testid="deadline-month"]').textContent.trim()).toBe('березень 2026 р.')
      expect(calendar.querySelector('button[aria-label="Попередній місяць"]')).not.toBeNull()
      expect(calendar.querySelector('button[aria-label="Наступний місяць"]')).not.toBeNull()
      expect(calendar.querySelector('thead th')?.textContent.trim()).toBe('П')
      expect(calendar.querySelector('tbody [data-reka-calendar-cell-trigger]')?.getAttribute('data-value')).toBe(
        '2026-02-23',
      )
    })

    it('takes the day picked in the calendar and closes the calendar', async () => {
      fakeServer()
      await openEdit(task('Write report', { deadline: '2026-03-05T16:30:00Z' }))

      await pickDay('2026-03-10')

      expect(dateButton().textContent.trim()).toBe('Mar 10, 2026')
      expect(timeField().value).toBe('18:30')
      expect(document.body.querySelector('[data-testid="deadline-calendar"]')).toBeNull()
    })

    it('keeps the time off until a day is picked, then means the end of that day', async () => {
      fakeServer()
      await openCreate()
      expect(timeField().disabled).toBe(true)

      await pickDay('2026-03-10')

      expect(timeField().disabled).toBe(false)
      expect(timeField().value).toBe('23:59')
    })

    it('offers to clear the deadline only when there is one', async () => {
      fakeServer()
      await openCreate()
      expect(document.body.querySelector('button[aria-label="Clear deadline"]')).toBeNull()

      await pickDay('2026-03-10')

      expect(document.body.querySelector('button[aria-label="Clear deadline"]')).not.toBeNull()
    })

    it('clears the date and the time and moves focus to the date', async () => {
      fakeServer()
      await openEdit(task('Write report', { deadline: '2026-03-05T16:30:00Z' }))

      get('button[aria-label="Clear deadline"]').click()
      await flushPromises()

      expect(dateButton().textContent.trim()).toBe('Pick a date')
      expect(timeField().value).toBe('')
      expect(timeField().disabled).toBe(true)
      expect(document.activeElement).toBe(dateButton())
    })
  })

  describe('creating', () => {
    it('sends what was filled in as a new task', async () => {
      const server = fakeServer()
      await openCreate()
      await type(titleField(), 'Write report')
      await type(descriptionField(), 'Numbers for Q1')
      await choose('Status', 'In progress')
      await choose('Priority', 'High')

      await submit()

      expect(server.changes).toEqual([
        {
          method: 'POST',
          path: '/api/v1/tasks',
          body: { title: 'Write report', description: 'Numbers for Q1', status: 'in_progress', priority: 'high' },
        },
      ])
    })

    it('leaves out an empty description and deadline, and trims the title', async () => {
      const server = fakeServer()
      await openCreate()
      await type(titleField(), '  Write report  ')
      await type(descriptionField(), '   ')

      await submit()

      expect(server.changes[0].body).toEqual({ title: 'Write report', status: 'todo', priority: 'medium' })
    })

    it('sends the deadline as the instant the local date and time mean', async () => {
      const server = fakeServer()
      await openCreate()
      await type(titleField(), 'Write report')
      await pickDay('2026-03-10')
      await type(timeField(), '18:30')

      await submit()

      expect(server.changes[0].body).toMatchObject({ deadline: '2026-03-10T16:30:00.000Z' })
    })

    it('sends the end of the day when the time was emptied', async () => {
      const server = fakeServer()
      await openCreate()
      await type(titleField(), 'Write report')
      await pickDay('2026-03-10')
      await type(timeField(), '')

      await submit()

      expect(server.changes[0].body).toMatchObject({ deadline: '2026-03-10T21:59:00.000Z' })
    })

    it('submits when Enter is pressed in the title', async () => {
      const server = fakeServer()
      await openCreate()
      await type(titleField(), 'Write report')

      titleField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await settle()

      expect(server.changes).toHaveLength(1)
    })

    it('closes, reloads the list and offers to undo the create', async () => {
      const server = fakeServer()
      await openCreate()
      useTasksStore().start()
      await settle()
      await type(titleField(), 'Write report')

      await submit()

      expect(findDialog()).toBeNull()
      expect(server.lists).toBe(2)
      expect(useUndoStore().label).toBe('created')
    })

    it('deletes the new task when the create is undone', async () => {
      const server = fakeServer((request) =>
        request.method === 'POST' ? json(task('Write report', { id: 'new-1' }), 201) : new Response(null, { status: 204 }),
      )
      await openCreate()
      await type(titleField(), 'Write report')
      await submit()

      await useUndoStore().run()

      expect(server.changes[1]).toMatchObject({ method: 'DELETE', path: '/api/v1/tasks/new-1' })
    })
  })

  describe('checking the title', () => {
    it('asks for a title when the field is left empty', async () => {
      fakeServer()
      await openCreate()

      titleField().dispatchEvent(new FocusEvent('blur'))
      await flushPromises()

      expect(errorOf('title')).toBe('Enter a title.')
      expect(titleField().getAttribute('aria-invalid')).toBe('true')
      expect(get(`#${titleField().getAttribute('aria-describedby')}`).textContent.trim()).toBe('Enter a title.')
    })

    it('says nothing when the field is left with a title in it', async () => {
      fakeServer()
      await openCreate()
      await type(titleField(), 'Write report')

      titleField().dispatchEvent(new FocusEvent('blur'))
      await flushPromises()

      expect(errorOf('title')).toBe('')
      expect(titleField().getAttribute('aria-invalid')).toBe('false')
    })

    it('does not send a task whose title is only spaces, and puts the cursor back in the title', async () => {
      const server = fakeServer()
      await openCreate()
      await type(titleField(), '   ')
      descriptionField().focus()

      await submit()

      expect(server.changes).toEqual([])
      expect(errorOf('title')).toBe('Enter a title.')
      expect(document.activeElement).toBe(titleField())
      expect(findDialog()).not.toBeNull()
    })

    it('does not send a title longer than 200 characters', async () => {
      const server = fakeServer()
      await openCreate()
      await type(titleField(), 'a'.repeat(201))

      await submit()

      expect(server.changes).toEqual([])
      expect(errorOf('title')).toBe('The title can be at most 200 characters long.')
    })

    it('takes the message away as soon as the title is put right', async () => {
      fakeServer()
      await openCreate()
      await submit()
      expect(errorOf('title')).toBe('Enter a title.')

      await type(titleField(), 'a'.repeat(201))
      expect(errorOf('title')).toBe('The title can be at most 200 characters long.')
      await type(titleField(), 'Write report')

      expect(errorOf('title')).toBe('')
    })

    it('words the messages in Ukrainian', async () => {
      fakeServer()
      await openCreate('uk')

      await submit()

      expect(errorOf('title')).toBe('Введіть назву.')
    })
  })

  describe('saving', () => {
    it('shows progress on the disabled button until the API answers', async () => {
      const held = heldAnswer()
      fakeServer(held.answer)
      await openCreate()
      await type(titleField(), 'Write report')

      await submit()

      expect(submitButton().disabled).toBe(true)
      expect(submitButton().getAttribute('aria-busy')).toBe('true')
      expect(submitButton().querySelector('[data-testid="button-spinner"]')).not.toBeNull()
      expect(cancelButton().disabled).toBe(true)

      held.release(json(task('Write report'), 201))
      await settle()
      expect(findDialog()).toBeNull()
    })

    it('sends the task once however often it is submitted meanwhile', async () => {
      const held = heldAnswer()
      const server = fakeServer(held.answer)
      await openCreate()
      await type(titleField(), 'Write report')
      await submit()

      titleField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await settle()

      expect(server.changes).toHaveLength(1)
      held.release(json(task('Write report'), 201))
      await settle()
    })

    it('stays open while the save is in flight, so its outcome is seen', async () => {
      const held = heldAnswer()
      fakeServer(held.answer)
      await openCreate()
      await type(titleField(), 'Write report')
      await submit()

      titleField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await settle()
      expect(findDialog()).not.toBeNull()

      held.release(json({}, 500))
      await settle()
      expect(formErrors()).toEqual(['Something went wrong on the server. Please try again.'])
    })
  })

  describe('editing', () => {
    const report = task('Write report', {
      id: 'task-1',
      description: 'Numbers for Q1',
      status: 'in_progress',
      priority: 'high',
      deadline: '2026-03-05T16:30:45Z',
    })

    it('sends only the field that changed', async () => {
      const server = fakeServer()
      await openEdit(report)
      await choose('Priority', 'Low')

      await submit()

      expect(server.changes).toEqual([{ method: 'PATCH', path: `/api/v1/tasks/${report.id}`, body: { priority: 'low' } }])
    })

    it('sends every field that changed', async () => {
      const server = fakeServer()
      await openEdit(report)
      await type(titleField(), 'Write the report')
      await type(descriptionField(), 'Numbers for Q2')
      await choose('Status', 'Done')

      await submit()

      expect(server.changes[0].body).toEqual({
        title: 'Write the report',
        description: 'Numbers for Q2',
        status: 'done',
      })
    })

    it('sends a cleared description as null', async () => {
      const server = fakeServer()
      await openEdit(report)
      await type(descriptionField(), '  ')

      await submit()

      expect(server.changes[0].body).toEqual({ description: null })
    })

    it('sends a cleared deadline as null', async () => {
      const server = fakeServer()
      await openEdit(report)
      get('button[aria-label="Clear deadline"]').click()
      await flushPromises()

      await submit()

      expect(server.changes[0].body).toEqual({ deadline: null })
    })

    it('sends a new time on the same day as the instant it means', async () => {
      const server = fakeServer()
      await openEdit(report)
      await type(timeField(), '19:45')

      await submit()

      expect(server.changes[0].body).toEqual({ deadline: '2026-03-05T17:45:00.000Z' })
    })

    it('sends a day in summer with the summer offset of the zone', async () => {
      const server = fakeServer()
      await openEdit(task('Write report', { deadline: '2026-07-01T15:30:00Z' }))
      expect(timeField().value).toBe('18:30')

      await pickDay('2026-07-02')
      await submit()

      expect(server.changes[0].body).toEqual({ deadline: '2026-07-02T15:30:00.000Z' })
    })

    it('leaves the deadline alone, seconds included, when it was not touched', async () => {
      const server = fakeServer()
      await openEdit(report)
      await type(titleField(), 'Write the report')

      await submit()

      expect(server.changes[0].body).toEqual({ title: 'Write the report' })
    })

    it('does not send a deadline that was changed and put back', async () => {
      const server = fakeServer()
      await openEdit(report)
      await type(timeField(), '19:45')
      await type(timeField(), '18:30')
      await choose('Status', 'Done')

      await submit()

      expect(server.changes[0].body).toEqual({ status: 'done' })
    })

    it('just closes when nothing was changed', async () => {
      const server = fakeServer()
      await openEdit(report)
      await type(titleField(), ' Write report ')

      await submit()

      expect(server.changes).toEqual([])
      expect(findDialog()).toBeNull()
      expect(useUndoStore().label).toBeNull()
    })

    it('closes, reloads the list and offers to undo the edit', async () => {
      const server = fakeServer()
      await openEdit(report)
      useTasksStore().start()
      await settle()
      await choose('Priority', 'Low')

      await submit()

      expect(findDialog()).toBeNull()
      expect(server.lists).toBe(2)
      expect(useUndoStore().label).toBe('updated')
    })

    it('puts the previous values back when the edit is undone', async () => {
      const server = fakeServer((request) => json({ ...report, ...(request.body as Partial<TaskRead>) }))
      await openEdit(report)
      await choose('Priority', 'Low')
      get('button[aria-label="Clear deadline"]').click()
      await flushPromises()
      await submit()

      await useUndoStore().run()

      expect(server.changes[1]).toEqual({
        method: 'PATCH',
        path: `/api/v1/tasks/${report.id}`,
        body: { priority: 'high', deadline: '2026-03-05T16:30:45Z' },
      })
    })
  })

  describe('when the API refuses the task', () => {
    it('explains each refused field next to it and keeps the form open', async () => {
      fakeServer(() =>
        invalid(
          ['title', 'string_too_long'],
          ['description', 'value_error'],
          ['status', 'enum'],
          ['priority', 'missing'],
          ['deadline', 'timezone_aware'],
        ),
      )
      await openCreate()
      await type(titleField(), 'Write report')

      await submit()

      expect(errorOf('title')).toBe('The title can be at most 200 characters long.')
      expect(errorOf('description')).toBe('This value is not valid.')
      expect(errorOf('status')).toBe('Choose one of the options.')
      expect(errorOf('priority')).toBe('This field is required.')
      expect(errorOf('deadline')).toBe('Enter a valid date and time.')
      expect(formErrors()).toEqual([])
      expect(findDialog()).not.toBeNull()
      expect(titleField().value).toBe('Write report')
      expect(submitButton().disabled).toBe(false)
    })

    it('explains them in Ukrainian', async () => {
      fakeServer(() => invalid(['title', 'string_too_short'], ['deadline', 'datetime_parsing'], ['owner', 'enum']))
      await openCreate('uk')
      await type(titleField(), 'Звіт')

      await submit()

      expect(errorOf('title')).toBe('Введіть назву.')
      expect(errorOf('deadline')).toBe('Вкажіть правильну дату й час.')
      expect(formErrors()).toEqual(['«owner»: Оберіть один із варіантів.'])
    })

    it('keeps the first of two complaints about one field', async () => {
      fakeServer(() => invalid(['title', 'string_too_long'], ['title', 'value_error']))
      await openCreate()
      await type(titleField(), 'Write report')

      await submit()

      expect(errorOf('title')).toBe('The title can be at most 200 characters long.')
    })

    it('puts the cursor in the first refused field', async () => {
      fakeServer(() => invalid(['deadline', 'timezone_aware'], ['description', 'value_error']))
      await openCreate()
      await type(titleField(), 'Write report')

      await submit()

      expect(document.activeElement).toBe(descriptionField())
    })

    it('puts the cursor on a refused choice', async () => {
      fakeServer(() => invalid(['status', 'enum']))
      await openCreate()
      await type(titleField(), 'Write report')

      await submit()

      expect(document.activeElement?.closest('[role="group"]')?.getAttribute('aria-label')).toBe('Status')
    })

    it('shows a complaint about a field the form does not have under the form', async () => {
      fakeServer(() => invalid(['owner', 'extra_forbidden'], ['color', 'string_pattern_mismatch']))
      await openCreate()
      await type(titleField(), 'Write report')

      await submit()

      expect(formErrors()).toEqual(['“owner”: This field cannot be set.', '“color”: This value is not valid.'])
    })

    it('says something went wrong when the refusal names no field', async () => {
      fakeServer(() => json({ detail: 'nope' }, 422))
      await openCreate()
      await type(titleField(), 'Write report')

      await submit()

      expect(formErrors()).toEqual(['Something went wrong. Please try again.'])
    })

    it('takes a message away when its field changes', async () => {
      fakeServer(() =>
        invalid(
          ['description', 'value_error'],
          ['status', 'enum'],
          ['priority', 'enum'],
          ['deadline', 'timezone_aware'],
        ),
      )
      await openCreate()
      await type(titleField(), 'Write report')
      await submit()

      await type(descriptionField(), 'Numbers')
      expect(errorOf('description')).toBe('')
      await choose('Status', 'Done')
      expect(errorOf('status')).toBe('')
      await choose('Priority', 'High')
      expect(errorOf('priority')).toBe('')
      expect(errorOf('deadline')).not.toBe('')
      await pickDay('2026-03-10')
      expect(errorOf('deadline')).toBe('')
    })

    it('forgets the messages of the last attempt when it is submitted again', async () => {
      let attempts = 0
      const server = fakeServer((request) => {
        attempts += 1
        return attempts === 1 ? invalid(['status', 'enum'], ['owner', 'extra_forbidden']) : accept(request)
      })
      await openCreate()
      await type(titleField(), 'Write report')
      await submit()
      expect(formErrors()).toHaveLength(1)

      await submit()

      expect(server.changes).toHaveLength(2)
      expect(findDialog()).toBeNull()
    })
  })

  describe('when saving fails', () => {
    it('says the task no longer exists, reloads the list and has nothing left to save', async () => {
      const server = fakeServer(() => json({ detail: 'Task not found' }, 404))
      await openEdit(task('Write report'))
      useTasksStore().start()
      await settle()
      await type(titleField(), 'Write the report')

      await submit()

      expect(formErrors()).toEqual(['This task no longer exists.'])
      expect(server.lists).toBe(2)
      expect(findDialog()).not.toBeNull()
      expect(submitButton().disabled).toBe(true)
      expect(useUndoStore().label).toBeNull()

      titleField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await settle()
      expect(server.changes).toHaveLength(1)
    })

    it('can save again when it is opened for another task after that', async () => {
      let attempts = 0
      const server = fakeServer((request) => {
        attempts += 1
        return attempts === 1 ? json({ detail: 'Task not found' }, 404) : accept(request)
      })
      await openEdit(task('Write report'))
      await type(titleField(), 'Write the report')
      await submit()
      cancelButton().click()
      await settle()

      useTaskFormStore().openEdit(task('Other'))
      await settle()
      expect(formErrors()).toEqual([])
      await type(titleField(), 'Another')
      await submit()

      expect(server.changes).toHaveLength(2)
      expect(findDialog()).toBeNull()
    })

    it('blames the server for a 404 on a new task', async () => {
      fakeServer(() => json({ detail: 'Not found' }, 404))
      await openCreate()
      await type(titleField(), 'Write report')

      await submit()

      expect(formErrors()).toEqual(['Something went wrong on the server. Please try again.'])
      expect(submitButton().disabled).toBe(false)
    })

    it('says the server could not be reached and keeps what was typed', async () => {
      fakeServer(() => {
        throw new TypeError('Failed to fetch')
      })
      await openCreate()
      await type(titleField(), 'Write report')
      await type(descriptionField(), 'Numbers for Q1')
      await choose('Priority', 'High')

      await submit()

      expect(formErrors()).toEqual(['Could not reach the server. Check your connection and try again.'])
      expect(get('[data-testid="form-error"]').getAttribute('role')).toBe('alert')
      expect(findDialog()).not.toBeNull()
      expect(titleField().value).toBe('Write report')
      expect(descriptionField().value).toBe('Numbers for Q1')
      expect(selected('Priority')).toBe('High')
      expect(submitButton().disabled).toBe(false)
      expect(useUndoStore().label).toBeNull()
    })

    it('says the server failed, in Ukrainian too', async () => {
      fakeServer(() => json({}, 500))
      await openCreate('uk')
      await type(titleField(), 'Звіт')

      await submit()

      expect(formErrors()).toEqual(['На сервері сталася помилка. Спробуйте ще раз.'])
    })

    it('counts a failure it does not recognise as a server failure', async () => {
      // Not a Response at all: reading it fails outside of what the API layer expects.
      fakeServer(() => null as unknown as Response)
      await openCreate()
      await type(titleField(), 'Write report')

      await submit()

      expect(formErrors()).toEqual(['Something went wrong on the server. Please try again.'])
    })

    it('saves when it is tried again after the failure', async () => {
      let attempts = 0
      const server = fakeServer((request) => {
        attempts += 1
        return attempts === 1 ? json({}, 500) : accept(request)
      })
      await openCreate()
      await type(titleField(), 'Write report')
      await submit()

      await submit()

      expect(server.changes).toHaveLength(2)
      expect(findDialog()).toBeNull()
      expect(useUndoStore().label).toBe('created')
    })
  })

  describe('closing', () => {
    it('closes on Cancel without sending anything, whatever was typed', async () => {
      const server = fakeServer()
      await openCreate()
      await type(titleField(), 'Write report')

      cancelButton().click()
      await settle()

      expect(findDialog()).toBeNull()
      expect(server.changes).toEqual([])
    })

    it('closes on Escape with unsaved changes, without asking', async () => {
      fakeServer()
      await openEdit(task('Write report'))
      await type(titleField(), 'Write the report')

      titleField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await settle()

      expect(findDialog()).toBeNull()
      expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
    })

    it('closes on the close button', async () => {
      fakeServer()
      await openCreate()

      get('button[aria-label="Close"]').click()
      await settle()

      expect(findDialog()).toBeNull()
    })

    it('closes when the overlay is pressed', async () => {
      fakeServer()
      await openCreate()

      get('[data-testid="dialog-overlay"]').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      await settle()

      expect(findDialog()).toBeNull()
    })

    it('shows the task as it is, not what was typed, when it is opened again', async () => {
      fakeServer()
      const report = task('Write report')
      await openEdit(report)
      await type(titleField(), 'Something else')
      cancelButton().click()
      await settle()

      useTaskFormStore().openEdit(report)
      await settle()

      expect(titleField().value).toBe('Write report')
    })
  })
})
