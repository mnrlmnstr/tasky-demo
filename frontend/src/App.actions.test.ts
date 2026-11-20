import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskRead } from './api/generated/client'
import App from './App.vue'
import { useTasksStore } from './stores/tasks'
import { appPlugins } from './test/appPlugins'
import { task } from './test/tasksApi'
import { taskServer } from './test/taskServer'

const TOAST = '[data-testid="undo-toast"]'
const SERVER_ERROR = 'Something went wrong on the server. Please try again.'
const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.'

let mounted: VueWrapper | undefined

/** Lets reka-ui finish its deferred work (focus moves run on a timer) and the requests behind it settle. */
async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function openApp(rows: TaskRead[], address = '/') {
  const server = taskServer(rows)
  history.replaceState(null, '', address)
  mounted = mount(App, { attachTo: document.body, global: { plugins: appPlugins() } })
  await settle()
  return { page: mounted, server }
}

function titles(page: VueWrapper): string[] {
  return page.findAll('main [data-testid="task-title"]').map((title) => title.text())
}

function rowOf(page: VueWrapper, title: string): DOMWrapper<Element> {
  const row = page.findAll('main li').find((item) => item.get('[data-testid="task-title"]').text() === title)
  if (!row) throw new Error(`The list has no "${title}" row`)
  return row
}

function statusTrigger(page: VueWrapper, title: string) {
  return rowOf(page, title).get<HTMLButtonElement>('[data-testid="task-status"]')
}

function deleteButton(page: VueWrapper, title: string) {
  return rowOf(page, title).get<HTMLButtonElement>('button[aria-label="Delete task"]')
}

function menuItems(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitemradio"]'))
}

async function openStatusMenu(page: VueWrapper, title: string) {
  statusTrigger(page, title).element.click()
  await settle()
}

async function pickStatus(page: VueWrapper, title: string, label: string) {
  await openStatusMenu(page, title)
  const item = menuItems().find((candidate) => candidate.textContent?.trim() === label)
  if (!item) throw new Error(`The status menu has no "${label}" item`)
  item.click()
  await settle()
}

function findDialog(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[role="alertdialog"]')
}

async function askToDelete(page: VueWrapper, title: string) {
  const button = deleteButton(page, title).element
  button.focus()
  button.click()
  await settle()
}

async function pressDialogButton(label: string) {
  const button = Array.from(findDialog()?.querySelectorAll('button') ?? []).find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!button) throw new Error(`The dialog has no "${label}" button`)
  button.click()
  await settle()
}

async function pressKey(key: string) {
  const target = document.activeElement as Element
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  await settle()
}

function listRegion(page: VueWrapper): Element {
  return page.get('main section[aria-label="Tasks"]').element
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

describe('changing the status from the row', () => {
  it('offers the three statuses in a menu opened from the status icon, with the current one marked', async () => {
    const { page } = await openApp([task('Write', { status: 'in_progress' })])
    const trigger = statusTrigger(page, 'Write')
    expect(trigger.attributes('aria-label')).toBe('Status: In progress. Change status')
    expect(trigger.attributes('aria-haspopup')).toBe('menu')

    await openStatusMenu(page, 'Write')

    expect(menuItems().map((item) => item.textContent?.trim())).toEqual(['To do', 'In progress', 'Done'])
    expect(menuItems().map((item) => item.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    expect(menuItems().map((item) => item.querySelector('svg[aria-hidden="true"]') !== null)).toEqual([
      true,
      true,
      true,
    ])
  })

  it('shows the picked status at once, sends it, and shows progress until the answer', async () => {
    const { page, server } = await openApp([task('Write'), task('Call')])
    const release = server.hold()

    await pickStatus(page, 'Write', 'Done')

    const trigger = statusTrigger(page, 'Write')
    expect(trigger.attributes('aria-label')).toBe('Status: Done. Change status')
    expect(trigger.find('svg.lucide-circle-check').exists()).toBe(true)
    expect(trigger.attributes('aria-busy')).toBe('true')
    expect(rowOf(page, 'Write').get('[data-testid="task-title"]').classes()).toContain('text-text-muted')
    expect(server.changes).toEqual([{ method: 'PATCH', path: '/api/v1/tasks/id-Write', body: { status: 'done' } }])
    expect(page.find(TOAST).exists()).toBe(false)

    release()
    await settle()

    expect(statusTrigger(page, 'Write').attributes('aria-busy')).toBeUndefined()
    expect(statusTrigger(page, 'Write').attributes('aria-label')).toBe('Status: Done. Change status')
    expect(statusTrigger(page, 'Call').attributes('aria-label')).toBe('Status: To do. Change status')
  })

  it('cannot be used again while the request is in flight', async () => {
    const { page, server } = await openApp([task('Write')])
    const release = server.hold()
    await pickStatus(page, 'Write', 'Done')

    await openStatusMenu(page, 'Write')
    expect(menuItems().map((item) => item.getAttribute('aria-disabled'))).toEqual(['true', 'true', 'true'])
    menuItems()[0].click()
    await pressKey('Escape')
    deleteButton(page, 'Write').element.click()
    await settle()

    expect(deleteButton(page, 'Write').attributes('aria-disabled')).toBe('true')
    expect(findDialog()).toBeNull()
    expect(server.changes).toHaveLength(1)

    release()
    await settle()
    expect(deleteButton(page, 'Write').attributes('aria-disabled')).toBeUndefined()
    await openStatusMenu(page, 'Write')
    expect(menuItems().map((item) => item.getAttribute('aria-disabled'))).toEqual([null, null, null])
  })

  it('reloads the list and offers to undo the change once it is saved', async () => {
    const { page, server } = await openApp([task('Write')])
    const listsBefore = server.lists

    await pickStatus(page, 'Write', 'In progress')

    expect(server.lists).toBe(listsBefore + 1)
    expect(page.get(TOAST).text()).toContain('Status changed')

    await page.get(`${TOAST} button[data-variant="ghost"]`).trigger('click')
    await settle()

    expect(server.changes[1]).toEqual({ method: 'PATCH', path: '/api/v1/tasks/id-Write', body: { status: 'todo' } })
    expect(statusTrigger(page, 'Write').attributes('aria-label')).toBe('Status: To do. Change status')
  })

  it('does nothing when the current status is picked again', async () => {
    const { page, server } = await openApp([task('Write')])

    await pickStatus(page, 'Write', 'To do')

    expect(server.changes).toEqual([])
    expect(page.find(TOAST).exists()).toBe(false)
  })

  it('lets the task leave a filter it no longer matches, still offering the undo', async () => {
    const { page } = await openApp([task('Write'), task('Call')], '/?status=todo')

    await pickStatus(page, 'Write', 'Done')

    expect(titles(page)).toEqual(['Call'])
    expect(page.get(TOAST).text()).toContain('Status changed')
  })

  it.each([
    [500, SERVER_ERROR],
    ['offline', NETWORK_ERROR],
    [422, 'Something went wrong. Please try again.'],
  ] as const)('puts the row back and says what went wrong when the change fails (%s)', async (how, message) => {
    const { page, server } = await openApp([task('Write', { status: 'in_progress' })])
    server.failChanges(how)
    const release = server.hold()
    await pickStatus(page, 'Write', 'Done')
    expect(statusTrigger(page, 'Write').attributes('aria-label')).toBe('Status: Done. Change status')

    release()
    await settle()

    const trigger = statusTrigger(page, 'Write')
    expect(trigger.attributes('aria-label')).toBe('Status: In progress. Change status')
    expect(trigger.attributes('aria-busy')).toBeUndefined()
    expect(page.get(`${TOAST} p`).text()).toBe(message)
    expect(page.get(`${TOAST} p`).classes()).toContain('text-danger-text')
    expect(page.find(`${TOAST} button[data-variant="ghost"]`).exists()).toBe(false)
  })

  it('shows one message at a time when one failure follows another', async () => {
    const { page, server } = await openApp([task('Write'), task('Call')])
    server.failChanges(500)
    await pickStatus(page, 'Write', 'Done')

    server.failChanges('offline')
    await pickStatus(page, 'Call', 'Done')

    expect(page.findAll(TOAST)).toHaveLength(1)
    expect(page.get(`${TOAST} p`).text()).toBe(NETWORK_ERROR)
  })

  it('says the task no longer exists and takes the row away when it was deleted meanwhile', async () => {
    const rows = [task('Write'), task('Call')]
    const { page } = await openApp(rows)
    rows.shift()

    await pickStatus(page, 'Write', 'Done')

    expect(page.get(`${TOAST} p`).text()).toBe('This task no longer exists.')
    expect(titles(page)).toEqual(['Call'])
  })

  it('keeps showing the picked status when the list reloads before the answer', async () => {
    const { page, server } = await openApp([task('Write')])
    const release = server.hold()
    await pickStatus(page, 'Write', 'Done')

    useTasksStore().retry()
    await settle()
    expect(statusTrigger(page, 'Write').attributes('aria-label')).toBe('Status: Done. Change status')

    release()
    await settle()
    expect(statusTrigger(page, 'Write').attributes('aria-label')).toBe('Status: Done. Change status')
  })

  it('undoes back to the status the row showed, also when the list could not be reloaded in between', async () => {
    const rows = [task('Write')]
    const { page, server } = await openApp(rows)
    const serve = vi.mocked(fetch).getMockImplementation() as typeof fetch
    // The first change is saved, but the reload after it fails: the row keeps showing what was picked.
    vi.mocked(fetch).mockImplementation((input, init) =>
      init?.method === 'GET' ? Promise.resolve(new Response('{}', { status: 500 })) : serve(input, init),
    )
    await pickStatus(page, 'Write', 'In progress')
    expect(statusTrigger(page, 'Write').attributes('aria-label')).toBe('Status: In progress. Change status')

    vi.mocked(fetch).mockImplementation(serve)
    await pickStatus(page, 'Write', 'Done')
    await page.get(`${TOAST} button[data-variant="ghost"]`).trigger('click')
    await settle()

    expect(server.changes[2].body).toEqual({ status: 'in_progress' })
    expect(statusTrigger(page, 'Write').attributes('aria-label')).toBe('Status: In progress. Change status')
  })

  it('works from the keyboard and leaves the focus on the status icon', async () => {
    const { page, server } = await openApp([task('Write')])
    const trigger = statusTrigger(page, 'Write').element
    trigger.focus()

    await pressKey('ArrowDown')
    expect(document.body.querySelector('[role="menu"]')?.contains(document.activeElement)).toBe(true)
    await pressKey('End')
    await pressKey('Enter')

    expect(server.changes).toEqual([{ method: 'PATCH', path: '/api/v1/tasks/id-Write', body: { status: 'done' } }])
    expect(document.body.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(statusTrigger(page, 'Write').element)
  })

  it('moves the focus to the list when the row leaves with the focus on it', async () => {
    const { page } = await openApp([task('Write'), task('Call')], '/?status=todo')
    statusTrigger(page, 'Write').element.focus()

    await pressKey('ArrowDown')
    await pressKey('End')
    await pressKey('Enter')

    expect(titles(page)).toEqual(['Call'])
    expect(document.activeElement).toBe(listRegion(page))
  })

  it('moves the focus to the list when the row leaves while the focus is still in its menu', async () => {
    const { page, server } = await openApp([task('Write'), task('Call')], '/?status=todo')
    const release = server.hold()
    await pickStatus(page, 'Write', 'Done')
    statusTrigger(page, 'Write').element.focus()
    await pressKey('ArrowDown')
    expect(document.body.querySelector('[role="menu"]')?.contains(document.activeElement)).toBe(true)

    release()
    await flushPromises()

    expect(titles(page)).toEqual(['Call'])
    expect(document.activeElement).toBe(listRegion(page))
  })

  it('leaves the focus alone when the row leaves after the user has moved on', async () => {
    const { page, server } = await openApp([task('Write'), task('Call')], '/?status=todo')
    const release = server.hold()
    await pickStatus(page, 'Write', 'Done')
    const search = page.get<HTMLInputElement>('input[type="search"]').element
    search.focus()

    release()
    await settle()

    expect(titles(page)).toEqual(['Call'])
    expect(document.activeElement).toBe(search)
  })

  it('does not take the focus for a row that goes away without having been acted on', async () => {
    const rows = [task('Write'), task('Call')]
    const { page } = await openApp(rows)
    rows.shift()

    useTasksStore().retry()
    await settle()

    expect(titles(page)).toEqual(['Call'])
    expect(document.activeElement).toBe(document.body)
  })
})

describe('deleting from the row', () => {
  it('asks first, naming the task', async () => {
    const { page, server } = await openApp([task('Write the report')])

    await askToDelete(page, 'Write the report')

    const dialog = findDialog()
    expect(dialog?.textContent).toContain('Delete «Write the report»?')
    expect(dialog?.textContent).toContain('This cannot be undone.')
    expect(Array.from(dialog?.querySelectorAll('button') ?? []).map((button) => button.textContent?.trim())).toEqual([
      'Cancel',
      'Delete',
    ])
    expect(server.changes).toEqual([])
  })

  it.each([
    ['Cancel is pressed', () => pressDialogButton('Cancel')],
    ['Escape is pressed', () => pressKey('Escape')],
  ])('leaves the task alone when %s, with the focus back on the delete button', async (_name, cancel) => {
    const { page, server } = await openApp([task('Write'), task('Call')])
    await askToDelete(page, 'Write')

    await cancel()

    expect(findDialog()).toBeNull()
    expect(server.changes).toEqual([])
    expect(titles(page)).toEqual(['Write', 'Call'])
    expect(rowOf(page, 'Write').get('div').attributes('aria-busy')).toBeUndefined()
    expect(document.activeElement).toBe(deleteButton(page, 'Write').element)
  })

  it('shows progress on the row while the task is being deleted, then takes it off the list', async () => {
    const { page, server } = await openApp([task('Write'), task('Call')])
    const header = page.get('h1').element
    const release = server.hold()
    await askToDelete(page, 'Write')

    await pressDialogButton('Delete')

    expect(findDialog()).toBeNull()
    const row = rowOf(page, 'Write').get('div')
    expect(row.attributes('aria-busy')).toBe('true')
    expect(row.classes()).toContain('opacity-50')
    expect(rowOf(page, 'Call').get('div').attributes('aria-busy')).toBeUndefined()
    expect(server.changes).toEqual([{ method: 'DELETE', path: '/api/v1/tasks/id-Write', body: undefined }])

    release()
    await settle()

    expect(titles(page)).toEqual(['Call'])
    expect(page.get('[data-testid="task-total"]').text()).toBe('1 task')
    expect(page.get('h1').element).toBe(header)
  })

  it('offers no undo after a delete', async () => {
    const { page } = await openApp([task('Write'), task('Call')])
    await askToDelete(page, 'Write')

    await pressDialogButton('Delete')

    expect(titles(page)).toEqual(['Call'])
    expect(page.find(TOAST).exists()).toBe(false)
  })

  it('ignores the row controls while the task is being deleted', async () => {
    const { page, server } = await openApp([task('Write')])
    server.hold()
    await askToDelete(page, 'Write')
    await pressDialogButton('Delete')

    expect(deleteButton(page, 'Write').attributes('aria-disabled')).toBe('true')
    deleteButton(page, 'Write').element.click()
    await settle()
    expect(findDialog()).toBeNull()

    await openStatusMenu(page, 'Write')
    expect(menuItems().map((item) => item.getAttribute('aria-disabled'))).toEqual(['true', 'true', 'true'])
    expect(server.changes).toHaveLength(1)
  })

  it.each([
    [500, SERVER_ERROR],
    ['offline', NETWORK_ERROR],
  ] as const)('brings the row back and says what went wrong when the delete fails (%s)', async (how, message) => {
    const { page, server } = await openApp([task('Write'), task('Call')])
    server.failChanges(how)
    await askToDelete(page, 'Write')

    await pressDialogButton('Delete')

    const row = rowOf(page, 'Write').get('div')
    expect(row.attributes('aria-busy')).toBeUndefined()
    expect(row.classes()).not.toContain('opacity-50')
    expect(titles(page)).toEqual(['Write', 'Call'])
    expect(page.get(`${TOAST} p`).text()).toBe(message)
    expect(page.find(`${TOAST} button[data-variant="ghost"]`).exists()).toBe(false)
    expect(document.activeElement).toBe(deleteButton(page, 'Write').element)
  })

  it('takes a task that is already gone off the list quietly', async () => {
    const rows = [task('Write'), task('Call')]
    const { page, server } = await openApp(rows)
    rows.shift()
    await askToDelete(page, 'Write')

    await pressDialogButton('Delete')

    expect(server.changes).toHaveLength(1)
    expect(titles(page)).toEqual(['Call'])
    expect(page.find(TOAST).exists()).toBe(false)
  })

  it('moves to the previous page after the last task on a page is deleted, without a new history entry', async () => {
    const rows = Array.from({ length: 21 }, (_, index) => task(`Task ${index + 1}`))
    const { page } = await openApp(rows, '/?page=2')
    expect(titles(page)).toEqual(['Task 21'])
    expect(page.get('[data-testid="page-position"]').text()).toBe('Page 2 of 2')
    const entries = history.length
    await askToDelete(page, 'Task 21')

    await pressDialogButton('Delete')

    expect(titles(page)).toHaveLength(20)
    expect(titles(page)[19]).toBe('Task 20')
    expect(page.get('[data-testid="task-total"]').text()).toBe('20 tasks')
    expect(location.search).toBe('')
    expect(history.length).toBe(entries)
  })

  it('moves the focus to the list once the row is gone', async () => {
    const { page } = await openApp([task('Write'), task('Call')])
    await askToDelete(page, 'Write')

    await pressDialogButton('Delete')

    expect(document.activeElement).toBe(listRegion(page))
  })

  it('moves the focus to the list also when the deleted task was the only one', async () => {
    const { page } = await openApp([task('Write')])
    await askToDelete(page, 'Write')

    await pressDialogButton('Delete')

    expect(page.find('[data-testid="task-list-empty"]').exists()).toBe(true)
    expect(document.activeElement).toBe(listRegion(page))
  })

  it('does not leave the focus on a row that is fading out when a closing dialog hands it back late', async () => {
    const { page } = await openApp([task('Write'), task('Call')])
    const button = deleteButton(page, 'Write').element
    await askToDelete(page, 'Write')
    await pressDialogButton('Delete')
    ;(document.activeElement as HTMLElement).blur()

    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))

    expect(document.activeElement).toBe(listRegion(page))
  })
})
