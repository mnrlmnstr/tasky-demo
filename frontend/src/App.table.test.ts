import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import type { TaskRead } from './api/generated/client'
import App from './App.vue'
import { CLOCK, type Clock } from './i18n/clock'
import { useListViewStore } from './stores/listView'
import { useSettingsStore, type Locale } from './stores/settings'
import { useTaskFormStore } from './stores/taskForm'
import { useUndoStore } from './stores/undo'
import { appPlugins } from './test/appPlugins'
import { requestUrl } from './test/requestUrl'
import { task } from './test/tasksApi'
import { taskServer } from './test/taskServer'

const NOON: Clock = { now: () => new Date('2026-03-05T12:00:00Z'), timeZone: 'UTC' }

let mounted: VueWrapper | undefined

async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function openTable(rows: TaskRead[], locale: Locale = 'en', address = '/?view=table') {
  const server = taskServer(rows)
  history.replaceState(null, '', address)
  mounted = mount(App, {
    attachTo: document.body,
    global: { plugins: appPlugins(locale), provide: { [CLOCK as symbol]: NOON } },
  })
  await settle()
  return { page: mounted, server }
}

function rows(): TaskRead[] {
  return [
    task('Write', { priority: 'high', deadline: '2026-03-01T10:00:00Z', description: 'Numbers for March' }),
    task('Call', { status: 'in_progress', created_at: '2026-03-02T12:00:00Z' }),
    task('Ship', { status: 'done', deadline: '2026-03-20T10:00:00Z' }),
  ]
}

function plainText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function headers(page: VueWrapper): string[] {
  return page.findAll('main thead th').map((header) => plainText(header.text()))
}

function rowOf(page: VueWrapper, title: string): DOMWrapper<Element> {
  const row = page.findAll('main tbody tr').find((item) => item.get('[data-testid="task-title"]').text() === title)
  if (!row) throw new Error(`The table has no "${title}" row`)
  return row
}

function cells(page: VueWrapper, title: string): string[] {
  return rowOf(page, title)
    .findAll('td')
    .map((cell) => plainText(cell.text()))
}

function header(page: VueWrapper, name: string): DOMWrapper<Element> {
  const found = page.findAll('main thead th').find((candidate) => plainText(candidate.text()) === name)
  if (!found) throw new Error(`The table has no "${name}" header`)
  return found
}

function requestedOrderings(): string[] {
  return vi
    .mocked(fetch)
    .mock.calls.map(([input]) => requestUrl(input).searchParams.get('ordering'))
    .filter((ordering): ordering is string => ordering !== null)
}

function menuItems(role = 'menuitemradio'): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>(`[role="menu"] [role="${role}"]`))
}

async function pressDialogButton(label: string) {
  const dialog = document.body.querySelector('[role="alertdialog"]')
  const button = Array.from(dialog?.querySelectorAll('button') ?? []).find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!button) throw new Error(`The dialog has no "${label}" button`)
  button.click()
  await settle()
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

describe('the table', () => {
  it('has a column for the status, title, priority, deadline, creation and the actions of each task', async () => {
    const { page } = await openTable(rows())

    expect(page.find('main table').exists()).toBe(true)
    expect(page.find('main ul').exists()).toBe(false)
    expect(headers(page)).toEqual(['Status', 'Title', 'Priority', 'Deadline', 'Created', 'Actions'])
    expect(page.findAll('main thead th').every((cell) => cell.attributes('scope') === 'col')).toBe(true)
    expect(page.findAll('main tbody tr')).toHaveLength(3)
  })

  it('shows each task on one row', async () => {
    const { page } = await openTable(rows())

    expect(cells(page, 'Write')).toEqual([
      '',
      'Write',
      'High',
      'Mar 1, 2026, 10:00 AM · Overdue',
      'last month Jan 10, 2026, 9:00 AM',
      '',
    ])
    expect(cells(page, 'Call').slice(1, 4)).toEqual(['Call', 'Medium', '—No deadline'])
    expect(cells(page, 'Ship')[3]).toBe('Mar 20, 2026, 10:00 AM')
  })

  it('marks a deadline that has passed', async () => {
    const { page } = await openTable(rows())

    expect(rowOf(page, 'Write').get('[data-testid="task-deadline"]').classes()).toContain('text-danger-text')
    expect(rowOf(page, 'Ship').get('[data-testid="task-deadline"]').classes()).not.toContain('text-danger-text')
  })

  it('says how long ago a task was created, with the exact time for screen readers and in a tooltip', async () => {
    const { page } = await openTable(rows())

    const created = rowOf(page, 'Call').get('time')
    expect(plainText(created.text())).toBe('3 days ago')
    expect(created.attributes('datetime')).toBe('2026-03-02T12:00:00Z')
    expect(plainText(created.attributes('title') ?? '')).toBe('Mar 2, 2026, 12:00 PM')
    expect(plainText(rowOf(page, 'Call').get('[data-testid="task-created-at"]').text())).toBe('Mar 2, 2026, 12:00 PM')
  })

  it('opens the edit form from the title', async () => {
    const { page } = await openTable(rows())

    await rowOf(page, 'Call').get('button[aria-label="Edit: Call"]').trigger('click')

    expect(useTaskFormStore().task?.title).toBe('Call')
  })

  it('never shows the description, whatever the setting', async () => {
    const { page } = await openTable(rows())
    useSettingsStore().showDescriptions = true
    await nextTick()

    expect(page.find('main [data-testid="task-description"]').exists()).toBe(false)
  })

  it('leaves less room around the rows when the density is compact', async () => {
    const { page } = await openTable(rows())
    expect(rowOf(page, 'Call').get('td').classes()).toContain('py-2.5')

    useSettingsStore().density = 'compact'
    await nextTick()

    expect(rowOf(page, 'Call').get('td').classes()).toContain('py-1')
  })

  it('scrolls sideways inside the page when it does not fit', async () => {
    const { page } = await openTable(rows())

    expect(page.get('main table').element.parentElement?.classList).toContain('overflow-x-auto')
  })

  it('pages like the list', async () => {
    const many = Array.from({ length: 25 }, (_, index) => task(`Task ${index + 1}`))
    const { page } = await openTable(many)

    expect(page.findAll('main tbody tr')).toHaveLength(20)
    expect(page.get('[data-testid="page-position"]').text()).toBe('Page 1 of 2')
    expect(page.get('[data-testid="task-total"]').text()).toBe('25 tasks')
  })

  it('speaks Ukrainian', async () => {
    const { page } = await openTable(rows(), 'uk')

    expect(headers(page)).toEqual(['Статус', 'Назва', 'Пріоритет', 'Дедлайн', 'Створено', 'Дії'])
  })
})

describe('sorting from the table', () => {
  it('marks the creation column as sorted newest first by default, and no other', async () => {
    const { page } = await openTable(rows())

    expect(header(page, 'Created').attributes('aria-sort')).toBe('descending')
    expect(header(page, 'Deadline').attributes('aria-sort')).toBeUndefined()
    expect(header(page, 'Title').attributes('aria-sort')).toBeUndefined()
  })

  it('sorts by deadline, soonest first, then latest first on a second press', async () => {
    const { page } = await openTable(rows())

    await header(page, 'Deadline').get('button').trigger('click')
    await settle()
    expect(useListViewStore().ordering).toBe('deadline')
    expect(header(page, 'Deadline').attributes('aria-sort')).toBe('ascending')
    expect(header(page, 'Created').attributes('aria-sort')).toBeUndefined()

    await header(page, 'Deadline').get('button').trigger('click')
    await settle()
    expect(useListViewStore().ordering).toBe('-deadline')
    expect(header(page, 'Deadline').attributes('aria-sort')).toBe('descending')
    expect(requestedOrderings().slice(-2)).toEqual(['deadline', '-deadline'])
  })

  it('sorts by creation, oldest first from the default, and back', async () => {
    const { page } = await openTable(rows())

    await header(page, 'Created').get('button').trigger('click')
    await settle()
    expect(useListViewStore().ordering).toBe('created_at')
    expect(header(page, 'Created').attributes('aria-sort')).toBe('ascending')

    await header(page, 'Created').get('button').trigger('click')
    await settle()
    expect(useListViewStore().ordering).toBe('-created_at')
  })

  it('starts the creation column newest first when another column was sorted', async () => {
    const { page } = await openTable(rows(), 'en', '/?view=table&ordering=deadline')

    await header(page, 'Created').get('button').trigger('click')
    await settle()

    expect(useListViewStore().ordering).toBe('-created_at')
  })

  it('names the sort buttons', async () => {
    const { page } = await openTable(rows())

    expect(header(page, 'Deadline').get('button').attributes('title')).toBe('Sort by Deadline')
  })
})

describe('actions from the table', () => {
  it('changes the status from the status menu of a row, and offers to undo it', async () => {
    const { page, server } = await openTable(rows())

    rowOf(page, 'Write').get<HTMLButtonElement>('[data-testid="task-status"]').element.click()
    await settle()
    menuItems()
      .find((item) => item.textContent?.trim() === 'Done')
      ?.click()
    await settle()

    expect(server.changes).toEqual([{ method: 'PATCH', path: '/api/v1/tasks/id-Write', body: { status: 'done' } }])
    expect(rowOf(page, 'Write').get('[data-testid="task-status"]').attributes('aria-label')).toBe(
      'Status: Done. Change status',
    )
    expect(useUndoStore().label).toBe('statusChanged')
  })

  it('deletes a task from the actions menu of its row, after asking', async () => {
    const { page, server } = await openTable(rows())

    const trigger = rowOf(page, 'Call').get<HTMLButtonElement>('button[aria-label="Actions for «Call»"]')
    trigger.element.click()
    await settle()
    expect(menuItems('menuitem').map((item) => item.textContent?.trim())).toEqual(['Delete task'])
    menuItems('menuitem')[0].click()
    await settle()

    expect(document.body.querySelector('[role="alertdialog"]')?.textContent).toContain('Delete «Call»?')
    await pressDialogButton('Delete')

    expect(server.changes).toEqual([{ method: 'DELETE', path: '/api/v1/tasks/id-Call', body: undefined }])
    expect(page.findAll('main tbody tr')).toHaveLength(2)
  })

  it('keeps the task when the deletion is cancelled', async () => {
    const { page, server } = await openTable(rows())

    rowOf(page, 'Call').get<HTMLButtonElement>('button[aria-label="Actions for «Call»"]').element.click()
    await settle()
    menuItems('menuitem')[0].click()
    await settle()
    await pressDialogButton('Cancel')

    expect(server.changes).toEqual([])
    expect(page.findAll('main tbody tr')).toHaveLength(3)
  })
})
