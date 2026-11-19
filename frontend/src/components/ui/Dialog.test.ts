import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import Dialog from './Dialog.vue'

let mounted: VueWrapper | undefined
let opener: HTMLButtonElement | undefined

/** Lets reka-ui finish its deferred work: focus moves and the outside-press listener are set up on a timer. */
async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function mountDialog(
  props: Record<string, unknown> = {},
  slots: Record<string, string> = { default: 'Body text' },
) {
  const dialog = mount(Dialog, {
    props: {
      open: true,
      title: 'Edit task',
      closeLabel: 'Close',
      'onUpdate:open': (open: boolean) => dialog.setProps({ open }),
      ...props,
    },
    slots,
    attachTo: document.body,
  })
  mounted = dialog
  await settle()
  return dialog
}

function findDialog(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[role="dialog"]')
}

function getDialog(): HTMLElement {
  const dialog = findDialog()
  if (!dialog) throw new Error('The dialog is not open')
  return dialog
}

function getCloseButton(): HTMLButtonElement {
  const button = getDialog().querySelector<HTMLButtonElement>('button[aria-label="Close"]')
  if (!button) throw new Error('The dialog has no close button')
  return button
}

function getOverlay(): HTMLElement {
  const overlay = document.body.querySelector<HTMLElement>('[data-testid="dialog-overlay"]')
  if (!overlay) throw new Error('The dialog has no overlay')
  return overlay
}

function pressEscape() {
  const target = document.activeElement ?? document.body
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

function addOpener(): HTMLButtonElement {
  opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
  return opener
}

describe('Dialog', () => {
  afterEach(() => {
    mounted?.unmount()
    mounted = undefined
    opener?.remove()
    opener = undefined
  })

  it('shows nothing while closed', async () => {
    await mountDialog({ open: false })

    expect(findDialog()).toBeNull()
  })

  it('opens as a dialog named by its title', async () => {
    await mountDialog()

    const dialog = getDialog()
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy as string)?.textContent).toBe('Edit task')
  })

  it('shows the body it was given', async () => {
    await mountDialog()

    expect(getDialog().textContent).toContain('Body text')
  })

  it('is described by its description when one is given', async () => {
    await mountDialog({ description: 'Change the details below.' })

    const describedBy = getDialog().getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)?.textContent).toBe(
      'Change the details below.',
    )
  })

  it('has no description when none is given', async () => {
    await mountDialog()

    expect(getDialog().hasAttribute('aria-describedby')).toBe(false)
  })

  it('shows the footer it was given', async () => {
    await mountDialog({}, { default: 'Body text', footer: '<button>Save</button>' })

    const footer = getDialog().querySelector('[data-testid="dialog-footer"]')
    expect(footer?.textContent).toBe('Save')
  })

  it('has no footer when none is given', async () => {
    await mountDialog()

    expect(getDialog().querySelector('[data-testid="dialog-footer"]')).toBeNull()
  })

  it('closes when the close button is pressed', async () => {
    const dialog = await mountDialog()

    getCloseButton().click()
    await settle()

    expect(dialog.emitted('update:open')).toEqual([[false]])
    expect(findDialog()).toBeNull()
  })

  it('closes when Escape is pressed', async () => {
    const dialog = await mountDialog()

    pressEscape()
    await settle()

    expect(dialog.emitted('update:open')).toEqual([[false]])
    expect(findDialog()).toBeNull()
  })

  it('closes when the overlay is pressed', async () => {
    const dialog = await mountDialog()

    getOverlay().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await settle()

    expect(dialog.emitted('update:open')).toEqual([[false]])
    expect(findDialog()).toBeNull()
  })

  it('stays open when it is pressed inside', async () => {
    const dialog = await mountDialog()

    getDialog().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await settle()

    expect(dialog.emitted('update:open')).toBeUndefined()
    expect(findDialog()).not.toBeNull()
  })

  it('opens when it is told to', async () => {
    const dialog = await mountDialog({ open: false })

    await dialog.setProps({ open: true })
    await settle()

    expect(findDialog()).not.toBeNull()
  })

  it('moves focus inside when it opens', async () => {
    addOpener()
    const dialog = await mountDialog({ open: false })

    await dialog.setProps({ open: true })
    await settle()

    expect(getDialog().contains(document.activeElement)).toBe(true)
  })

  it('returns focus to where it was when it closes', async () => {
    const button = addOpener()
    const dialog = await mountDialog({ open: false })
    await dialog.setProps({ open: true })
    await settle()

    pressEscape()
    await settle()

    expect(document.activeElement).toBe(button)
  })
})
