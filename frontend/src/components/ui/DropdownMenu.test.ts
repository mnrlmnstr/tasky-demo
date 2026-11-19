import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import DropdownMenu from './DropdownMenu.vue'

const PencilIcon = defineComponent({
  render: () => h('svg', { 'data-testid': 'pencil-icon' }),
})

const ITEMS = [
  { value: 'edit', label: 'Edit', icon: PencilIcon },
  { value: 'archive', label: 'Archive', disabled: true },
  { value: 'delete', label: 'Delete' },
]

let mounted: VueWrapper | undefined

/** Lets reka-ui finish its deferred work: focus moves and positioning are set up on a timer. */
async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function mountMenu(props: Record<string, unknown> = {}) {
  mounted = mount(DropdownMenu, {
    props: { items: ITEMS, ...props },
    slots: { trigger: '<button>Actions</button>' },
    attachTo: document.body,
  })
  await settle()
  return mounted
}

function getTrigger(): HTMLButtonElement {
  const trigger = Array.from(document.body.querySelectorAll('button')).find(
    (button) => button.textContent === 'Actions',
  )
  if (!trigger) throw new Error('The menu has no trigger')
  return trigger
}

function findMenu(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[role="menu"]')
}

function getMenu(): HTMLElement {
  const menu = findMenu()
  if (!menu) throw new Error('The menu is not open')
  return menu
}

function getItems(role = 'menuitem'): HTMLElement[] {
  return Array.from(getMenu().querySelectorAll<HTMLElement>(`[role="${role}"]`))
}

function getItem(label: string): HTMLElement {
  const item = Array.from(getMenu().querySelectorAll<HTMLElement>('[role^="menuitem"]')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!item) throw new Error(`The menu has no "${label}" item`)
  return item
}

async function pressKey(target: Element, key: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  await settle()
}

async function openWithPointer() {
  getTrigger().click()
  await settle()
}

async function openWithKeyboard() {
  const trigger = getTrigger()
  trigger.focus()
  await pressKey(trigger, 'ArrowDown')
}

describe('DropdownMenu', () => {
  afterEach(() => {
    mounted?.unmount()
    mounted = undefined
  })

  it('shows only its trigger while closed', async () => {
    await mountMenu()

    expect(findMenu()).toBeNull()
    expect(getTrigger().getAttribute('aria-haspopup')).toBe('menu')
    expect(getTrigger().getAttribute('aria-expanded')).toBe('false')
  })

  it('opens a menu when the trigger is pressed', async () => {
    await mountMenu()

    await openWithPointer()

    expect(findMenu()).not.toBeNull()
    expect(getTrigger().getAttribute('aria-expanded')).toBe('true')
  })

  it('lists the items it was given, in order', async () => {
    await mountMenu()

    await openWithPointer()

    expect(getItems().map((item) => item.textContent?.trim())).toEqual([
      'Edit',
      'Archive',
      'Delete',
    ])
  })

  it('opens an empty menu when there are no items', async () => {
    await mountMenu({ items: [] })

    await openWithPointer()

    expect(getMenu().querySelectorAll('[role^="menuitem"]')).toHaveLength(0)
  })

  it('shows the icon of an item that has one, hidden from assistive technology', async () => {
    await mountMenu()

    await openWithPointer()

    const icon = getItem('Edit').querySelector('[data-testid="pencil-icon"]')
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
  })

  it('shows no icon for an item without one', async () => {
    await mountMenu()

    await openWithPointer()

    expect(getItem('Delete').querySelector('svg')).toBeNull()
  })

  it('emits the value of the chosen item and closes', async () => {
    const menu = await mountMenu()
    await openWithPointer()

    getItem('Delete').click()
    await settle()

    expect(menu.emitted('select')).toEqual([['delete']])
    expect(findMenu()).toBeNull()
  })

  it('does not let a disabled item be chosen', async () => {
    const menu = await mountMenu()
    await openWithPointer()

    getItem('Archive').click()
    await settle()

    expect(getItem('Archive').getAttribute('aria-disabled')).toBe('true')
    expect(menu.emitted('select')).toBeUndefined()
  })

  it('opens from the keyboard with focus inside the menu', async () => {
    await mountMenu()

    await openWithKeyboard()

    expect(getMenu().contains(document.activeElement)).toBe(true)
  })

  it('moves focus through the items with the arrow keys, skipping disabled ones', async () => {
    await mountMenu()
    await openWithKeyboard()
    await pressKey(document.activeElement as Element, 'Home')
    const first = document.activeElement

    await pressKey(document.activeElement as Element, 'ArrowDown')
    const second = document.activeElement
    await pressKey(document.activeElement as Element, 'ArrowUp')

    expect(first).toBe(getItem('Edit'))
    expect(second).toBe(getItem('Delete'))
    expect(document.activeElement).toBe(getItem('Edit'))
  })

  it('chooses the focused item with Enter', async () => {
    const menu = await mountMenu()
    await openWithKeyboard()
    await pressKey(document.activeElement as Element, 'Home')

    await pressKey(document.activeElement as Element, 'Enter')

    expect(menu.emitted('select')).toEqual([['edit']])
    expect(findMenu()).toBeNull()
  })

  it('closes on Escape without choosing anything and returns focus to the trigger', async () => {
    const menu = await mountMenu()
    await openWithKeyboard()

    await pressKey(document.activeElement as Element, 'Escape')

    expect(findMenu()).toBeNull()
    expect(menu.emitted('select')).toBeUndefined()
    expect(document.activeElement).toBe(getTrigger())
  })

  it('has plain items when no checked value is given', async () => {
    await mountMenu()

    await openWithPointer()

    expect(getMenu().querySelectorAll('[role="menuitemradio"]')).toHaveLength(0)
  })

  it('marks only the checked item when a checked value is given', async () => {
    await mountMenu({ checked: 'delete' })

    await openWithPointer()

    expect(getItems('menuitemradio').map((item) => item.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'true',
    ])
  })

  it('is radio-style with no item marked when the checked value is null', async () => {
    await mountMenu({ checked: null })

    await openWithPointer()

    expect(getItems('menuitemradio').map((item) => item.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'false',
    ])
  })

  it('does not take a null checked value for an item whose value is empty', async () => {
    await mountMenu({ checked: null, items: [{ value: '', label: 'Any' }, ...ITEMS] })

    await openWithPointer()

    expect(getItem('Any').getAttribute('aria-checked')).toBe('false')
  })

  it.each([
    ['a plain menu', {}],
    ['a radio-style menu', { checked: 'delete' }],
  ])('gives the items of %s a keyboard focus ring that is not the hover highlight', async (_name, props) => {
    await mountMenu(props)

    await openWithKeyboard()

    for (const item of [getItem('Edit'), getItem('Delete')]) {
      const classes = item.className.split(/\s+/)
      expect(classes).toContain('data-[highlighted]:bg-surface-muted')
      expect(classes).toContain('focus-visible:inset-ring-2')
      expect(classes).toContain('focus-visible:inset-ring-accent')
    }
  })

  it('emits the value of the item chosen in a radio-style menu and leaves the checked value to its owner', async () => {
    const menu = await mountMenu({ checked: 'delete' })
    await openWithPointer()

    getItem('Edit').click()
    await settle()
    await openWithPointer()

    expect(menu.emitted('select')).toEqual([['edit']])
    expect(getItem('Delete').getAttribute('aria-checked')).toBe('true')
  })

  it('does not let a disabled item be chosen in a radio-style menu', async () => {
    const menu = await mountMenu({ checked: 'delete' })
    await openWithPointer()

    getItem('Archive').click()
    await settle()

    expect(getItem('Archive').getAttribute('aria-disabled')).toBe('true')
    expect(menu.emitted('select')).toBeUndefined()
  })

  it('shows the icons of radio-style items too', async () => {
    await mountMenu({ checked: 'delete' })

    await openWithPointer()

    expect(getItem('Edit').querySelector('[data-testid="pencil-icon"]')).not.toBeNull()
  })
})
