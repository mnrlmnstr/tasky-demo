import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App.vue'
import { appPlugins } from './test/appPlugins'
import { fakeTasksApi } from './test/tasksApi'

const GENERIC_ERROR = 'Something went wrong. Please try again.'

let mounted: VueWrapper | undefined

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

describe('error kinds (adversary, decided in #43)', () => {
  // #17: "Known error types (missing field, too long, not found, server error) mapped to translated
  // messages; anything else falls back to a generic translated message". A 4xx is not a server error.
  it.each([400, 401, 403, 409, 429])('explains a %s answer with the generic message, not as a server error', async (status) => {
    const api = fakeTasksApi()
    mounted = mount(App, { attachTo: document.body, global: { plugins: appPlugins() } })

    await api.failWith(0, status)
    await flushPromises()

    expect(mounted.get('main [role="alert"] p').text()).toBe(GENERIC_ERROR)
  })
})
