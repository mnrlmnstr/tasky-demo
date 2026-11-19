import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import Badge from './Badge.vue'

describe('Badge', () => {
  it('renders its slot content', () => {
    const badge = mount(Badge, { slots: { default: 'In progress' } })

    expect(badge.text()).toBe('In progress')
  })

  it('is neutral when no tone is given', () => {
    const badge = mount(Badge, { slots: { default: 'In progress' } })

    expect(badge.attributes('data-tone')).toBe('neutral')
  })

  it.each(['neutral', 'accent', 'success', 'warning', 'danger'] as const)(
    'exposes the %s tone it was given',
    (tone) => {
      const badge = mount(Badge, { props: { tone }, slots: { default: 'In progress' } })

      expect(badge.attributes('data-tone')).toBe(tone)
    },
  )

  it('is not interactive', () => {
    const badge = mount(Badge, { slots: { default: 'In progress' } })

    expect(badge.element.tagName).toBe('SPAN')
    expect(badge.attributes('tabindex')).toBeUndefined()
  })
})
