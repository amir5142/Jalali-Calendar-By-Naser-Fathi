/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Turns raw iCalendar payloads from CalDAV into flat, render-ready event
 * objects, expanding recurrences inside the visible window.
 */

import ICAL from 'ical.js'
import { t } from '@nextcloud/l10n'

import { addDays, dayKey, startOfDay } from './jalali.js'

/**
 * Recurrence rules are walked from DTSTART, so an old daily event needs a few
 * thousand steps just to reach the current month. The iteration cap is a
 * runaway guard for malformed rules, not a display limit; the occurrence cap
 * bounds what a single event may contribute to one grid.
 */
const MAX_ITERATIONS = 20000
const MAX_OCCURRENCES_IN_RANGE = 200

/** A single event may not span more days than the grid itself, plus slack. */
const MAX_EVENT_DAYS = 400

/**
 * VTIMEZONE components live in the calendar object that references them, so
 * they have to be registered before any TZID-bearing date can be resolved.
 *
 * @param {ICAL.Component} vcalendar the parsed VCALENDAR
 */
function registerTimezones(vcalendar) {
	for (const vtimezone of vcalendar.getAllSubcomponents('vtimezone')) {
		const tzid = vtimezone.getFirstPropertyValue('tzid')
		if (tzid && !ICAL.TimezoneService.has(tzid)) {
			ICAL.TimezoneService.register(tzid, new ICAL.Timezone(vtimezone))
		}
	}
}

/**
 * @param {ICAL.Event} event the (possibly overridden) occurrence source
 * @param {Date} start occurrence start in local time
 * @param {Date} end occurrence end in local time
 * @param {boolean} allDay whether this is a date-only event
 * @param {object} calendar the calendar the event was loaded from
 * @param {string} objectUrl CalDAV URL of the calendar object
 * @param {string} suffix disambiguator for recurring occurrences
 * @return {object}
 */
function buildEvent(event, start, end, allDay, calendar, objectUrl, suffix) {
	return {
		id: `${objectUrl}#${suffix}`,
		uid: event.uid ?? '',
		title: (event.summary ?? '').trim() || t('jalali_calendar', 'Untitled event'),
		description: event.description ?? '',
		location: event.location ?? '',
		start,
		end,
		allDay,
		recurring: suffix !== 'single',
		calendarId: calendar.id,
		calendarName: calendar.displayName,
		color: calendar.color,
		url: objectUrl,
	}
}

/**
 * Walk a recurring event and emit every occurrence overlapping the window.
 *
 * @param {ICAL.Event} event the recurring master, with exceptions related
 * @param {Date} rangeStart window start, inclusive
 * @param {Date} rangeEnd window end, exclusive
 * @param {object} calendar the calendar the event was loaded from
 * @param {string} objectUrl CalDAV URL of the calendar object
 * @return {object[]}
 */
function expandRecurring(event, rangeStart, rangeEnd, calendar, objectUrl) {
	const occurrences = []
	const iterator = event.iterator()

	let next
	let iterations = 0
	while ((next = iterator.next()) !== null && next !== undefined) {
		if (++iterations > MAX_ITERATIONS) {
			break
		}

		const details = event.getOccurrenceDetails(next)
		const start = details.startDate.toJSDate()
		if (start >= rangeEnd) {
			break
		}

		const end = details.endDate.toJSDate()
		if (end <= rangeStart) {
			continue
		}

		occurrences.push(buildEvent(
			details.item,
			start,
			end,
			details.startDate.isDate,
			calendar,
			objectUrl,
			next.toString(),
		))

		if (occurrences.length >= MAX_OCCURRENCES_IN_RANGE) {
			break
		}
	}

	return occurrences
}

/**
 * Parse one CalDAV calendar object into the events it contributes to the window.
 *
 * @param {string} ics raw iCalendar data
 * @param {object} options options
 * @param {Date} options.rangeStart window start, inclusive
 * @param {Date} options.rangeEnd window end, exclusive
 * @param {object} options.calendar the calendar the object was loaded from
 * @param {string} options.objectUrl CalDAV URL of the calendar object
 * @return {object[]}
 */
export function extractEvents(ics, { rangeStart, rangeEnd, calendar, objectUrl }) {
	const vcalendar = new ICAL.Component(ICAL.parse(ics))
	registerTimezones(vcalendar)

	const vevents = vcalendar.getAllSubcomponents('vevent')
	if (vevents.length === 0) {
		return []
	}

	const masters = []
	const overrides = []
	for (const vevent of vevents) {
		if (vevent.hasProperty('recurrence-id')) {
			overrides.push(vevent)
		} else {
			masters.push(vevent)
		}
	}

	const events = []
	const relatedOverrides = new Set()

	for (const master of masters) {
		const event = new ICAL.Event(master)

		for (const override of overrides) {
			if (override.getFirstPropertyValue('uid') === event.uid) {
				event.relateException(override)
				relatedOverrides.add(override)
			}
		}

		if (event.isRecurring()) {
			events.push(...expandRecurring(event, rangeStart, rangeEnd, calendar, objectUrl))
			continue
		}

		const start = event.startDate.toJSDate()
		const end = event.endDate.toJSDate()
		if (end > rangeStart && start < rangeEnd) {
			events.push(buildEvent(event, start, end, event.startDate.isDate, calendar, objectUrl, 'single'))
		}
	}

	// A detached occurrence whose master lives in another object still has to
	// be drawn, otherwise a rescheduled meeting silently disappears.
	for (const override of overrides) {
		if (relatedOverrides.has(override)) {
			continue
		}
		const event = new ICAL.Event(override)
		const start = event.startDate.toJSDate()
		const end = event.endDate.toJSDate()
		if (end > rangeStart && start < rangeEnd) {
			events.push(buildEvent(
				event,
				start,
				end,
				event.startDate.isDate,
				calendar,
				objectUrl,
				String(override.getFirstPropertyValue('recurrence-id')),
			))
		}
	}

	return events
}

/**
 * Every day key an event should appear under.
 *
 * DTEND is exclusive in iCalendar, so an event ending exactly at midnight —
 * including every all-day event — must not bleed into the following day.
 *
 * @param {object} event a parsed event
 * @return {string[]}
 */
export function dayKeysForEvent(event) {
	const first = startOfDay(event.start)
	const lastInclusive = startOfDay(new Date(Math.max(event.end.getTime() - 1, event.start.getTime())))

	const keys = []
	let cursor = first
	while (cursor <= lastInclusive && keys.length < MAX_EVENT_DAYS) {
		keys.push(dayKey(cursor))
		cursor = addDays(cursor, 1)
	}
	return keys
}

/**
 * All-day and multi-day events sort first (they render as bars across the top
 * of a cell), then timed events by clock time, then by title for stability.
 *
 * @param {object} a first event
 * @param {object} b second event
 * @return {number}
 */
export function compareEvents(a, b) {
	const aBar = a.allDay || a.multiDay
	const bBar = b.allDay || b.multiDay
	if (aBar !== bBar) {
		return aBar ? -1 : 1
	}
	if (a.start.getTime() !== b.start.getTime()) {
		return a.start.getTime() - b.start.getTime()
	}
	return a.title.localeCompare(b.title, 'fa')
}

/**
 * Bucket events into the grid's day cells.
 *
 * @param {object[]} events parsed events
 * @param {object[]} days cells produced by buildMonthGrid()
 * @return {Map<string, object[]>}
 */
export function groupEventsByDay(events, days) {
	const buckets = new Map(days.map((day) => [day.key, []]))

	for (const event of events) {
		const keys = dayKeysForEvent(event)
		const decorated = { ...event, multiDay: keys.length > 1 }
		for (const key of keys) {
			buckets.get(key)?.push(decorated)
		}
	}

	for (const bucket of buckets.values()) {
		bucket.sort(compareEvents)
	}

	return buckets
}
