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
})
