/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import MonthGrid from '../../src/components/MonthGrid.vue'
import { groupEventsByDay } from '../../src/utils/events.js'
import { buildMonthGrid } from '../../src/utils/jalali.js'

const TODAY = new Date(2026, 6, 30) // 8 Mordad 1405

/**
 * @param {object[]} events events to place on the grid
 * @return {object} a mounted MonthGrid
 */
function mountGrid(events = [], props = {}) {
	const grid = buildMonthGrid(1405, 5, TODAY)
	return mount(MonthGrid, {
		props: {
			grid,
			eventsByDay: groupEventsByDay(events, grid.days),
			...props,
		},
	})
}

/**
 * @param {string} id event id
 * @param {number} hour start hour
 * @param {string} title event title
 * @return {object}
 */
function timedEvent(id, hour, title) {
	return {
		id,
		title,
		start: new Date(2026, 6, 30, hour),
		end: new Date(2026, 6, 30, hour + 1),
		allDay: false,
		color: '#ff0000',
		calendarId: 'personal',
		calendarName: 'Personal',
	}
}

/**
 * A Deck-style task: due at a moment, start === end.
 *
 * @param {string} id task id
 * @param {boolean} completed whether it is done
 * @param {boolean} allDay whether the due date is date-only
 * @return {object}
 */
function task(id, completed = false, allDay = false) {
	const due = allDay ? new Date(2026, 6, 30) : new Date(2026, 6, 30, 12)
	return {
		id,
		title: 'کارت دک',
		start: due,
		end: due,
		allDay,
		isTask: true,
		completed,
		color: '#0082c9',
		calendarId: 'deck',
		calendarName: 'Deck: Roadmap',
	}
}

describe('MonthGrid', () => {
	it('renders six weeks of cells and seven weekday headers', () => {
		const wrapper = mountGrid()

		expect(wrapper.findAll('.day-cell')).toHaveLength(42)
		expect(wrapper.findAll('.month-grid__weekday')).toHaveLength(7)
	})

	it('starts the week on Saturday', () => {
		const wrapper = mountGrid()
		expect(wrapper.findAll('.month-grid__weekday-full')[0].text()).toBe('شنبه')
	})

	// Regression: the track list used to keep a 0px week-number column even
	// with the numbers hidden. Nothing renders into it, so grid auto-placement
	// fed it the first weekday header and one day per row, which then vanished
	// into a zero-width column — Saturday disappeared from the month view.
	// jsdom performs no grid layout, so assert on the declared tracks.
	it('declares one track per column when week numbers are hidden', () => {
		const columns = mountGrid().vm.gridStyle['--grid-columns']

		expect(columns).toBe('repeat(7, minmax(0, 1fr))')
		expect(mountGrid().findAll('.month-grid__weeknum')).toHaveLength(0)
	})

	it('adds a leading track only when week numbers are shown', () => {
		const wrapper = mountGrid([], { showWeekNumbers: true })

		expect(wrapper.vm.gridStyle['--grid-columns'])
			.toBe('34px repeat(7, minmax(0, 1fr))')
		expect(wrapper.findAll('.month-grid__weeknum')).toHaveLength(6)
	})

	it('labels the columns with full weekday names', () => {
		const names = mountGrid().findAll('.month-grid__weekday-full').map((h) => h.text())

		expect(names).toEqual(['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'])
	})

	it('also carries a single-letter form for narrow screens', () => {
		const short = mountGrid().findAll('.month-grid__weekday-short')

		expect(short.map((h) => h.text())).toEqual(['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'])
		// Decorative: the full name is what gets announced.
		expect(short[0].attributes('aria-hidden')).toBe('true')
	})

	it('lays the grid out right-to-left', () => {
		expect(mountGrid().find('.month-grid').attributes('dir')).toBe('rtl')
	})

	it('numbers days with Persian digits', () => {
		const numbers = mountGrid().findAll('.day-cell__number').map((cell) => cell.text())

		expect(numbers).toContain('۱')
		expect(numbers).toContain('۳۱')
		expect(numbers.join('')).not.toMatch(/[0-9]/)
	})

	it('marks exactly one cell as today', () => {
		const wrapper = mountGrid()
		const todays = wrapper.findAll('.day-cell--today')

		expect(todays).toHaveLength(1)
		expect(todays[0].find('.day-cell__number').text()).toBe('۸')
	})

	it('greys out days from the neighbouring months', () => {
		const wrapper = mountGrid()
		const outside = wrapper.findAll('.day-cell--outside')

		// 42 cells minus the 31 days of Mordad.
		expect(outside).toHaveLength(42 - 31)
	})

	it('renders an event chip on the right day', () => {
		const wrapper = mountGrid([timedEvent('a', 14, 'جلسه تیم')])
		const chips = wrapper.findAll('.event-chip')

		expect(chips).toHaveLength(1)
		expect(chips[0].text()).toContain('جلسه تیم')
		expect(chips[0].text()).toContain('۱۴:۰۰')
	})

	it('collapses a busy day into a "more" button', () => {
		const wrapper = mountGrid([
			timedEvent('a', 9, 'یک'),
			timedEvent('b', 10, 'دو'),
			timedEvent('c', 11, 'سه'),
			timedEvent('d', 12, 'چهار'),
			timedEvent('e', 13, 'پنج'),
		])

		expect(wrapper.findAll('.event-chip')).toHaveLength(3)
		expect(wrapper.find('.day-cell__more').text()).toContain('۲')
	})

	it('emits the day when a cell is clicked', async () => {
		const wrapper = mountGrid()
		await wrapper.findAll('.day-cell')[0].trigger('click')

		expect(wrapper.emitted('select-day')).toHaveLength(1)
		expect(wrapper.emitted('select-day')[0][0].key).toBe(wrapper.props('grid').days[0].key)
	})

	it('emits the event when a chip is clicked, without also selecting the day twice', async () => {
		const wrapper = mountGrid([timedEvent('a', 14, 'جلسه')])
		await wrapper.find('.event-chip').trigger('click')

		expect(wrapper.emitted('select-event')).toHaveLength(1)
		expect(wrapper.emitted('select-event')[0][1].id).toBe('a')
		// The chip stops propagation, so the cell must not fire as well.
		expect(wrapper.emitted('select-day')).toBeUndefined()
	})

	it('renders a Deck task as a task chip, not an all-day bar', () => {
		const chip = mountGrid([task('deck-1', false, true)]).find('.event-chip')

		expect(chip.classes()).toContain('event-chip--task')
		// An all-day bar would swallow the task icon and read as "all day long".
		expect(chip.classes()).not.toContain('event-chip--bar')
	})

	it('marks a completed task', () => {
		const chip = mountGrid([task('deck-2', true)]).find('.event-chip')
		expect(chip.classes()).toContain('event-chip--completed')
	})

	it('shows no clock time for an all-day task', () => {
		const chip = mountGrid([task('deck-3', false, true)]).find('.event-chip')
		expect(chip.text()).not.toContain('۰۰:۰۰')
	})

	it('shows the due time for a timed task', () => {
		const chip = mountGrid([task('deck-4', false, false)]).find('.event-chip')
		expect(chip.text()).toContain('۱۲:۰۰')
	})

	it('is keyboard reachable and announces each day', () => {
		const cell = mountGrid([timedEvent('a', 14, 'جلسه')]).findAll('.day-cell')[0]

		expect(cell.attributes('tabindex')).toBe('0')
		expect(cell.attributes('role')).toBe('gridcell')
		expect(cell.attributes('aria-label')).toBeTruthy()
	})
})
