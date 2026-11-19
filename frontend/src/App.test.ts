import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App.vue'

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

describe('placeholder page', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a loading state while the API health request is pending', () => {
    fakeFetch(() => new Promise<Response>(() => {}))

    const page = mount(App)

    expect(page.get('[data-testid="api-status"]').text()).toBe('Checking API…')
  })

  it('shows the API as healthy when the health endpoint answers ok', async () => {
    const fetchFake = fakeFetch(async () => jsonResponse({ status: 'ok' }))

    const page = mount(App)
    await flushPromises()

    expect(page.get('[data-testid="api-status"]').text()).toBe('API is healthy')
    expect(fetchFake).toHaveBeenCalledWith('/api/v1/health')
  })

  it('shows the API as unavailable when the request cannot reach it', async () => {
    fakeFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    const page = mount(App)
    await flushPromises()

    expect(page.get('[data-testid="api-status"]').text()).toBe('API is unavailable')
  })

  it('shows the API as unavailable when the health endpoint answers with an error status', async () => {
    fakeFetch(async () => new Response('Bad Gateway', { status: 502 }))

    const page = mount(App)
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

    const page = mount(App)
    await flushPromises()

    expect(page.get('[data-testid="api-status"]').text()).not.toBe('API is healthy')
  })

  it('does not report a healthy API when the health endpoint answers 200 with a non-ok status', async () => {
    fakeFetch(async () => jsonResponse({ status: 'unavailable' }))

    const page = mount(App)
    await flushPromises()

    expect(page.get('[data-testid="api-status"]').text()).not.toBe('API is healthy')
  })
})
