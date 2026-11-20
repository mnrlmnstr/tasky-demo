import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CLOCK, type Clock } from '../../i18n/clock'
import { useListViewStore } from '../../stores/listView'
import { appPlugins } from '../../test/appPlugins'
import DeadlineFilter from './DeadlineFilter.vue'

// Friday 20 November 2026, 01:30 in Kyiv.
const KYIV_NIGHT: Clock = { now: () => new Date('2026-11-19T23:30:00Z'), timeZone: 'Europe/Kyiv' }

let mounted: VueWrapper | undefined

async function settle() {
  await flushPromises()
  await vi.advanceTimersByTimeAsync(1)
  await flushPromises()
}

async function mountFilter() {
  mounted = mount(DeadlineFilter, {
    global: { plugins: appPlugins('en'), provide: { [CLOCK as symbol]: KYIV_NIGHT } },
    attachTo: document.body,
  })
  await settle()
  return mounted
}

function get(selector: string): HTMLElement {
  const element = document.body.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`Nothing matches ${selector}`)
  return element
}

async function openFilter(filter: VueWrapper) {
  filter.get<HTMLButtonElement>('[data-testid="deadline-filter"]').element.click()
  await settle()
}

async function clickDay(day: string) {
  const cell = get(`[data-testid="deadline-filter-popover"] [data-value="${day}"]`)
  cell.dispatchEvent(new MouseEvent('mouseenter'))
  await settle()
  cell.click()
  await settle()
}

async function clickButton(label: string) {
  const popover = document.body.querySelector('[data-testid="deadline-filter-popover"]')
  const button = Array.from(popover?.querySelectorAll('button') ?? []).find((b) => b.textContent?.trim() === label)
  if (!button) throw new Error(`The popover has no "${label}" button`)
  button.click()
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

describe('deadline filter after a first day was clicked (adversary)', () => {
  // #35: "quick picks: Today, This week, Overdue; a clear button".
  it('clears the filter when "Clear" is pressed after one day was clicked', async () => {
    history.replaceState(null, '', '/?deadline_from=2026-11-20&deadline_to=2026-11-24')
    const filter = await mountFilter()
    await openFilter(filter)

    await clickDay('2026-11-23')
    await clickButton('Clear')

    expect(deadline()).toEqual(['', ''])
  })

  it('filters this week when "This week" is pressed after one day was clicked', async () => {
    const filter = await mountFilter()
    await openFilter(filter)

    await clickDay('2026-11-26')
    await clickButton('This week')

    expect(deadline()).toEqual(['2026-11-15', '2026-11-21'])
  })

  it('filters today when "Today" is pressed after one day was clicked', async () => {
    const filter = await mountFilter()
    await openFilter(filter)

    await clickDay('2026-11-26')
    await clickButton('Today')

    expect(deadline()).toEqual(['2026-11-20', '2026-11-20'])
  })
})

describe('the "Overdue" quick pick (adversary, needs-decision)', () => {
  // #35 "quick picks: ... Overdue"; #13 marks a deadline overdue once it is past. At 01:30 on the 20th a
  // task due at 18:00 that day is not overdue, yet "Overdue" asks the API for everything before the 21st.
  it('asks for nothing due after now', async () => {
    const filter = await mountFilter()
    await openFilter(filter)

    await clickButton('Overdue')

    const to = useListViewStore().queryParams.deadline_to
    expect(new Date(to ?? '').getTime()).toBeLessThanOrEqual(KYIV_NIGHT.now().getTime())
  })
})
