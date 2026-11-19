import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App.vue'
import { useSettingsStore, type Locale } from './stores/settings'
import { appPlugins } from './test/appPlugins'

function mountApp(locale: Locale = 'en') {
  return mount(App, { global: { plugins: appPlugins(locale) } })
}

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

describe('app shell', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('names the header buttons in Ukrainian when the language is Ukrainian', () => {
    fakeFetch(() => new Promise<Response>(() => {}))

    const page = mountApp('uk')

    expect(page.find('header button[aria-label="Налаштування"]').exists()).toBe(true)
    expect(page.get('header button[data-variant="primary"]').text()).toBe('Нова задача')
  })

  it.each([
    ['while the health request is pending', () => new Promise<Response>(() => {}), 'Перевіряємо API…'],
    ['when the health endpoint answers ok', async () => jsonResponse({ status: 'ok' }), 'API працює'],
    ['when the health endpoint fails', async () => new Response('Bad Gateway', { status: 502 }), 'API недоступний'],
  ])('shows the API status in Ukrainian %s', async (_name, respond, expected) => {
    fakeFetch(respond)

    const page = mountApp('uk')
    await flushPromises()

    expect(page.get('[data-testid="api-status"]').text()).toBe(expected)
  })

  it('redraws the page in the new language as soon as the language setting changes', async () => {
    fakeFetch(async () => jsonResponse({ status: 'ok' }))
    const page = mountApp('en')
    await flushPromises()

    useSettingsStore().locale = 'uk'
    await flushPromises()

    expect(page.get('header button[data-variant="primary"]').text()).toBe('Нова задача')
    expect(page.get('[data-testid="api-status"]').text()).toBe('API працює')
  })

  it('shows the app title as the page heading inside the header', () => {
    fakeFetch(() => new Promise<Response>(() => {}))

    const page = mountApp()

    expect(page.get('header h1').text()).toBe('Tasky')
  })

  it('offers a settings button in the header, named for assistive technology and drawn as the settings icon', () => {
    fakeFetch(() => new Promise<Response>(() => {}))

    const page = mountApp()

    const settings = page.get('header button[aria-label="Settings"]')
    expect(settings.find('svg.lucide-settings').exists()).toBe(true)
  })

  it('offers a primary "New task" button with a plus icon in the header', () => {
    fakeFetch(() => new Promise<Response>(() => {}))

    const page = mountApp()

    const newTask = page.get('header button[data-variant="primary"]')
    expect(newTask.text()).toBe('New task')
    expect(newTask.find('svg.lucide-plus').exists()).toBe(true)
  })

  it('hides the decorative header icons from assistive technology', () => {
    fakeFetch(() => new Promise<Response>(() => {}))

    const page = mountApp()

    const icons = page.findAll('header button svg')
    expect(icons.map((icon) => icon.attributes('aria-hidden'))).toEqual(['true', 'true'])
  })

  it('keeps the page as it is when the header buttons are pressed, since nothing is wired to them yet', async () => {
    fakeFetch(async () => jsonResponse({ status: 'ok' }))
    const page = mountApp()
    await flushPromises()
    const before = page.html()

    await page.get('header button[aria-label="Settings"]').trigger('click')
    await page.get('header button[data-variant="primary"]').trigger('click')

    expect(page.html()).toBe(before)
  })

  it('announces the API status line in the main area', () => {
    fakeFetch(() => new Promise<Response>(() => {}))

    const page = mountApp()

    expect(page.get('main [data-testid="api-status"]').attributes('role')).toBe('status')
  })

  it('shows a loading state while the API health request is pending', () => {
    fakeFetch(() => new Promise<Response>(() => {}))

    const page = mountApp()

    expect(page.get('[data-testid="api-status"]').text()).toBe('Checking API…')
  })

  it('shows the API as healthy when the health endpoint answers ok', async () => {
    const fetchFake = fakeFetch(async () => jsonResponse({ status: 'ok' }))

    const page = mountApp()
    await flushPromises()

    expect(page.get('[data-testid="api-status"]').text()).toBe('API is healthy')
    expect(fetchFake).toHaveBeenCalledExactlyOnceWith('/api/v1/health', { method: 'GET' })
  })

  it('shows the API as unavailable when the request cannot reach it', async () => {
    fakeFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    const page = mountApp()
    await flushPromises()

    expect(page.get('[data-testid="api-status"]').text()).toBe('API is unavailable')
  })

  it('shows the API as unavailable when the health endpoint answers with an error status', async () => {
    fakeFetch(async () => new Response('Bad Gateway', { status: 502 }))

    const page = mountApp()
    await flushPromises()

    expect(page.get('[data-testid="api-status"]').text()).toBe('API is unavailable')
  })

  it('does not report a healthy API when /api is not proxied and the dev server answers with its own page', async () => {
    // Without the proxy the Vite dev server answers any unknown path with index.html and status 200.
    fakeFetch(
      async () =>
        new Response('<!doctype html><html><body><div id="app"></div></body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
    )

    const page = mountApp()
    await flushPromises()

    expect(page.get('[data-testid="api-status"]').text()).not.toBe('API is healthy')
  })

  it('does not report a healthy API when the health endpoint answers 200 with a non-ok status', async () => {
    fakeFetch(async () => jsonResponse({ status: 'unavailable' }))

    const page = mountApp()
    await flushPromises()

    expect(page.get('[data-testid="api-status"]').text()).not.toBe('API is healthy')
  })

  it('shows the API as unavailable when the health endpoint answers 200 with a body that is not JSON', async () => {
    fakeFetch(
      async () =>
        new Response('{"status": "ok"', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )

    const page = mountApp()
    await flushPromises()

    expect(page.get('[data-testid="api-status"]').text()).toBe('API is unavailable')
  })

  it('shows the API as unavailable when the health endpoint answers 200 with an empty body', async () => {
    fakeFetch(async () => new Response(null, { status: 200 }))

    const page = mountApp()
    await flushPromises()

    expect(page.get('[data-testid="api-status"]').text()).toBe('API is unavailable')
  })

  it.each([
    ['an object without a status field', {}],
    ['a status of another type', { status: true }],
    ['a status in another letter case', { status: 'OK' }],
    ['the status nested in another object', { data: { status: 'ok' } }],
    ['null', null],
    ['a bare string', 'ok'],
    ['an array', [{ status: 'ok' }]],
  ])('shows the API as unavailable when the health endpoint answers 200 with %s', async (_name, body) => {
    fakeFetch(async () => jsonResponse(body))

    const page = mountApp()
    await flushPromises()

    expect(page.get('[data-testid="api-status"]').text()).toBe('API is unavailable')
  })
})
