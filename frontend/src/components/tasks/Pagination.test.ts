import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Locale } from '../../stores/settings'
import { appPlugins } from '../../test/appPlugins'
import Pagination from './Pagination.vue'

function mountPagination(page: number, pages: number, locale: Locale = 'en') {
  return mount(Pagination, { props: { page, pages }, global: { plugins: appPlugins(locale) } })
}

describe('Pagination', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('says which page of how many is shown', () => {
    const pagination = mountPagination(2, 5)

    expect(pagination.get('[data-testid="page-position"]').text()).toBe('Page 2 of 5')
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

  it('disables "Previous" on the first page and leaves "Next" enabled', () => {
    const pagination = mountPagination(1, 5)

    expect(pagination.get('button[aria-label="Previous"]').attributes('disabled')).toBeDefined()
    expect(pagination.get('button[aria-label="Next"]').attributes('disabled')).toBeUndefined()
  })

  it('disables "Next" on the last page and leaves "Previous" enabled', () => {
    const pagination = mountPagination(5, 5)

    expect(pagination.get('button[aria-label="Next"]').attributes('disabled')).toBeDefined()
    expect(pagination.get('button[aria-label="Previous"]').attributes('disabled')).toBeUndefined()
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
