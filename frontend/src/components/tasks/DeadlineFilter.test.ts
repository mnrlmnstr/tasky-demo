import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CLOCK, type Clock } from '../../i18n/clock'
import { useListViewStore } from '../../stores/listView'
import type { Locale } from '../../stores/settings'
import { appPlugins } from '../../test/appPlugins'
import DeadlineFilter from './DeadlineFilter.vue'

// Friday 20 November 2026, 01:30 in Kyiv, still the 19th in UTC: "today" must be the Kyiv day.
const KYIV_NIGHT: Clock = { now: () => new Date('2026-11-19T23:30:00Z'), timeZone: 'Europe/Kyiv' }

let mounted: VueWrapper | undefined

async function mountFilter(locale: Locale = 'en') {
  mounted = mount(DeadlineFilter, {
    global: { plugins: appPlugins(locale), provide: { [CLOCK as symbol]: KYIV_NIGHT } },
    attachTo: document.body,
  })
  await settle()
  return mounted
}

async function settle() {
  await flushPromises()
  await vi.advanceTimersByTimeAsync(1)
  await flushPromises()
}

function trigger(filter: VueWrapper) {
  return filter.get<HTMLButtonElement>('[data-testid="deadline-filter"]')
}

function popover(): HTMLElement | null {
  return document.body.querySelector('[data-testid="deadline-filter-popover"]')
}

function get(selector: string): HTMLElement {
  const element = document.body.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`Nothing matches ${selector}`)
  return element
}

async function openFilter(filter: VueWrapper) {
  trigger(filter).element.click()
  await settle()
}

// The pointer passes over a day before it presses it; the calendar draws the range to it on the way.
async function clickDay(day: string) {
  const cell = get(`[data-testid="deadline-filter-popover"] [data-value="${day}"]`)
  cell.dispatchEvent(new MouseEvent('mouseenter'))
  await settle()
  cell.click()
  await settle()
}

async function clickButton(label: string) {
  const button = Array.from(popover()?.querySelectorAll('button') ?? []).find((b) => b.textContent?.trim() === label)
  if (!button) throw new Error(`The popover has no "${label}" button`)
  button.click()
  await settle()
}

async function pressEscape() {
  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await settle()
}

function deadline() {
  const view = useListViewStore()
  return [view.deadlineFrom, view.deadlineTo]
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  const pinia = getActivePinia()
  if (pinia) disposePinia(pinia)
  vi.useRealTimers()
})

describe('the button', () => {
  it('is only an icon named "Deadline" while no deadline filter is set', async () => {
    const filter = await mountFilter()

    expect(trigger(filter).text()).toBe('')
    expect(trigger(filter).attributes('aria-label')).toBe('Deadline')
    expect(trigger(filter).attributes('title')).toBe('Deadline')
  })

  it('is named in Ukrainian when the language is Ukrainian', async () => {
    const filter = await mountFilter('uk')

    expect(trigger(filter).attributes('aria-label')).toBe('Дедлайн')
  })

  it.each([
    ['en', '/?deadline_from=2026-11-20&deadline_to=2026-11-20', 'Nov 20'],
    ['uk', '/?deadline_from=2026-11-20&deadline_to=2026-11-20', '20 лист.'],
    ['uk', '/?deadline_from=2026-11-20&deadline_to=2026-11-24', '20–24 лист.'],
    ['en', '/?deadline_to=2026-11-20', 'Until Nov 20'],
    ['uk', '/?deadline_from=2026-11-20', 'З 20 лист.'],
  ] as const)('shows the filtered days in %s for %s', async (locale, url, expected) => {
    history.replaceState(null, '', url)

    const filter = await mountFilter(locale)

    expect(trigger(filter).text().replace(/\s/gu, ' ')).toBe(expected)
  })

  it('names the filtered days for a screen reader', async () => {
    history.replaceState(null, '', '/?deadline_from=2026-11-20&deadline_to=2026-11-24')

    const filter = await mountFilter()

    expect(trigger(filter).attributes('aria-label')?.replace(/\s/gu, ' ')).toBe('Deadline: Nov 20 – 24')
  })
})

describe('the calendar', () => {
  it('opens on the current month, by the clock zone', async () => {
    const filter = await mountFilter()

    await openFilter(filter)

    expect(get('[data-testid="deadline-filter-month"]').textContent?.trim()).toBe('November 2026')
    expect(get('[data-testid="deadline-filter-popover"] [data-today]').getAttribute('data-value')).toBe('2026-11-20')
  })

  it('speaks Ukrainian and starts the week on Monday', async () => {
    const filter = await mountFilter('uk')

    await openFilter(filter)

    const calendar = get('[data-testid="deadline-filter-popover"]')
    expect(get('[data-testid="deadline-filter-month"]').textContent?.trim().toLowerCase()).toBe('листопад 2026 р.')
    expect(calendar.querySelector('thead th')?.textContent?.trim()).toBe('П')
    expect(calendar.querySelector('button[aria-label="Попередній місяць"]')).not.toBeNull()
    expect(calendar.textContent).toContain('Сьогодні')
  })

  it('starts the week on Sunday in English', async () => {
    const filter = await mountFilter()

    await openFilter(filter)

    expect(get('[data-testid="deadline-filter-popover"] thead th').textContent?.trim()).toBe('S')
  })

  it('opens on the month of the filtered days, with them selected', async () => {
    history.replaceState(null, '', '/?deadline_from=2027-01-04&deadline_to=2027-01-06')
    const filter = await mountFilter()

    await openFilter(filter)

    const selected = Array.from(document.body.querySelectorAll('[data-testid="deadline-filter-popover"] [data-selected]'))
    expect(get('[data-testid="deadline-filter-month"]').textContent?.trim()).toBe('January 2027')
    expect(selected.map((cell) => cell.getAttribute('data-value'))).toEqual(['2027-01-04', '2027-01-05', '2027-01-06'])
  })

  it('opens on the month of a last day filtered alone, with nothing selected', async () => {
    history.replaceState(null, '', '/?deadline_to=2026-12-03')
    const filter = await mountFilter()

    await openFilter(filter)

    expect(get('[data-testid="deadline-filter-month"]').textContent?.trim()).toBe('December 2026')
    expect(document.body.querySelector('[data-testid="deadline-filter-popover"] [data-selected]')).toBeNull()
  })
})

describe('picking days', () => {
  it('filters the range between two days picked, both included, and closes', async () => {
    const filter = await mountFilter()
    await openFilter(filter)

    await clickDay('2026-11-24')
    await clickDay('2026-11-20')

    expect(deadline()).toEqual(['2026-11-20', '2026-11-24'])
    expect(popover()).toBeNull()
  })

  it('filters the one day picked once the calendar is closed', async () => {
    const filter = await mountFilter()
    await openFilter(filter)

    await clickDay('2026-11-23')
    const whileOpen = deadline()
    await pressEscape()

    expect(whileOpen).toEqual(['', ''])
    expect(deadline()).toEqual(['2026-11-23', '2026-11-23'])
    expect(popover()).toBeNull()
  })

  it('leaves the filter as it was when closed without a pick', async () => {
    history.replaceState(null, '', '/?deadline_to=2026-11-20')
    const filter = await mountFilter()
    await openFilter(filter)

    await pressEscape()

    expect(deadline()).toEqual(['', '2026-11-20'])
  })
})

describe('quick picks', () => {
  it('filters today, the day it is in the clock zone', async () => {
    const filter = await mountFilter()
    await openFilter(filter)

    await clickButton('Today')

    expect(deadline()).toEqual(['2026-11-20', '2026-11-20'])
    expect(popover()).toBeNull()
  })

  it.each([
    ['en', 'This week', ['2026-11-15', '2026-11-21']],
    ['uk', 'Цей тиждень', ['2026-11-16', '2026-11-22']],
  ] as const)('filters this week as the %s calendar lays it out', async (locale, label, expected) => {
    const filter = await mountFilter(locale)
    await openFilter(filter)

    await clickButton(label)

    expect(deadline()).toEqual(expected)
  })

  it('filters overdue as everything due before today', async () => {
    history.replaceState(null, '', '/?deadline_from=2026-11-01&deadline_to=2026-11-30')
    const filter = await mountFilter()
    await openFilter(filter)

    await clickButton('Overdue')

    expect(deadline()).toEqual(['', '2026-11-19'])
  })

  it('clears the deadline filter', async () => {
    history.replaceState(null, '', '/?deadline_from=2026-11-20&deadline_to=2026-11-24')
    const filter = await mountFilter()
    await openFilter(filter)

    await clickButton('Clear')

    expect(deadline()).toEqual(['', ''])
    expect(trigger(filter).attributes('aria-label')).toBe('Deadline')
    expect(popover()).toBeNull()
  })
})
