import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import type { TaskRead } from '../../api/generated/client'
import { CLOCK, type Clock } from '../../i18n/clock'
import type { Locale } from '../../stores/settings'
import { appPlugins } from '../../test/appPlugins'
import TaskRow from './TaskRow.vue'

const MINUTE_MS = 60_000

// Noon UTC on 5 March 2026, shown in Kyiv time (UTC+2 on that day).
const KYIV_NOON: Clock = { now: () => new Date('2026-03-05T12:00:00Z'), timeZone: 'Europe/Kyiv' }

function task(overrides: Partial<TaskRead> = {}): TaskRead {
  return {
    id: 'task-1',
    title: 'Prepare the quarterly report',
    description: null,
    status: 'todo',
    priority: 'medium',
    deadline: null,
    created_at: '2026-03-05T09:00:00Z',
    updated_at: '2026-03-05T09:00:00Z',
    ...overrides,
  }
}

// Rows share one timer while any of them is mounted, so every test takes its rows down again.
const mounted: VueWrapper[] = []

function mountRow(overrides: Partial<TaskRead> = {}, locale: Locale = 'en', clock: Clock | null = KYIV_NOON) {
  const row = mount(TaskRow, {
    props: { task: task(overrides) },
    global: {
      plugins: appPlugins(locale),
      provide: clock === null ? {} : { [CLOCK as symbol]: clock },
    },
  })
  mounted.push(row)
  return row
}

// A clock the test moves by hand, together with the timers that make the rows look at it again.
function movableClock(start: string) {
  let now = new Date(start)
  const clock: Clock = { now: () => now, timeZone: 'Europe/Kyiv' }
  return {
    clock,
    async advance(milliseconds: number) {
      now = new Date(now.getTime() + milliseconds)
      vi.advanceTimersByTime(milliseconds)
      await nextTick()
    },
  }
}

// Intl separates the time from AM/PM with a narrow no-break space.
function plainText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

describe('TaskRow', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    for (const row of mounted.splice(0)) row.unmount()
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('shows the task title', () => {
    const row = mountRow({ title: 'Prepare the quarterly report' })

    expect(row.get('[data-testid="task-title"]').text()).toBe('Prepare the quarterly report')
  })

  it.each([
    ['todo', 'To do', 'lucide-circle'],
    ['in_progress', 'In progress', 'lucide-contrast'],
    ['done', 'Done', 'lucide-circle-check'],
  ] as const)('draws a %s task with its own status icon, named "%s"', (status, name, iconClass) => {
    const row = mountRow({ status })

    const icon = row.get('[role="img"]')
    expect(icon.attributes('aria-label')).toBe(name)
    expect(icon.find(`svg.${iconClass}`).exists()).toBe(true)
  })

  it('names the status icon in Ukrainian when the language is Ukrainian', () => {
    const row = mountRow({ status: 'in_progress' }, 'uk')

    expect(row.get('[role="img"]').attributes('aria-label')).toBe('У роботі')
  })

  it('does not offer the status icon as a control: it only shows the status', () => {
    const row = mountRow()

    expect(row.find('button').exists()).toBe(false)
  })

  it('mutes the title of a done task', () => {
    const row = mountRow({ status: 'done' })

    expect(row.get('[data-testid="task-title"]').classes()).toContain('text-text-muted')
  })

  it.each(['todo', 'in_progress'] as const)('keeps the title of a %s task at full strength', (status) => {
    const row = mountRow({ status })

    expect(row.get('[data-testid="task-title"]').classes()).not.toContain('text-text-muted')
  })

  it.each([
    ['high', 'High', 'warning'],
    ['medium', 'Medium', 'neutral'],
    ['low', 'Low', 'neutral'],
  ] as const)('shows %s priority as a "%s" badge in the %s tone', (priority, label, tone) => {
    const row = mountRow({ priority })

    const badge = row.get('[data-tone]')
    expect(badge.text()).toBe(label)
    expect(badge.attributes('data-tone')).toBe(tone)
  })

  it('shows the deadline as a short date and time', () => {
    const row = mountRow({ deadline: '2026-03-06T16:30:00Z' })

    expect(plainText(row.get('[data-testid="task-deadline"]').text())).toBe('Due Mar 6, 2026, 6:30 PM')
  })

  it('formats the deadline for Ukrainian when the language is Ukrainian', () => {
    const row = mountRow({ deadline: '2026-03-06T16:30:00Z' }, 'uk')

    expect(plainText(row.get('[data-testid="task-deadline"]').text())).toBe('До 6 бер. 2026 р., 18:30')
  })

  it('shows a dash, read out as "No deadline", when the task has no deadline', () => {
    const row = mountRow({ deadline: null })

    const deadline = row.get('[data-testid="task-deadline"]')
    expect(deadline.get('[aria-hidden="true"]').text()).toBe('—')
    expect(deadline.get('.sr-only').text()).toBe('No deadline')
  })

  it('marks a deadline in the past as overdue, in words and in the danger colour', () => {
    const row = mountRow({ deadline: '2026-03-05T11:59:00Z', status: 'in_progress' })

    const deadline = row.get('[data-testid="task-deadline"]')
    expect(plainText(deadline.text())).toBe('Due Mar 5, 2026, 1:59 PM · Overdue')
    expect(deadline.classes()).toContain('text-danger-text')
  })

  it('does not mark a done task as overdue, even with its deadline in the past', () => {
    const row = mountRow({ deadline: '2026-03-05T11:59:00Z', status: 'done' })

    const deadline = row.get('[data-testid="task-deadline"]')
    expect(deadline.text()).not.toContain('Overdue')
    expect(deadline.classes()).not.toContain('text-danger-text')
  })

  it('does not mark a deadline that is right now as overdue', () => {
    const row = mountRow({ deadline: '2026-03-05T12:00:00Z' })

    expect(row.get('[data-testid="task-deadline"]').text()).not.toContain('Overdue')
  })

  // The row shows such a deadline as UTC (see i18n/dates.ts), so it must compare it as UTC too:
  // half an hour ahead of the clock is not overdue, whatever zone the browser is in.
  it('reads a deadline without an offset as UTC when deciding whether it is overdue', () => {
    vi.stubEnv('TZ', 'Europe/Kyiv')

    const row = mountRow({ deadline: '2026-03-05T12:30:00' })

    const deadline = row.get('[data-testid="task-deadline"]')
    expect(plainText(deadline.text())).toBe('Due Mar 5, 2026, 2:30 PM')
    expect(deadline.classes()).not.toContain('text-danger-text')
  })

  // Same cause, other inputs: fractional seconds also come without an offset, and a browser behind UTC
  // errs the other way, hiding a deadline that has passed.
  it('reads a deadline with fractional seconds and no offset as UTC when deciding whether it is overdue', () => {
    vi.stubEnv('TZ', 'Europe/Kyiv')

    const row = mountRow({ deadline: '2026-03-05T12:30:00.000' })

    expect(row.get('[data-testid="task-deadline"]').text()).not.toContain('Overdue')
  })

  it('marks a deadline without an offset that has passed in UTC as overdue in a browser behind UTC', () => {
    vi.stubEnv('TZ', 'America/New_York')

    const row = mountRow({ deadline: '2026-03-05T11:30:00' })

    const deadline = row.get('[data-testid="task-deadline"]')
    expect(plainText(deadline.text())).toBe('Due Mar 5, 2026, 1:30 PM · Overdue')
    expect(deadline.classes()).toContain('text-danger-text')
  })

  it('shows the dash, not a dangling "Due", when the deadline cannot be read', () => {
    const row = mountRow({ deadline: 'not a date' })

    const deadline = row.get('[data-testid="task-deadline"]')
    expect(deadline.get('[aria-hidden="true"]').text()).toBe('—')
    expect(deadline.get('.sr-only').text()).toBe('No deadline')
    expect(deadline.text()).not.toContain('Due')
    expect(deadline.classes()).not.toContain('text-danger-text')
  })

  it('turns overdue while it stays on screen, once the deadline passes', async () => {
    vi.useFakeTimers()
    const time = movableClock('2026-03-05T12:00:00Z')
    const row = mountRow({ deadline: '2026-03-05T12:00:30Z' }, 'en', time.clock)
    expect(row.get('[data-testid="task-deadline"]').text()).not.toContain('Overdue')

    await time.advance(MINUTE_MS)

    const deadline = row.get('[data-testid="task-deadline"]')
    expect(deadline.text()).toContain('Overdue')
    expect(deadline.classes()).toContain('text-danger-text')
  })

  it('ages the created date while it stays on screen', async () => {
    vi.useFakeTimers()
    const time = movableClock('2026-03-05T12:00:00Z')
    const row = mountRow({ created_at: '2026-03-05T09:00:00Z' }, 'en', time.clock)
    expect(row.get('time').text()).toBe('Created 3 hours ago')

    await time.advance(60 * MINUTE_MS)

    expect(row.get('time').text()).toBe('Created 4 hours ago')
  })

  it('runs one timer for all the rows on screen and stops it when the last one is gone', () => {
    vi.useFakeTimers()
    const first = mountRow()
    const second = mountRow()
    expect(vi.getTimerCount()).toBe(1)

    first.unmount()
    expect(vi.getTimerCount()).toBe(1)

    second.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not mark a task without a deadline as overdue', () => {
    const row = mountRow({ deadline: null })

    expect(row.get('[data-testid="task-deadline"]').text()).not.toContain('Overdue')
  })

  it('shows when the task was created as time passed, with the exact moment as a tooltip', () => {
    const row = mountRow({ created_at: '2026-03-05T09:00:00Z' })

    const created = row.get('time')
    expect(created.text()).toBe('Created 3 hours ago')
    expect(plainText(created.attributes('title') ?? '')).toBe('Mar 5, 2026, 11:00 AM')
    expect(created.attributes('datetime')).toBe('2026-03-05T09:00:00Z')
  })

  it('gives the exact moment of creation as text too, for those who cannot hover', () => {
    const row = mountRow({ created_at: '2026-03-05T09:00:00Z' })

    const exact = row.get('[data-testid="task-created-at"]')
    expect(plainText(exact.text())).toBe('Mar 5, 2026, 11:00 AM')
    expect(exact.classes()).toContain('sr-only')
    expect(exact.attributes('aria-hidden')).toBeUndefined()
  })

  it('words the created date in Ukrainian when the language is Ukrainian', () => {
    const row = mountRow({ created_at: '2026-03-05T09:00:00Z' }, 'uk')

    expect(row.get('time').text()).toBe('Створено 3 години тому')
  })

  it('reads the time from the system clock when no clock is provided', () => {
    const row = mountRow({ deadline: '2001-01-01T00:00:00Z', created_at: '2001-01-01T00:00:00Z' }, 'en', null)

    expect(row.get('[data-testid="task-deadline"]').text()).toContain('Overdue')
    expect(row.get('time').text()).toMatch(/^Created \d+ years ago$/)
  })
})
