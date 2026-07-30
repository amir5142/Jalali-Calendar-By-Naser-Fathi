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

const { fetchCalendars, fetchEventsInRange, initialState } = vi.hoisted(() => ({
	fetchCalendars: vi.fn(),
	fetchEventsInRange: vi.fn(),
	initialState: { config: {} },
}))

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

	it('moves the today marker when the clock passes midnight', async () => {
		const wrapper = await mountApp()
		expect(wrapper.find('.day-cell--today .day-cell__number').text()).toBe('۸')

		vi.setSystemTime(new Date(2026, 6, 31, 0, 1, 0))
		await vi.advanceTimersByTimeAsync(61 * 1000)
		await flushPromises()

		expect(wrapper.find('.day-cell--today .day-cell__number').text()).toBe('۹')
	})
})
