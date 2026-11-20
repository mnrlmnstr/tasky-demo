import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { List } from 'lucide-vue-next'
import { afterEach, describe, expect, it } from 'vitest'

import SegmentedControl from './SegmentedControl.vue'

const OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
]

let mounted: VueWrapper | undefined

function mountControl(props: Record<string, unknown> = {}) {
  mounted = mount(SegmentedControl, {
    props: { modelValue: 'all', options: OPTIONS, label: 'Status', ...props },
    attachTo: document.body,
  })
  return mounted
}

function pressedStates(control: VueWrapper): (string | undefined)[] {
  return control.findAll('button').map((segment) => segment.attributes('aria-pressed'))
}

describe('SegmentedControl', () => {
  afterEach(() => {
    mounted?.unmount()
    mounted = undefined
  })

  it('renders one segment per option, in order, with the labels it was given', () => {
    const control = mountControl()

    expect(control.findAll('button').map((segment) => segment.text())).toEqual([
      'All',
      'Open',
      'Done',
    ])
  })

  it('is a group named by its label', () => {
    const control = mountControl()

    const group = control.get('[role="group"]')
    expect(group.attributes('aria-label')).toBe('Status')
  })

  it('marks only the selected option as pressed', () => {
    const control = mountControl({ modelValue: 'open' })

    expect(pressedStates(control)).toEqual(['false', 'true', 'false'])
  })

  it('marks no option as pressed when the value matches none of them', () => {
    const control = mountControl({ modelValue: 'archived' })

    expect(pressedStates(control)).toEqual(['false', 'false', 'false'])
  })

  it('renders an empty group when there are no options', () => {
    const control = mountControl({ options: [] })

    expect(control.get('[role="group"]').findAll('button')).toHaveLength(0)
  })

  it('emits the value of the option that was chosen', async () => {
    const control = mountControl()

    await control.findAll('button')[2].trigger('click')

    expect(control.emitted('update:modelValue')).toEqual([['done']])
  })

  it('keeps the selection when the selected option is chosen again', async () => {
    const control = mountControl({ modelValue: 'open' })

    await control.findAll('button')[1].trigger('click')

    expect(control.emitted('update:modelValue')).toBeUndefined()
    expect(pressedStates(control)).toEqual(['false', 'true', 'false'])
  })

  it('follows the value it is given', async () => {
    const control = mountControl()

    await control.setProps({ modelValue: 'done' })

    expect(pressedStates(control)).toEqual(['false', 'false', 'true'])
  })

  it('moves focus to the next segment with the right arrow key', async () => {
    const control = mountControl()
    await flushPromises()
    const segments = control.findAll('button')
    segments[0].element.focus()

    await segments[0].trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()

    expect(document.activeElement).toBe(segments[1].element)
  })

  it('moves focus to the previous segment with the left arrow key', async () => {
    const control = mountControl({ modelValue: 'open' })
    await flushPromises()
    const segments = control.findAll('button')
    segments[1].element.focus()

    await segments[1].trigger('keydown', { key: 'ArrowLeft' })
    await flushPromises()

    expect(document.activeElement).toBe(segments[0].element)
  })

  it('hands keyboard focus to the selected segment when the group is tabbed into', async () => {
    const control = mountControl({ modelValue: 'open' })
    await flushPromises()

    control.get<HTMLElement>('[role="group"]').element.focus()
    await flushPromises()

    expect(document.activeElement).toBe(control.findAll('button')[1].element)
  })

  it('cannot be changed while disabled', () => {
    const control = mountControl({ disabled: true })
    const segments = control.findAll('button')

    segments[2].element.click()

    expect(segments.map((segment) => segment.element.disabled)).toEqual([true, true, true])
    expect(control.emitted('update:modelValue')).toBeUndefined()
  })

  it('shows only the icon of an option that has one, named by its label', () => {
    const control = mountControl({ options: [{ value: 'all', label: 'All', icon: List }, OPTIONS[1]] })
    const [iconOnly, withText] = control.findAll('button')

    expect(iconOnly.text()).toBe('')
    expect(iconOnly.attributes('aria-label')).toBe('All')
    expect(iconOnly.attributes('title')).toBe('All')
    expect(iconOnly.find('svg.lucide-list[aria-hidden="true"]').exists()).toBe(true)
    expect(withText.text()).toBe('Open')
    expect(withText.attributes('aria-label')).toBeUndefined()
  })
})
