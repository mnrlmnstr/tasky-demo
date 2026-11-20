import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskRead } from '../../api/generated/client'
import { CLOCK, type Clock } from '../../i18n/clock'
import { useTaskFormStore } from '../../stores/taskForm'
import { appPlugins } from '../../test/appPlugins'
import { requestUrl } from '../../test/requestUrl'
import { pageOf, task } from '../../test/tasksApi'
import TaskFormDialog from './TaskFormDialog.vue'

const KYIV_NOON: Clock = { now: () => new Date('2026-03-05T12:00:00Z'), timeZone: 'Europe/Kyiv' }

interface SentRequest {
  method: string
  path: string
  body: unknown
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function fakeServer() {
  const changes: SentRequest[] = []
  const respond: typeof fetch = async (input, init) => {
    const method = init?.method ?? 'GET'
    if (method === 'GET') return json(pageOf([]))
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    changes.push({ method, path: requestUrl(input).pathname, body })
    return json({ ...task('Saved'), ...(body as Partial<TaskRead>) }, method === 'POST' ? 201 : 200)
  }
  vi.stubGlobal('fetch', vi.fn(respond))
  return { changes }
}

let mounted: VueWrapper | undefined

async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function openCreate() {
  mounted = mount(TaskFormDialog, {
    attachTo: document.body,
    global: { plugins: appPlugins('en'), provide: { [CLOCK as symbol]: KYIV_NOON } },
  })
  useTaskFormStore().openCreate()
  await settle()
}

function get<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = document.body.querySelector<T>(selector)
  if (!found) throw new Error(`Nothing on the page matches ${selector}`)
  return found
}

const titleField = () => get<HTMLInputElement>('[data-field="title"] input')
const submitButton = () => get<HTMLButtonElement>('[data-testid="dialog-footer"] button[data-variant="primary"]')

async function type(field: HTMLInputElement, text: string) {
  field.value = text
  field.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

function errorOf(field: string): string {
  return document.body.querySelector(`[data-testid="error-${field}"]`)?.textContent.trim() ?? ''
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

describe('TaskFormDialog title validation against the API (adversary)', () => {
  // #14: "Client-side validation matching the API (title required, ≤200 chars)". The API (pydantic
  // max_length) counts characters (code points): 150 emoji is a 150-character title it accepts.
  it('sends a title of 150 emoji, which the API accepts as 150 characters', async () => {
    const server = fakeServer()
    await openCreate()
    await type(titleField(), '😀'.repeat(150))

    submitButton().click()
    await settle()

    expect(errorOf('title')).toBe('')
    expect(server.changes).toHaveLength(1)
  })
})
