import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskRead } from './api/generated/client'
import App from './App.vue'
import type { Locale } from './stores/settings'
import { appPlugins } from './test/appPlugins'
import { requestUrl } from './test/requestUrl'
import { pageOf, task } from './test/tasksApi'

const TOAST = '[data-testid="undo-toast"]'

let mounted: VueWrapper | undefined

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** A server holding `rows`: it lists them as they are, adds a created task on top, changes and deletes by id. */
function serveTasks(rows: TaskRead[]) {
  const answer: typeof fetch = async (input, init) => {
    const method = init?.method ?? 'GET'
    const id = decodeURIComponent(requestUrl(input).pathname.split('/')[4] ?? '')
    const index = rows.findIndex((row) => row.id === id)
    if (method === 'GET') return json({ ...pageOf([]), items: [...rows], total: rows.length })
    if (method === 'DELETE') {
      rows.splice(index, 1)
      return new Response(null, { status: 204 })
    }
    const sent = JSON.parse(init?.body as string) as Partial<TaskRead>
    if (method === 'POST') {
      rows.unshift({ ...task(String(sent.title)), ...sent })
      return json(rows[0], 201)
    }
    rows[index] = { ...rows[index], ...sent }
    return json(rows[index])
  }
  vi.stubGlobal('fetch', vi.fn(answer))
}

/** Lets reka-ui finish its deferred work: focus moves and the outside-press listener are set up on a timer. */
async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function openApp(locale: Locale = 'en') {
  mounted = mount(App, { attachTo: document.body, global: { plugins: appPlugins(locale) } })
  await settle()
  return mounted
}

function get<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = document.body.querySelector<T>(selector)
  if (!found) throw new Error(`Nothing on the page matches ${selector}`)
  return found
}

function dialogTitle(): string | null | undefined {
  return document.getElementById(get('[role="dialog"]').getAttribute('aria-labelledby') ?? '')?.textContent
}

const titleField = () => get<HTMLInputElement>('[data-field="title"] input')

async function type(field: HTMLInputElement, text: string) {
  field.value = text
  field.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

async function press(element: HTMLElement) {
  element.focus()
  element.click()
  await settle()
}

async function save() {
  get('[data-testid="dialog-footer"] button[data-variant="primary"]').click()
  await settle()
}

function titles(page: VueWrapper): string[] {
  return page.findAll('main [data-testid="task-title"]').map((title) => title.text())
}

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

describe('task form in the app', () => {
  it('shows no form until it is asked for', async () => {
    serveTasks([task('Write report')])

    await openApp()

    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('opens an empty form when "New task" is pressed', async () => {
    serveTasks([task('Write report')])
    const page = await openApp()

    await press(page.get<HTMLButtonElement>('header button[data-variant="primary"]').element)

    expect(dialogTitle()).toBe('New task')
    expect(titleField().value).toBe('')
  })

  it('opens the form in Ukrainian when the language is Ukrainian', async () => {
    serveTasks([])
    const page = await openApp('uk')

    await press(page.get<HTMLButtonElement>('header button[data-variant="primary"]').element)

    expect(dialogTitle()).toBe('Нова задача')
  })

  it('shows the new task in the list and offers to undo it, with no other message', async () => {
    serveTasks([task('Write report')])
    const page = await openApp()
    await press(page.get<HTMLButtonElement>('header button[data-variant="primary"]').element)
    await type(titleField(), 'Call the bank')

    await save()

    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(titles(page)).toEqual(['Call the bank', 'Write report'])
    expect(page.get(TOAST).text()).toContain('Task created')
    expect(page.findAll('[role="alert"]')).toHaveLength(0)
  })

  it('takes the new task out of the list again when the create is undone', async () => {
    serveTasks([task('Write report')])
    const page = await openApp()
    await press(page.get<HTMLButtonElement>('header button[data-variant="primary"]').element)
    await type(titleField(), 'Call the bank')
    await save()

    await page.get(`${TOAST} button[data-variant="ghost"]`).trigger('click')
    await settle()

    expect(titles(page)).toEqual(['Write report'])
  })

  it('opens the form with the task whose title is pressed', async () => {
    serveTasks([task('Write report'), task('Call the bank')])
    const page = await openApp()

    await press(page.get<HTMLButtonElement>('button[aria-label="Edit: Call the bank"]').element)

    expect(dialogTitle()).toBe('Edit task')
    expect(titleField().value).toBe('Call the bank')
  })

  it('shows the edited task in the list and offers to undo the edit', async () => {
    serveTasks([task('Write report'), task('Call the bank')])
    const page = await openApp()
    await press(page.get<HTMLButtonElement>('button[aria-label="Edit: Call the bank"]').element)
    await type(titleField(), 'Call the bank today')

    await save()

    expect(titles(page)).toEqual(['Write report', 'Call the bank today'])
    expect(page.get(TOAST).text()).toContain('Task updated')
  })

  it('shows the task as it was when the edit is undone', async () => {
    serveTasks([task('Write report'), task('Call the bank')])
    const page = await openApp()
    await press(page.get<HTMLButtonElement>('button[aria-label="Edit: Call the bank"]').element)
    await type(titleField(), 'Call the bank today')
    await save()

    await page.get(`${TOAST} button[data-variant="ghost"]`).trigger('click')
    await settle()

    expect(titles(page)).toEqual(['Write report', 'Call the bank'])
  })

  it('leaves the list as it was when the form is closed with unsaved changes', async () => {
    serveTasks([task('Write report')])
    const page = await openApp()
    await press(page.get<HTMLButtonElement>('button[aria-label="Edit: Write report"]').element)
    await type(titleField(), 'Something else')

    titleField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()

    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(titles(page)).toEqual(['Write report'])
    expect(page.find(TOAST).exists()).toBe(false)
  })

  it('returns focus to "New task" when the form it opened is closed', async () => {
    serveTasks([])
    const page = await openApp()
    const newTask = page.get<HTMLButtonElement>('header button[data-variant="primary"]').element
    await press(newTask)

    titleField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()

    expect(document.activeElement).toBe(newTask)
  })

  it('returns focus to the title of the row when the form it opened is closed', async () => {
    serveTasks([task('Write report')])
    const page = await openApp()
    const rowTitle = page.get<HTMLButtonElement>('button[aria-label="Edit: Write report"]').element
    await press(rowTitle)

    get('button[aria-label="Close"]').click()
    await settle()

    expect(document.activeElement).toBe(rowTitle)
  })
})
