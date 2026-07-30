/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Module-scoped reactive state shared by the navigation and the month grid.
 */

import { computed, ref, shallowRef } from 'vue'

import { fetchCalendars, fetchEventsInRange } from '../utils/caldav.js'

const HIDDEN_STORAGE_KEY = 'jalali_calendar:hidden-calendars'

const calendars = ref([])
const events = shallowRef([])
const hiddenCalendarIds = ref(new Set())

const loadingCalendars = ref(true)
const loadingEvents = ref(false)
const calendarError = ref(null)
const failedCalendars = ref([])

/**
 * Month navigation can outrun the network; only the newest request may write
 * to the shared event list.
 */
let latestEventRequest = 0

/**
 * @return {string[]}
 */
function readHiddenFromStorage() {
	try {
		const raw = window.localStorage.getItem(HIDDEN_STORAGE_KEY)
		const parsed = raw ? JSON.parse(raw) : []
		return Array.isArray(parsed) ? parsed : []
	} catch (error) {
		return []
	}
}

/**
 * Persisting visibility is a convenience; storage being unavailable (private
 * mode, quota) must never break the calendar.
 */
function writeHiddenToStorage() {
	try {
		window.localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify([...hiddenCalendarIds.value]))
	} catch (error) {
		console.warn('[jalali_calendar] could not persist calendar visibility', error)
	}
}

const visibleCalendars = computed(
	() => calendars.value.filter((calendar) => !hiddenCalendarIds.value.has(calendar.id)),
)

const visibleEvents = computed(
	() => events.value.filter((event) => !hiddenCalendarIds.value.has(event.calendarId)),
)

/**
 * Load the calendar list. Calendars the user switched off in the official
 * Calendar app start hidden, so both apps show the same thing on first run.
 *
 * @return {Promise<void>}
 */
async function loadCalendars() {
	loadingCalendars.value = true
	calendarError.value = null

	try {
		const loaded = await fetchCalendars()
		const stored = new Set(readHiddenFromStorage())

		hiddenCalendarIds.value = new Set(
			loaded
				.filter((calendar) => stored.has(calendar.id) || !calendar.enabledOnServer)
				.map((calendar) => calendar.id),
		)

		calendars.value = loaded
	} catch (error) {
		console.error('[jalali_calendar] could not list calendars', error)
		calendarError.value = error
		calendars.value = []
	} finally {
		loadingCalendars.value = false
	}
}

/**
 * Load every event in a Gregorian window.
 *
 * All calendars are fetched, not just the visible ones, so toggling a calendar
 * back on is instant and does not re-hit the server.
 *
 * @param {Date} rangeStart window start, inclusive
 * @param {Date} rangeEnd window end, exclusive
 * @return {Promise<void>}
 */
async function loadEvents(rangeStart, rangeEnd) {
	if (calendars.value.length === 0) {
		events.value = []
		return
	}

	const request = ++latestEventRequest
	loadingEvents.value = true

	try {
		const result = await fetchEventsInRange(calendars.value, rangeStart, rangeEnd)
		if (request !== latestEventRequest) {
			return
		}
		events.value = result.events
		failedCalendars.value = result.failures
	} catch (error) {
		if (request !== latestEventRequest) {
			return
		}
		console.error('[jalali_calendar] could not load events', error)
		events.value = []
		calendarError.value = error
	} finally {
		if (request === latestEventRequest) {
			loadingEvents.value = false
		}
	}
}

/**
 * @param {string} calendarId the calendar to show or hide
 */
function toggleCalendar(calendarId) {
	const next = new Set(hiddenCalendarIds.value)
	if (next.has(calendarId)) {
		next.delete(calendarId)
	} else {
		next.add(calendarId)
	}
	hiddenCalendarIds.value = next
	writeHiddenToStorage()
}

/**
 * Drop all loaded state and in-flight requests. The app is a singleton in the
 * browser, so this matters mainly for teardown between tests.
 */
function reset() {
	latestEventRequest++
	calendars.value = []
	events.value = []
	hiddenCalendarIds.value = new Set()
	loadingCalendars.value = true
	loadingEvents.value = false
	calendarError.value = null
	failedCalendars.value = []
}

/**
 * @return {object} the shared calendar store
 */
export function useCalendarStore() {
	return {
		reset,
		calendars,
		events,
		hiddenCalendarIds,
		loadingCalendars,
		loadingEvents,
		calendarError,
		failedCalendars,
		visibleCalendars,
		visibleEvents,
		loadCalendars,
		loadEvents,
		toggleCalendar,
	}
}
