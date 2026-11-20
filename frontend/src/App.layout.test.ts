import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskRead } from './api/generated/client'
import App from './App.vue'
import type { Locale } from './stores/settings'
import { appPlugins } from './test/appPlugins'
import { fakeTasksApi, pageOf, task } from './test/tasksApi'
import { taskServer } from './test/taskServer'

let mounted: VueWrapper | undefined

async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function openApp(address = '/', locale: Locale = 'en', rows: TaskRead[] = defaultRows()) {
  const server = taskServer(rows)
  history.replaceState(null, '', address)
  mounted = mount(App, { attachTo: document.body, global: { plugins: appPlugins(locale) } })
  await settle()
  return { page: mounted, server }
}

function defaultRows(): TaskRead[] {
  return [task('Write'), task('Call'), task('Plan', { status: 'in_progress' }), task('Ship', { status: 'done' })]
}

async function switchTo(page: VueWrapper, name: string) {
  await page.get(`[role="group"][aria-label="View"] button[aria-label="${name}"]`).trigger('click')
  await settle()
}

function card(page: VueWrapper): HTMLElement {
  return page.get('[data-testid="card"]').element as HTMLElement
}

/** Each control at the end of the toolbar, by what it is, in the order it sits there. */
function endControls(page: VueWrapper): string[] {
  const end = page.get('[data-testid="toolbar-end"]').element
  return Array.from(end.children).map((control) => {
    if (control.matches('[data-testid="deadline-filter"]')) return 'deadline'
    if (control.matches('[aria-haspopup="menu"]')) return 'sort'
    if (control.matches('[role="group"]')) return 'view'
    if (control.textContent?.trim() === 'Clear filters') return 'clear'
    return control.outerHTML
  })
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

describe('top bar', () => {
  it('shows the app name in bold as the page heading, above the card and outside it', async () => {
    const { page } = await openApp()

    const heading = page.get('h1')
    expect(heading.text()).toBe('Tasky')
    expect(heading.classes()).toContain('font-bold')
    expect(heading.classes()).not.toContain('sr-only')
    expect(page.findAll('h1')).toHaveLength(1)
    const bar = page.get('header').element
    expect(bar.contains(heading.element)).toBe(true)
    expect(card(page).contains(bar)).toBe(false)
    expect(bar.compareDocumentPosition(card(page)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('names itself in Ukrainian as well, the name staying Tasky', async () => {
    const { page } = await openApp('/', 'uk')

    expect(page.get('header h1').text()).toBe('Tasky')
    expect(page.find('header button[aria-label="Налаштування"]').exists()).toBe(true)
  })

  it('puts the name first and the settings button last, at the far ends of the bar', async () => {
    const { page } = await openApp()

    const bar = page.get('header')
    expect(bar.classes()).toEqual(expect.arrayContaining(['flex', 'justify-between']))
    const children = Array.from(bar.element.children)
    expect(children[0].tagName).toBe('H1')
    expect(bar.element.querySelector('button')?.getAttribute('aria-label')).toBe('Settings')
    expect(card(page).querySelector('button[aria-label="Settings"]')).toBeNull()
  })

  it('opens the settings dialog from the top bar', async () => {
    const { page } = await openApp()

    await page.get('header button[aria-label="Settings"]').trigger('click')
    await settle()

    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Settings')
  })

  it('keeps a 16px gutter on a phone and lines up with the card from the small breakpoint up', async () => {
    const { page } = await openApp()

    const bar = page.get('header').element
    expect(bar.classList).toContain('px-4')
    expect(bar.classList).toContain('sm:px-0')
    // The bar and the card share one column of the page's width.
    expect(bar.parentElement).toBe(card(page).parentElement)
  })
})

describe('card header', () => {
  it('holds the search, which takes the free width, and "New task" after it', async () => {
    const { page } = await openApp()

    const header = page.get('[data-testid="card-header"]')
    const controls = Array.from(header.element.querySelectorAll('input, button'))
    expect(controls.map((control) => control.getAttribute('aria-label') ?? control.textContent?.trim())).toEqual([
      'Search tasks',
      'New task',
    ])
    expect((header.get('input').element.parentElement as HTMLElement).classList).toContain('flex-1')
  })
})

describe('one layout for every view', () => {
  it('keeps the card at one width in the list, the board and the table', async () => {
    const { page } = await openApp()
    const width = () => Array.from((card(page).parentElement as HTMLElement).classList).filter((name) => name.startsWith('max-w-'))
    const list = width()
    expect(list).toHaveLength(1)

    await switchTo(page, 'Board')
    expect(width()).toEqual(list)
    await switchTo(page, 'Table')
    expect(width()).toEqual(list)
  })

  it.each([
    ['list', '/'],
    ['board', '/?view=board'],
    ['table', '/?view=table'],
  ])('puts the deadline filter, the sorting and the view switch at the end of the toolbar in the %s', async (_view, address) => {
    const { page } = await openApp(address)

    expect(endControls(page)).toEqual(['deadline', 'sort', 'view'])
    expect(page.get('[data-testid="toolbar-end"]').classes()).toContain('justify-end')
  })

  it.each([
    ['list', '/?search=wr'],
    ['board', '/?view=board&search=wr'],
    ['table', '/?view=table&search=wr'],
  ])('puts "Clear filters" first at the end of the toolbar in the %s, once filtered', async (_view, address) => {
    const { page } = await openApp(address)

    expect(endControls(page)).toEqual(['clear', 'deadline', 'sort', 'view'])
  })

  it('shows the status filter at the start of the toolbar in the list and the table', async () => {
    const { page } = await openApp()
    const start = () => page.get('[data-testid="toolbar-start"]')

    expect(start().find('[role="group"][aria-label="Status"]').exists()).toBe(true)
    await switchTo(page, 'Table')
    expect(start().find('[role="group"][aria-label="Status"]').exists()).toBe(true)
  })

  it('shows how many tasks the board holds at the start of the toolbar, where the status filter would be', async () => {
    const { page } = await openApp('/?view=board')

    const start = page.get('[data-testid="toolbar-start"]')
    expect(start.find('[role="group"]').exists()).toBe(false)
    expect(start.get('[data-testid="board-total"]').text()).toBe('4 tasks')
  })

  it('shows no board count until every column has answered', async () => {
    const api = fakeTasksApi()
    history.replaceState(null, '', '/?view=board')
    mounted = mount(App, { attachTo: document.body, global: { plugins: appPlugins() } })
    await settle()
    const page = mounted
    const total = () => page.get('[data-testid="board-total"]').text()

    await api.respondTo(0, pageOf(['Write']))
    await api.respondTo(1, pageOf(['Plan']))
    expect(total()).toBe('')

    await api.failWith(2, 500)
    expect(total()).toBe('')
  })

  it('counts the board in Ukrainian', async () => {
    const { page } = await openApp('/?view=board', 'uk')

    expect(page.get('[data-testid="board-total"]').text()).toBe('4 задачі')
  })

  it('keeps the start of the toolbar at the height of the status filter on the board', async () => {
    const { page } = await openApp('/?view=board')

    expect(page.get('[data-testid="toolbar-start"]').classes()).toContain('h-9')
  })

  it('shows the count line in the same place, right under the toolbar, in the list and the table', async () => {
    const { page } = await openApp()
    const countAfterToolbar = () => {
      const toolbar = page.get('[data-testid="toolbar"]').element
      const total = page.get('[data-testid="task-total"]').element
      const list = total.closest('section') as HTMLElement
      return {
        next: toolbar.nextElementSibling === list,
        first: Array.from(list.children).find((child) => !child.matches('[role="status"]')) === total,
      }
    }
    expect(countAfterToolbar()).toEqual({ next: true, first: true })

    await switchTo(page, 'Table')

    expect(countAfterToolbar()).toEqual({ next: true, first: true })
  })
})
