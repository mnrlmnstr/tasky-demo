import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App.vue'
import { useSettingsStore, type Locale } from './stores/settings'
import { appPlugins } from './test/appPlugins'
import { fakeTasksApi, pageOf, task } from './test/tasksApi'

let mounted: VueWrapper | undefined

function mountApp(locale: Locale = 'en') {
  mounted = mount(App, { global: { plugins: appPlugins(locale) } })
  return mounted
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

describe('app shell', () => {
  it('names the header buttons in Ukrainian when the language is Ukrainian', () => {
    fakeTasksApi()

    const page = mountApp('uk')

    expect(page.find('header button[aria-label="Налаштування"]').exists()).toBe(true)
    expect(page.get('header button[data-variant="primary"]').text()).toBe('Нова задача')
  })

  it('shows the app title as the page heading inside the header', () => {
    fakeTasksApi()

    const page = mountApp()

    expect(page.get('header h1').text()).toBe('Tasky')
  })

  it('offers a settings button in the header, named for assistive technology and drawn as the settings icon', () => {
    fakeTasksApi()

    const page = mountApp()

    const settings = page.get('header button[aria-label="Settings"]')
    expect(settings.find('svg.lucide-settings').exists()).toBe(true)
  })

  it('offers a primary "New task" button with a plus icon in the header', () => {
    fakeTasksApi()

    const page = mountApp()

    const newTask = page.get('header button[data-variant="primary"]')
    expect(newTask.text()).toBe('New task')
    expect(newTask.find('svg.lucide-plus').exists()).toBe(true)
  })

  it('hides the decorative header icons from assistive technology', () => {
    fakeTasksApi()

    const page = mountApp()

    const icons = page.findAll('header button svg')
    expect(icons.map((icon) => icon.attributes('aria-hidden'))).toEqual(['true', 'true'])
  })

})

describe('task list on the page', () => {
  it('asks the API for the first page of tasks, newest first, once, and for nothing else', () => {
    const api = fakeTasksApi()

    mountApp()

    expect(api.paths).toEqual(['/api/v1/tasks'])
    expect(api.queries).toEqual([{ ordering: '-created_at', page: '1', page_size: '20' }])
  })

  it('says the tasks are loading in the main area until the API answers', () => {
    fakeTasksApi()

    const page = mountApp()

    expect(page.get('main [role="status"]').text()).toBe('Loading tasks…')
  })

  it('shows the tasks the API returned, with their count, in the main area', async () => {
    const api = fakeTasksApi()
    const page = mountApp()

    await api.respondTo(0, pageOf(['Write the report', 'Call the bank'], { total: 30, pages: 2 }))

    expect(titles(page)).toEqual(['Write the report', 'Call the bank'])
    expect(page.get('main [data-testid="task-total"]').text()).toBe('30 tasks')
    expect(page.get('main [data-testid="page-position"]').text()).toBe('Page 1 of 2')
  })

  it('shows each task with its status, priority, deadline and created date', async () => {
    const api = fakeTasksApi()
    const page = mountApp()

    await api.respondTo(0, {
      ...pageOf([]),
      total: 1,
      items: [
        task('Write the report', {
          status: 'in_progress',
          priority: 'high',
          deadline: '2001-02-03T10:00:00Z',
          created_at: '2001-01-01T10:00:00Z',
        }),
      ],
    })

    const row = page.get('main li')
    expect(row.get('[data-testid="task-status"]').attributes('aria-label')).toBe('Status: In progress. Change status')
    expect(row.get('[data-tone]').text()).toBe('High')
    expect(row.get('[data-testid="task-deadline"]').text()).toMatch(/^Due Feb 3, 2001, .+ · Overdue$/s)
    expect(row.get('time').text()).toMatch(/^Created \d+ years ago$/)
  })

  it('asks for as many tasks per page as the settings say', async () => {
    const api = fakeTasksApi()
    mountApp()
    await api.respondTo(0, pageOf(['Write the report']))

    useSettingsStore().pageSize = 50
    await flushPromises()

    expect(api.queries[1]).toEqual({ ordering: '-created_at', page: '1', page_size: '50' })
  })

  it('opens on the view the address asks for', () => {
    history.replaceState(null, '', '/?status=done&page=2')
    const api = fakeTasksApi()

    mountApp()

    expect(api.queries).toEqual([{ ordering: '-created_at', page: '2', page_size: '20', status: 'done' }])
  })

  it('explains a failed load and loads the tasks when "Try again" is pressed', async () => {
    const api = fakeTasksApi()
    const page = mountApp()
    await api.failWith(0, 502)
    const alert = page.get('main [role="alert"]')
    expect(alert.get('p').text()).toBe('Something went wrong on the server. Please try again.')

    await alert.get('button').trigger('click')
    await api.respondTo(1, pageOf(['Write the report']))

    expect(titles(page)).toEqual(['Write the report'])
    expect(page.find('main [role="alert"]').exists()).toBe(false)
  })

  it('redraws the page in the new language as soon as the language setting changes', async () => {
    const api = fakeTasksApi()
    const page = mountApp('en')
    await api.respondTo(0, pageOf(['Write the report', 'Call the bank', 'Book a flight']))

    useSettingsStore().locale = 'uk'
    await flushPromises()

    expect(page.get('header button[data-variant="primary"]').text()).toBe('Нова задача')
    expect(page.get('main [data-testid="task-total"]').text()).toBe('3 задачі')
    expect(page.get('main [data-testid="task-status"]').attributes('aria-label')).toBe('Статус: До виконання. Змінити статус')
  })
})

describe('settings from the header', () => {
  /** Lets the dialog finish its deferred work: focus moves and the outside-press listener are set up on a timer. */
  async function settle() {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flushPromises()
  }

  function mountAppOnPage() {
    mounted = mount(App, { global: { plugins: appPlugins() }, attachTo: document.body })
    return mounted
  }

  function findSettingsDialog(): HTMLElement | null {
    return document.body.querySelector<HTMLElement>('[role="dialog"]')
  }

  async function openSettings(page: VueWrapper) {
    const gear = page.get<HTMLButtonElement>('header button[aria-label="Settings"]')
    gear.element.focus()
    await gear.trigger('click')
    await settle()
    return gear.element
  }

  async function choose(label: string) {
    const options = [...(findSettingsDialog()?.querySelectorAll('button') ?? [])]
    const option = options.find((candidate) => candidate.textContent.trim() === label)
    if (!option) throw new Error(`The settings dialog has no option "${label}"`)
    option.click()
    await flushPromises()
  }

  function pressedOptions(): string[] {
    return [...(findSettingsDialog()?.querySelectorAll('button[aria-pressed="true"]') ?? [])].map(
      (option) => option.textContent.trim(),
    )
  }

  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
  })

  it('keeps the settings dialog closed until it is asked for', async () => {
    fakeTasksApi()

    mountAppOnPage()
    await settle()

    expect(findSettingsDialog()).toBeNull()
  })

  it('opens the settings dialog when the settings button is pressed, without asking the API again', async () => {
    const api = fakeTasksApi()
    const page = mountAppOnPage()
    await api.respondTo(0, pageOf(['Write the report']))

    await openSettings(page)

    const dialog = findSettingsDialog()
    expect(dialog?.textContent).toContain('Settings')
    expect(pressedOptions()).toEqual(['System', '20', 'English'])
    expect(api.queries).toHaveLength(1)
  })

  it('returns focus to the settings button when the dialog is closed', async () => {
    fakeTasksApi()
    const page = mountAppOnPage()
    const gear = await openSettings(page)
    expect(findSettingsDialog()?.contains(document.activeElement)).toBe(true)

    findSettingsDialog()?.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click()
    await settle()

    expect(findSettingsDialog()).toBeNull()
    expect(document.activeElement).toBe(gear)
  })

  it('turns the page dark as soon as "Dark" is picked, and keeps it dark after a reload', async () => {
    fakeTasksApi()
    const page = mountAppOnPage()
    await openSettings(page)

    await choose('Dark')

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    page.unmount()
    disposePinia(getActivePinia()!)
    document.documentElement.removeAttribute('data-theme')
    const reloaded = mountAppOnPage()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    await openSettings(reloaded)
    expect(pressedOptions()).toContain('Dark')
  })

  it('asks for the first page with 50 tasks as soon as "50" is picked', async () => {
    history.replaceState(null, '', '/?page=2')
    const api = fakeTasksApi()
    const page = mountAppOnPage()
    await api.respondTo(0, pageOf(['Write the report'], { page: 2, pages: 2, total: 21 }))
    await openSettings(page)

    await choose('50')

    expect(api.queries).toHaveLength(2)
    expect(api.queries[1]).toEqual({ ordering: '-created_at', page: '1', page_size: '50' })
  })

  it('switches the header, the list and the dialog to Ukrainian as soon as "Українська" is picked', async () => {
    const api = fakeTasksApi()
    const page = mountAppOnPage()
    await api.respondTo(0, pageOf(['Write the report', 'Call the bank', 'Book a flight']))
    await openSettings(page)

    await choose('Українська')

    expect(page.get('header button[data-variant="primary"]').text()).toBe('Нова задача')
    expect(page.find('header button[aria-label="Налаштування"]').exists()).toBe(true)
    expect(page.get('main [data-testid="task-total"]').text()).toBe('3 задачі')
    expect(findSettingsDialog()?.textContent).toContain('Задач на сторінці')
    expect(document.documentElement.lang).toBe('uk')
    expect(api.queries).toHaveLength(1)
  })
})
