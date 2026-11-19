import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import IconButton from './IconButton.vue'

const ICON = '<svg data-testid="icon" />'

describe('IconButton', () => {
  it('renders the icon it is given inside a non-submitting button', () => {
    const button = mount(IconButton, { props: { label: 'Settings' }, slots: { default: ICON } })

    expect(button.element.tagName).toBe('BUTTON')
    expect(button.attributes('type')).toBe('button')
    expect(button.find('[data-testid="icon"]').exists()).toBe(true)
  })

  it('names itself with the label for assistive technology and as a tooltip', () => {
    const button = mount(IconButton, { props: { label: 'Settings' }, slots: { default: ICON } })

    expect(button.attributes('aria-label')).toBe('Settings')
    expect(button.attributes('title')).toBe('Settings')
  })

  it('emits click when activated', async () => {
    const button = mount(IconButton, { props: { label: 'Settings' }, slots: { default: ICON } })

    await button.trigger('click')

    expect(button.emitted('click')).toHaveLength(1)
  })

  it('is enabled by default', () => {
    const button = mount(IconButton, { props: { label: 'Settings' }, slots: { default: ICON } })

    expect(button.element.disabled).toBe(false)
  })

  it('cannot be activated while disabled', () => {
    const button = mount(IconButton, {
      props: { label: 'Settings', disabled: true },
      slots: { default: ICON },
    })

    button.element.click()

    expect(button.element.disabled).toBe(true)
    expect(button.emitted('click')).toBeUndefined()
  })
})
