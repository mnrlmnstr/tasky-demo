import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import Button from './Button.vue'

describe('Button', () => {
  it('renders its slot content inside a button that does not submit forms by default', () => {
    const button = mount(Button, { slots: { default: 'Save' } })

    expect(button.element.tagName).toBe('BUTTON')
    expect(button.text()).toBe('Save')
    expect(button.attributes('type')).toBe('button')
  })

  it('can be made a submit button', () => {
    const button = mount(Button, { props: { type: 'submit' }, slots: { default: 'Save' } })

    expect(button.attributes('type')).toBe('submit')
  })

  it('emits click when activated', async () => {
    const button = mount(Button, { slots: { default: 'Save' } })

    await button.trigger('click')

    expect(button.emitted('click')).toHaveLength(1)
  })

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)(
    'exposes the %s variant it was given',
    (variant) => {
      const button = mount(Button, { props: { variant }, slots: { default: 'Save' } })

      expect(button.attributes('data-variant')).toBe(variant)
    },
  )

  it('is a secondary button when no variant is given', () => {
    const button = mount(Button, { slots: { default: 'Save' } })

    expect(button.attributes('data-variant')).toBe('secondary')
  })

  it('is neither disabled nor busy by default', () => {
    const button = mount(Button, { slots: { default: 'Save' } })

    expect(button.element.disabled).toBe(false)
    expect(button.attributes('aria-busy')).toBeUndefined()
  })

  it('cannot be activated while disabled', async () => {
    const button = mount(Button, { props: { disabled: true }, slots: { default: 'Save' } })

    button.element.click()

    expect(button.element.disabled).toBe(true)
    expect(button.emitted('click')).toBeUndefined()
  })

  it('announces itself as busy and cannot be activated while loading', async () => {
    const button = mount(Button, { props: { loading: true }, slots: { default: 'Save' } })

    button.element.click()

    expect(button.attributes('aria-busy')).toBe('true')
    expect(button.element.disabled).toBe(true)
    expect(button.emitted('click')).toBeUndefined()
  })

  it('keeps its label and hides the spinner from assistive technology while loading', () => {
    const button = mount(Button, { props: { loading: true }, slots: { default: 'Save' } })

    expect(button.text()).toBe('Save')
    expect(button.get('[data-testid="button-spinner"]').attributes('aria-hidden')).toBe('true')
  })

  it('shows no spinner when it is not loading', () => {
    const button = mount(Button, { slots: { default: 'Save' } })

    expect(button.find('[data-testid="button-spinner"]').exists()).toBe(false)
  })
})
