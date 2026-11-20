import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'

import type { TaskPriority } from '../../api/generated/client'
import type { Locale } from '../../stores/settings'
import { appPlugins } from '../../test/appPlugins'
import PriorityMenu from './PriorityMenu.vue'

let mounted: VueWrapper | undefined

async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function mountMenu(
  props: { priority: TaskPriority; busy?: boolean; disabled?: boolean },
  locale: Locale = 'en',
  attrs: Record<string, string> = {},
) {
  mounted = mount(PriorityMenu, {
    props,
    attrs,
    attachTo: document.body,
    global: { plugins: appPlugins(locale) },
  })
  await settle()
  return mounted
}

function trigger(menu: VueWrapper) {
  return menu.get<HTMLButtonElement>('[data-testid="task-priority"]')
}

function menuItems(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitemradio"]'))
}

async function open(menu: VueWrapper) {
  trigger(menu).element.click()
  await settle()
}

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  const pinia = getActivePinia()
  if (pinia) disposePinia(pinia)
})

describe('the priority menu', () => {
  it('is a button that shows the priority badge and says what it does, also as a tooltip', async () => {
    const menu = await mountMenu({ priority: 'high' })

    const button = trigger(menu)
    expect(button.element.tagName).toBe('BUTTON')
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('aria-label')).toBe('Priority: High. Change priority')
    expect(button.attributes('title')).toBe('Priority: High. Change priority')
    expect(button.attributes('aria-busy')).toBeUndefined()
    expect(button.attributes('aria-disabled')).toBeUndefined()
    expect(button.get('[data-tone]').text()).toBe('High')
  })

  it.each([
    ['high', 'warning'],
    ['medium', 'neutral'],
    ['low', 'neutral'],
  ] as const)('colours a %s priority as the badge always did (%s)', async (priority, tone) => {
    const menu = await mountMenu({ priority })

    expect(trigger(menu).get('[data-tone]').attributes('data-tone')).toBe(tone)
  })

  it('has a chevron that only a screen reader would not need', async () => {
    const menu = await mountMenu({ priority: 'low' })

    expect(trigger(menu).get('svg.lucide-chevron-down').attributes('aria-hidden')).toBe('true')
  })

  it('is named in Ukrainian when the language is Ukrainian', async () => {
    const menu = await mountMenu({ priority: 'medium' }, 'uk')

    expect(trigger(menu).attributes('aria-label')).toBe('Пріоритет: Середній. Змінити пріоритет')
  })

  it('offers Low, Medium and High, with the current one checked', async () => {
    const menu = await mountMenu({ priority: 'medium' })

    await open(menu)

    expect(menuItems().map((item) => item.textContent?.trim())).toEqual(['Low', 'Medium', 'High'])
    expect(menuItems().map((item) => item.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
  })

  it('lists the priorities in Ukrainian when the language is Ukrainian', async () => {
    const menu = await mountMenu({ priority: 'medium' }, 'uk')

    await open(menu)

    expect(menuItems().map((item) => item.textContent?.trim())).toEqual(['Низький', 'Середній', 'Високий'])
  })

  it('reports the picked priority', async () => {
    const menu = await mountMenu({ priority: 'medium' })

    await open(menu)
    menuItems()[2].click()
    await settle()

    expect(menu.emitted('select')).toEqual([['high']])
  })

  it('while busy, says so, stays focusable, and offers nothing to pick', async () => {
    const menu = await mountMenu({ priority: 'medium', busy: true })

    const button = trigger(menu)
    expect(button.attributes('aria-busy')).toBe('true')
    expect(button.attributes('aria-disabled')).toBe('true')
    expect(button.attributes('disabled')).toBeUndefined()
    button.element.focus()
    expect(document.activeElement).toBe(button.element)

    await open(menu)
    menuItems()[0].click()
    await settle()

    expect(menuItems()).toHaveLength(3)
    expect(menuItems().every((item) => item.hasAttribute('data-disabled'))).toBe(true)
    expect(menu.emitted('select')).toBeUndefined()
  })

  it('offers nothing to pick while the task is busy with something else', async () => {
    const menu = await mountMenu({ priority: 'medium', disabled: true })

    expect(trigger(menu).attributes('aria-busy')).toBeUndefined()
    await open(menu)

    expect(menuItems()).toHaveLength(3)
    expect(menuItems().every((item) => item.hasAttribute('data-disabled'))).toBe(true)
  })

  it('never starts a drag of what it sits in', async () => {
    const menu = await mountMenu({ priority: 'low' })
    const event = new Event('dragstart', { bubbles: true, cancelable: true })
    let reachedParent = false
    document.body.addEventListener('dragstart', () => (reachedParent = true), { once: true })

    trigger(menu).element.dispatchEvent(event)

    expect(trigger(menu).attributes('draggable')).toBe('true')
    expect(event.defaultPrevented).toBe(true)
    expect(reachedParent).toBe(false)
  })

  it('puts the classes it is given on the button', async () => {
    const menu = await mountMenu({ priority: 'low' }, 'en', { class: 'mt-0.5' })

    expect(trigger(menu).classes()).toContain('mt-0.5')
  })
})
