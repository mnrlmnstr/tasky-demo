import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import AlertDialog from './AlertDialog.vue'

let mounted: VueWrapper | undefined
let opener: HTMLButtonElement | undefined

/** Lets reka-ui finish its deferred work: focus moves and the outside-press listener are set up on a timer. */
async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function mountAlert(props: Record<string, unknown> = {}) {
  const alert = mount(AlertDialog, {
    props: {
      open: true,
      title: 'Delete task?',
      description: 'This cannot be undone.',
      cancelLabel: 'Keep',
      confirmLabel: 'Delete',
      'onUpdate:open': (open: boolean) => alert.setProps({ open }),
      ...props,
    },
    attachTo: document.body,
  })
  mounted = alert
  await settle()
  return alert
}

function findAlert(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[role="alertdialog"]')
}

function getAlert(): HTMLElement {
  const alert = findAlert()
  if (!alert) throw new Error('The alert dialog is not open')
  return alert
}

function getButton(label: string): HTMLButtonElement {
  const button = Array.from(getAlert().querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!button) throw new Error(`The alert dialog has no "${label}" button`)
  return button
}

function getOverlay(): HTMLElement {
  const overlay = document.body.querySelector<HTMLElement>('[data-testid="alert-dialog-overlay"]')
  if (!overlay) throw new Error('The alert dialog has no overlay')
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

describe('AlertDialog', () => {
  afterEach(() => {
    mounted?.unmount()
    mounted = undefined
    opener?.remove()
    opener = undefined
  })

  it('shows nothing while closed', async () => {
    await mountAlert({ open: false })

    expect(findAlert()).toBeNull()
  })

  it('opens as an alert dialog named by its title and described by its description', async () => {
    await mountAlert()

    const alert = getAlert()
    const labelledBy = alert.getAttribute('aria-labelledby') as string
    const describedBy = alert.getAttribute('aria-describedby') as string
    expect(document.getElementById(labelledBy)?.textContent).toBe('Delete task?')
    expect(document.getElementById(describedBy)?.textContent).toBe('This cannot be undone.')
  })

  it('offers a cancel and a confirm button with the labels it was given', async () => {
    await mountAlert()

    const labels = Array.from(getAlert().querySelectorAll('button')).map((button) =>
      button.textContent?.trim(),
    )
    expect(labels).toEqual(['Keep', 'Delete'])
  })

  it('marks the confirm button as destructive', async () => {
    await mountAlert()

    expect(getButton('Delete').dataset.variant).toBe('danger')
  })

  it('puts focus on the cancel button when it opens', async () => {
    addOpener()
    const alert = await mountAlert({ open: false })

    await alert.setProps({ open: true })
    await settle()

    expect(document.activeElement).toBe(getButton('Keep'))
  })

  it('emits confirm and closes when the confirm button is pressed', async () => {
    const alert = await mountAlert()

    getButton('Delete').click()
    await settle()

    expect(alert.emitted('confirm')).toHaveLength(1)
    expect(alert.emitted('cancel')).toBeUndefined()
    expect(alert.emitted('update:open')).toEqual([[false]])
    expect(findAlert()).toBeNull()
  })

  it('emits cancel and closes when the cancel button is pressed', async () => {
    const alert = await mountAlert()

    getButton('Keep').click()
    await settle()

    expect(alert.emitted('cancel')).toHaveLength(1)
    expect(alert.emitted('confirm')).toBeUndefined()
    expect(alert.emitted('update:open')).toEqual([[false]])
    expect(findAlert()).toBeNull()
  })

  it('emits cancel and closes when Escape is pressed', async () => {
    const alert = await mountAlert()

    pressEscape()
    await settle()

    expect(alert.emitted('cancel')).toHaveLength(1)
    expect(alert.emitted('confirm')).toBeUndefined()
    expect(alert.emitted('update:open')).toEqual([[false]])
    expect(findAlert()).toBeNull()
  })

  it('stays open when the overlay is pressed', async () => {
    const alert = await mountAlert()

    getOverlay().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await settle()

    expect(alert.emitted('update:open')).toBeUndefined()
    expect(alert.emitted('cancel')).toBeUndefined()
    expect(findAlert()).not.toBeNull()
  })

  it('returns focus to where it was when it closes', async () => {
    const button = addOpener()
    const alert = await mountAlert({ open: false })
    await alert.setProps({ open: true })
    await settle()

    getButton('Keep').click()
    await settle()

    expect(document.activeElement).toBe(button)
  })
})
