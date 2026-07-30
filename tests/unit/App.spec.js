/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * End-to-end wiring check: store -> grid -> day panel, with CalDAV mocked out.
 */

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../../src/App.vue'
import { useCalendarStore } from '../../src/store/calendarStore.js'

const { fetchCalendars, fetchEventsInRange, fetchOffDays, initialState } = vi.hoisted(() => ({
	fetchCalendars: vi.fn(),
	fetchEventsInRange: vi.fn(),
	fetchOffDays: vi.fn(),
	initialState: { config: {} },
}))

vi.mock('../../src/utils/api.js', () => ({ fetchOffDays }))

vi.mock('../../src/utils/caldav.js', () => ({
	fetchCalendars,
	fetchEventsInRange,
	getClient: vi.fn(),
}))

vi.mock('@nextcloud/initial-state', () => ({
	loadState: (app, key, fallback) => initialState[key] ?? fallback,
}))

const PERSONAL = {
	id: '/calendars/naser/personal/',
	displayName: 'Personal',
	color: '#ff0000',
	order: 1,
	enabledOnServer: true,
	dav: {},
}

const WORK = {
	id: '/calendars/naser/work/',
	displayName: 'Work',
	color: '#00ff00',
	order: 2,
	enabledOnServer: true,
	dav: {},
}

/**
 * @param {object} calendar owning calendar
 * @param {string} id event id
 * @param {Date} start start
 * @return {object}
 */
function event(calendar, id, start) {
	return {
		id,
		uid: id,
		title: `رویداد ${id}`,
		description: '',
		location: '',
		start,
		end: new Date(start.getTime() + 60 * 60 * 1000),
		allDay: false,
		recurring: false,
		calendarId: calendar.id,
		calendarName: calendar.displayName,
		color: calendar.color,
		url: `${calendar.id}${id}.ics`,
	}
}

/** Every wrapper mounted in a test, so it can be torn down afterwards. */
let mounted = []

/**
 * @param {object} wrapper a mounted App
 * @param {string} label the view button's text
 * @return {Promise<void>}
 */
async function clickView(wrapper, label) {
	const button = wrapper.findAll('.calendar-toolbar__views button')
		.find((candidate) => candidate.text() === label)
	await button.trigger('click')
	await flushPromises()
	await wrapper.vm.$nextTick()
}

/**
 * @return {Promise<object>} a mounted, settled App
 */
async function mountApp() {
	const wrapper = mount(App, { attachTo: document.body })
	mounted.push(wrapper)
	await flushPromises()
	await wrapper.vm.$nextTick()
	return wrapper
}

describe('App', () => {
	afterEach(() => {
		mounted.forEach((wrapper) => wrapper.unmount())
		mounted = []
		// The store is a module singleton; without this it leaks across tests.
		useCalendarStore().reset()
		vi.useRealTimers()
	})

	beforeEach(() => {
		// NcContent teleports into #skip-actions, which the Nextcloud page
		// template provides; jsdom needs it created by hand.
		document.body.innerHTML = '<div id="skip-actions"></div>'
		initialState.config = {}

		vi.useFakeTimers()
		// 8 Mordad 1405
		vi.setSystemTime(new Date(2026, 6, 30, 12, 0, 0))

		window.localStorage.clear()
		// Default to the month view; the choice is remembered per browser.
		window.localStorage.setItem('jalali_calendar:view', 'month')
		fetchOffDays.mockReset().mockResolvedValue([])
		fetchCalendars.mockReset().mockResolvedValue([PERSONAL, WORK])
		fetchEventsInRange.mockReset().mockResolvedValue({
			events: [
				event(PERSONAL, 'p1', new Date(2026, 6, 30, 14)),
				event(WORK, 'w1', new Date(2026, 6, 30, 16)),
			],
			failures: [],
		})
	})

	it('opens on the current Jalali month', async () => {
		const wrapper = await mountApp()
		expect(wrapper.find('.calendar-toolbar__title').text()).toContain('مرداد ۱۴۰۵')
	})

	it('lists the calendars with their colours', async () => {
		const wrapper = await mountApp()
		const bullets = wrapper.findAll('.calendar-item__bullet')

		expect(bullets).toHaveLength(2)
		expect(bullets[0].attributes('style')).toContain('rgb(255, 0, 0)')
	})

	it('requests exactly the Gregorian window the grid covers', async () => {
		await mountApp()

		expect(fetchEventsInRange).toHaveBeenCalledTimes(1)
		const [calendars, rangeStart, rangeEnd] = fetchEventsInRange.mock.calls[0]

		expect(calendars).toHaveLength(2)
		expect(rangeStart.getDay()).toBe(6) // Saturday
		expect((rangeEnd - rangeStart) / (24 * 60 * 60 * 1000)).toBe(42)
	})

	it('draws the fetched events on the grid', async () => {
		const wrapper = await mountApp()
		expect(wrapper.findAll('.event-chip')).toHaveLength(2)
	})

	it('refetches when the month changes', async () => {
		const wrapper = await mountApp()
		fetchEventsInRange.mockClear()

		await wrapper.findAll('.calendar-toolbar__nav button')[1].trigger('click')
		await flushPromises()

		expect(wrapper.find('.calendar-toolbar__title').text()).toContain('شهریور ۱۴۰۵')
		expect(fetchEventsInRange).toHaveBeenCalledTimes(1)
	})

	it('hides a calendar\'s events without refetching', async () => {
		const wrapper = await mountApp()
		fetchEventsInRange.mockClear()

		await wrapper.find('.calendar-item a').trigger('click')
		await wrapper.vm.$nextTick()

		expect(wrapper.findAll('.event-chip')).toHaveLength(1)
		expect(fetchEventsInRange).not.toHaveBeenCalled()
	})

	it('remembers hidden calendars across a reload', async () => {
		const first = await mountApp()
		await first.find('.calendar-item a').trigger('click')
		expect(first.findAll('.event-chip')).toHaveLength(1)

		// Simulate a page reload: everything in memory goes, localStorage stays.
		useCalendarStore().reset()

		const second = await mountApp()
		expect(second.findAll('.event-chip')).toHaveLength(1)
	})

	it('opens the day panel with that day\'s events', async () => {
		const wrapper = await mountApp()

		await wrapper.find('.day-cell--today').trigger('click')
		await wrapper.vm.$nextTick()

		const panel = wrapper.find('.day-panel')
		expect(panel.exists()).toBe(true)
		expect(panel.findAll('.event-details')).toHaveLength(2)
		expect(panel.text()).toContain('۱۴:۰۰')
	})

	it('reports a calendar listing failure and offers a retry', async () => {
		fetchCalendars.mockRejectedValueOnce(new Error('boom'))
		const wrapper = await mountApp()

		expect(wrapper.text()).toContain('boom')

		fetchCalendars.mockResolvedValue([PERSONAL])
		const retry = wrapper.findAll('button').find((button) => button.text().includes('Try again'))
		await retry.trigger('click')
		await flushPromises()

		expect(wrapper.findAll('.calendar-item__bullet')).toHaveLength(1)
	})

	it('still renders the month when one calendar fails', async () => {
		fetchEventsInRange.mockResolvedValue({
			events: [event(PERSONAL, 'p1', new Date(2026, 6, 30, 14))],
			failures: [{ calendar: WORK, reason: new Error('nope') }],
		})

		const wrapper = await mountApp()

		expect(wrapper.findAll('.event-chip')).toHaveLength(1)
		expect(wrapper.text()).toContain('Work')
	})

	it('disables "today" only while today is on screen', async () => {
		const wrapper = await mountApp()
		const todayButton = () => wrapper.findAll('.calendar-toolbar__nav button')[2]

		expect(todayButton().attributes('disabled')).toBeDefined()

		await wrapper.findAll('.calendar-toolbar__nav button')[1].trigger('click')
		await flushPromises()
		expect(todayButton().attributes('disabled')).toBeUndefined()

		await todayButton().trigger('click')
		await flushPromises()
		expect(wrapper.find('.calendar-toolbar__title').text()).toContain('مرداد ۱۴۰۵')
	})

	it('opens on a deep-linked month', async () => {
		initialState.config = { initialMonth: { jy: 1404, jm: 11 } }
		const wrapper = await mountApp()

		expect(wrapper.find('.calendar-toolbar__title').text()).toContain('بهمن ۱۴۰۴')
	})

	it('warns when the device timezone differs from the calendar timezone', async () => {
		initialState.config = { timezone: 'Pacific/Auckland' }
		const wrapper = await mountApp()

		expect(wrapper.text()).toContain('Pacific/Auckland')
		expect(wrapper.text()).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone)
	})

	it('stays quiet when the timezones agree', async () => {
		initialState.config = { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
		const wrapper = await mountApp()

		expect(wrapper.text()).not.toContain('differs from your calendar timezone')
	})

	it('starts the week on Saturday by default', async () => {
		const wrapper = await mountApp()
		const headers = wrapper.findAll('.month-grid__weekday-full').map((h) => h.text())

		expect(headers[0]).toBe('شنبه')
		expect(wrapper.findAll('.day-cell')[0].attributes('aria-label')).toContain('شنبه')
	})

	it('starts the week on Sunday when the admin configured it', async () => {
		initialState.config = { firstDayOfWeek: 'sunday' }
		const wrapper = await mountApp()
		const headers = wrapper.findAll('.month-grid__weekday-full').map((h) => h.text())

		expect(headers[0]).toBe('یکشنبه')
		expect(headers[6]).toBe('شنبه')
		// Friday moves from the last column to the sixth.
		expect(wrapper.findAll('.month-grid__weekday--weekend')).toHaveLength(1)
		expect(headers[wrapper.findAll('.month-grid__weekday').findIndex((h) => h.classes().includes('month-grid__weekday--weekend'))]).toBe('جمعه')
	})

	it('requests off-days for the visible window', async () => {
		await mountApp()

		expect(fetchOffDays).toHaveBeenCalledTimes(1)
		const [from, to] = fetchOffDays.mock.calls[0]
		expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
		expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
		expect(from < to).toBe(true)
	})

	it('renders an official off-day on its day', async () => {
		fetchOffDays.mockResolvedValue([
			{ id: 1, gdate: '2026-07-30', jy: 1405, jm: 5, jd: 8, title: 'عید سعید قربان', isOff: true, source: 'time.ir' },
		])
		const wrapper = await mountApp()

		const today = wrapper.find('.day-cell--today')
		expect(today.classes()).toContain('day-cell--off')
		expect(today.text()).toContain('عید سعید قربان')
		expect(today.attributes('aria-label')).toContain('عید سعید قربان')
	})

	it('does not colour a non-off occasion as a day off', async () => {
		fetchOffDays.mockResolvedValue([
			{ id: 2, gdate: '2026-07-30', jy: 1405, jm: 5, jd: 8, title: 'روز بزرگداشت', isOff: false, source: 'manual' },
		])
		const wrapper = await mountApp()

		const today = wrapper.find('.day-cell--today')
		expect(today.classes()).not.toContain('day-cell--off')
		// The label still shows; only the off-day colouring is withheld.
		expect(today.text()).toContain('روز بزرگداشت')
	})

	it('keeps the month usable when off-days fail to load', async () => {
		fetchOffDays.mockRejectedValue(new Error('boom'))
		const wrapper = await mountApp()

		expect(wrapper.findAll('.day-cell')).toHaveLength(42)
		expect(wrapper.findAll('.event-chip')).toHaveLength(2)
	})

	it('offers all five views', async () => {
		const wrapper = await mountApp()
		const labels = wrapper.findAll('.calendar-toolbar__views button').map((b) => b.text())

		expect(labels).toEqual(['Day', 'Week', 'Month', 'Year', 'List'])
	})

	it('switches to the week view and shows seven columns', async () => {
		const wrapper = await mountApp()
		await clickView(wrapper, 'Week')

		expect(wrapper.find('.time-grid').exists()).toBe(true)
		expect(wrapper.findAll('.time-grid__day-head')).toHaveLength(7)
		expect(wrapper.find('.month-grid').exists()).toBe(false)
	})

	it('switches to the day view and shows one column', async () => {
		const wrapper = await mountApp()
		await clickView(wrapper, 'Day')

		expect(wrapper.findAll('.time-grid__day-head')).toHaveLength(1)
		expect(wrapper.find('.calendar-toolbar__title').text()).toContain('۸ مرداد ۱۴۰۵')
	})

	it('switches to the year view and shows twelve months', async () => {
		const wrapper = await mountApp()
		await clickView(wrapper, 'Year')

		expect(wrapper.findAll('.mini')).toHaveLength(12)
		expect(wrapper.find('.calendar-toolbar__title').text()).toContain('۱۴۰۵')
	})

	it('switches to the list view and shows only days with events', async () => {
		const wrapper = await mountApp()
		await clickView(wrapper, 'List')

		expect(wrapper.find('.list-view').exists()).toBe(true)
		// Both fixture events fall on the same day.
		expect(wrapper.findAll('.list-view__day')).toHaveLength(1)
		expect(wrapper.findAll('.entry')).toHaveLength(2)
	})

	it('places timed events on the hour grid', async () => {
		const wrapper = await mountApp()
		await clickView(wrapper, 'Day')

		const events = wrapper.findAll('.time-grid__event')
		expect(events).toHaveLength(2)
		// 14:00 of 1440 minutes is 58.33% down the column.
		expect(events[0].attributes('style')).toContain('top: 58.3')
	})

	it('shades non-working hours', async () => {
		const wrapper = await mountApp()
		await clickView(wrapper, 'Day')

		// 2026-07-30 is a Thursday, outside the default Sat-Wed working week.
		expect(wrapper.findAll('.time-grid__hour--off-hours')).toHaveLength(24)
	})

	it('honours configured working hours', async () => {
		// Thursday included, 08:00-12:00.
		initialState.config = { workStart: 480, workEnd: 720, workDays: [4] }
		const wrapper = await mountApp()
		await clickView(wrapper, 'Day')

		expect(wrapper.findAll('.time-grid__hour--off-hours')).toHaveLength(20)
	})

	it('fetches exactly once per navigation', async () => {
		const wrapper = await mountApp()
		fetchEventsInRange.mockClear()

		await clickView(wrapper, 'Week')
		await flushPromises()
		expect(fetchEventsInRange).toHaveBeenCalledTimes(1)

		fetchEventsInRange.mockClear()
		await wrapper.findAll('.calendar-toolbar__nav button')[1].trigger('click')
		await flushPromises()
		expect(fetchEventsInRange).toHaveBeenCalledTimes(1)
	})

	it('requests a week-sized window in the week view', async () => {
		const wrapper = await mountApp()
		fetchEventsInRange.mockClear()
		await clickView(wrapper, 'Week')
		await flushPromises()

		const [, start, end] = fetchEventsInRange.mock.calls[0]
		expect(Math.round((end - start) / 86400000)).toBe(7)
	})

	it('drills into a day from the month view', async () => {
		const wrapper = await mountApp()
		await wrapper.find('.day-cell--today').trigger('click')
		await wrapper.vm.$nextTick()
		// Clicking a cell opens the panel; the year view drills in instead.
		expect(wrapper.find('.day-panel').exists()).toBe(true)
	})

	it('remembers the chosen view', async () => {
		const first = await mountApp()
		await clickView(first, 'Week')
		expect(window.localStorage.getItem('jalali_calendar:view')).toBe('week')

		useCalendarStore().reset()
		const second = await mountApp()
		expect(second.findAll('.time-grid__day-head')).toHaveLength(7)
	})

	it('hides tasks when the user turned them off', async () => {
		fetchEventsInRange.mockResolvedValue({
			events: [
				event(PERSONAL, 'p1', new Date(2026, 6, 30, 14)),
				{ ...event(WORK, 'task', new Date(2026, 6, 30, 16)), isTask: true },
			],
			failures: [],
		})

		initialState.config = { preferences: { showTasks: false } }
		const wrapper = await mountApp()
		expect(wrapper.findAll('.event-chip')).toHaveLength(1)
	})

	it('shows tasks by default', async () => {
		fetchEventsInRange.mockResolvedValue({
			events: [
				event(PERSONAL, 'p1', new Date(2026, 6, 30, 14)),
				{ ...event(WORK, 'task', new Date(2026, 6, 30, 16)), isTask: true },
			],
			failures: [],
		})

		const wrapper = await mountApp()
		expect(wrapper.findAll('.event-chip')).toHaveLength(2)
	})

	it('drops the weekend column when asked', async () => {
		initialState.config = { preferences: { showWeekends: false } }
		const wrapper = await mountApp()

		// Six weeks of six days, and no Friday header.
		expect(wrapper.findAll('.day-cell')).toHaveLength(36)
		expect(wrapper.findAll('.month-grid__weekday-full').map((h) => h.text()))
			.not.toContain('جمعه')
		expect(wrapper.findAll('.day-cell--weekend')).toHaveLength(0)
	})

	it('keeps the weekend column by default', async () => {
		const wrapper = await mountApp()
		expect(wrapper.findAll('.day-cell')).toHaveLength(42)
		expect(wrapper.findAll('.day-cell--weekend')).toHaveLength(6)
	})

	it('shows a week number per row when asked', async () => {
		initialState.config = { preferences: { showWeekNumbers: true } }
		const wrapper = await mountApp()

		const numbers = wrapper.findAll('.month-grid__weeknum')
		expect(numbers).toHaveLength(6)
		// Consecutive rows are consecutive weeks.
		expect(numbers[0].text()).not.toBe(numbers[1].text())
	})

	it('shows no week numbers by default', async () => {
		const wrapper = await mountApp()
		expect(wrapper.findAll('.month-grid__weeknum')).toHaveLength(0)
	})

	it('lifts the month event cap when asked', async () => {
		fetchEventsInRange.mockResolvedValue({
			events: Array.from({ length: 6 }, (unused, i) =>
				event(PERSONAL, `e${i}`, new Date(2026, 6, 30, 9 + i))),
			failures: [],
		})

		initialState.config = { preferences: { limitMonthEvents: false } }
		const wrapper = await mountApp()

		expect(wrapper.findAll('.event-chip')).toHaveLength(6)
		expect(wrapper.find('.day-cell__more').exists()).toBe(false)
	})

	it('caps events in the month view by default', async () => {
		fetchEventsInRange.mockResolvedValue({
			events: Array.from({ length: 6 }, (unused, i) =>
				event(PERSONAL, `e${i}`, new Date(2026, 6, 30, 9 + i))),
			failures: [],
		})

		const wrapper = await mountApp()
		expect(wrapper.findAll('.event-chip')).toHaveLength(3)
		expect(wrapper.find('.day-cell__more').exists()).toBe(true)
	})

	it('rules the day grid at the chosen increment', async () => {
		initialState.config = { preferences: { slotDuration: 15 } }
		const wrapper = await mountApp()
		await clickView(wrapper, 'Day')

		// Three sub-hour lines per hour at 15-minute increments.
		expect(wrapper.findAll('.time-grid__slot')).toHaveLength(24 * 3)
	})

	it('moves the today marker when the clock passes midnight', async () => {
		const wrapper = await mountApp()
		expect(wrapper.find('.day-cell--today .day-cell__number').text()).toBe('۸')

		vi.setSystemTime(new Date(2026, 6, 31, 0, 1, 0))
		await vi.advanceTimersByTimeAsync(61 * 1000)
		await flushPromises()

		expect(wrapper.find('.day-cell--today .day-cell__number').text()).toBe('۹')
	})
})
