import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Locale } from '../../stores/settings'
import { appPlugins } from '../../test/appPlugins'
import Pagination from './Pagination.vue'

let mounted: VueWrapper | undefined

function mountPagination(page: number, pages: number, locale: Locale = 'en') {
  mounted = mount(Pagination, {
    props: { page, pages },
    attachTo: document.body,
    global: { plugins: appPlugins(locale) },
  })
  return mounted
}

// Intl groups thousands with a no-break space in Ukrainian.
function plainText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

describe('Pagination', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = undefined
  })

  it('says which page of how many is shown', () => {
    const pagination = mountPagination(2, 5)

    expect(pagination.get('[data-testid="page-position"]').text()).toBe('Page 2 of 5')
  })

  it.each([
    ['en', 'Page 1,234 of 5,678'],
    ['uk', 'Сторінка 1 234 з 5 678'],
  ] as const)('writes large page numbers the way %s does', (locale, expected) => {
    const pagination = mountPagination(1234, 5678, locale)

    expect(plainText(pagination.get('[data-testid="page-position"]').text())).toBe(expected)
  })

  it('is a navigation landmark named for assistive technology', () => {
    const pagination = mountPagination(2, 5)

    expect(pagination.get('nav').attributes('aria-label')).toBe('Pages')
  })

  it('speaks Ukrainian when the language is Ukrainian', () => {
    const pagination = mountPagination(2, 5, 'uk')

    expect(pagination.get('[data-testid="page-position"]').text()).toBe('Сторінка 2 з 5')
    expect(pagination.get('nav').attributes('aria-label')).toBe('Сторінки')
    expect(pagination.find('button[aria-label="Назад"]').exists()).toBe(true)
    expect(pagination.find('button[aria-label="Далі"]').exists()).toBe(true)
  })

  it('asks for the next page when "Next" is pressed', async () => {
    const pagination = mountPagination(2, 5)

    await pagination.get('button[aria-label="Next"]').trigger('click')

    expect(pagination.emitted('update:page')).toEqual([[3]])
  })

  it('asks for the previous page when "Previous" is pressed', async () => {
    const pagination = mountPagination(2, 5)

    await pagination.get('button[aria-label="Previous"]').trigger('click')

    expect(pagination.emitted('update:page')).toEqual([[1]])
  })

  it('marks "Previous" as unavailable on the first page and leaves "Next" available', () => {
    const pagination = mountPagination(1, 5)

    expect(pagination.get('button[aria-label="Previous"]').attributes('aria-disabled')).toBe('true')
    expect(pagination.get('button[aria-label="Next"]').attributes('aria-disabled')).toBeUndefined()
  })

  it('marks "Next" as unavailable on the last page and leaves "Previous" available', () => {
    const pagination = mountPagination(5, 5)

    expect(pagination.get('button[aria-label="Next"]').attributes('aria-disabled')).toBe('true')
    expect(pagination.get('button[aria-label="Previous"]').attributes('aria-disabled')).toBeUndefined()
  })

  it('asks for nothing when "Previous" is pressed on the first page', async () => {
    const pagination = mountPagination(1, 5)

    await pagination.get('button[aria-label="Previous"]').trigger('click')

    expect(pagination.emitted('update:page')).toBeUndefined()
  })

  it('asks for nothing when "Next" is pressed on the last page', async () => {
    const pagination = mountPagination(5, 5)

    await pagination.get('button[aria-label="Next"]').trigger('click')

    expect(pagination.emitted('update:page')).toBeUndefined()
  })

  // A natively disabled button drops keyboard focus to the page; this one stays focusable.
  it.each([
    ['Next', 1, 2],
    ['Previous', 2, 1],
  ] as const)('keeps keyboard focus on "%s" when pressing it reaches the end', async (name, from, to) => {
    const pagination = mountPagination(from, 2)
    const button = pagination.get(`button[aria-label="${name}"]`)
    ;(button.element as HTMLButtonElement).focus()

    await button.trigger('click')
    await pagination.setProps({ page: to })

    expect(button.attributes('aria-disabled')).toBe('true')
    expect(button.attributes('disabled')).toBeUndefined()
    expect(document.activeElement).toBe(button.element)
  })

  it.each([
    ['there is one page', 1],
    ['there are no pages', 0],
  ])('shows nothing when %s', (_name, pages) => {
    const pagination = mountPagination(1, pages)

    expect(pagination.find('nav').exists()).toBe(false)
    expect(pagination.find('button').exists()).toBe(false)
  })
})
