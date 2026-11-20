import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import Switch from './Switch.vue'

function mountSwitch(checked: boolean) {
  const control = mount(Switch, {
    props: {
      modelValue: checked,
      label: 'Show descriptions',
      'onUpdate:modelValue': (value: boolean) => control.setProps({ modelValue: value }),
    },
  })
  return control
}

describe('Switch', () => {
  it('is a switch named by the text next to it', () => {
    const control = mountSwitch(false)

    const input = control.get('input')
    expect(input.attributes('role')).toBe('switch')
    expect(input.attributes('type')).toBe('checkbox')
    expect(control.get('label').text()).toBe('Show descriptions')
    expect(control.get('label').element.contains(input.element)).toBe(true)
  })

  it('shows whether it is on', () => {
    expect(mountSwitch(true).get('input').element.checked).toBe(true)
    expect(mountSwitch(false).get('input').element.checked).toBe(false)
  })

  it('reports the new state when toggled', async () => {
    const control = mountSwitch(false)

    await control.get('input').setValue(true)
    expect(control.emitted('update:modelValue')).toEqual([[true]])

    await control.get('input').setValue(false)
    expect(control.emitted('update:modelValue')).toEqual([[true], [false]])
  })
})
