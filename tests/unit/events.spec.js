/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest'

import { compareEvents, dayKeysForEvent, extractObjects, groupEventsByDay } from '../../src/utils/events.js'
import { buildMonthGrid } from '../../src/utils/jalali.js'

const CALENDAR = {
	id: '/calendars/naser/personal/',
	displayName: 'Personal',
	color: '#ff0000',
}

/**
 * @param {string} body VEVENT lines
 * @return {string}
 */
function ics(body) {
	return [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//test//EN',
		body,
		'END:VCALENDAR',
	].join('\r\n')
}

/**
 * @param {string} data raw iCalendar
 * @param {Date} rangeStart window start
 * @param {Date} rangeEnd window end
 * @return {object[]}
 */
function parse(data, rangeStart, rangeEnd, componentType = 'VEVENT') {
	return extractObjects(data, {
		rangeStart,
		rangeEnd,
		calendar: CALENDAR,
		objectUrl: '/calendars/naser/personal/event.ics',
		componentType,
	})
}

const WINDOW_START = new Date(2026, 6, 1)
const WINDOW_END = new Date(2026, 7, 1)

describe('extractObjects (VEVENT)', () => {
	it('reads a simple timed event', () => {
		const events = parse(ics([
			'BEGIN:VEVENT',
			'UID:simple-1',
			'DTSTAMP:20260701T000000Z',
			'DTSTART;TZID=Asia/Tehran:20260730T140000',
			'DTEND;TZID=Asia/Tehran:20260730T153000',
			'SUMMARY:جلسه تیم',
			'LOCATION:اتاق ۲',
			'END:VEVENT',
		].join('\r\n')), WINDOW_START, WINDOW_END)

		expect(events).toHaveLength(1)
		expect(events[0].title).toBe('جلسه تیم')
		expect(events[0].location).toBe('اتاق ۲')
		expect(events[0].allDay).toBe(false)
		expect(events[0].calendarName).toBe('Personal')
		expect(events[0].color).toBe('#ff0000')
	})

	it('falls back to a placeholder title', () => {
		const events = parse(ics([
			'BEGIN:VEVENT',
			'UID:no-title',
			'DTSTAMP:20260701T000000Z',
			'DTSTART;VALUE=DATE:20260730',
			'DTEND;VALUE=DATE:20260731',
			'END:VEVENT',
		].join('\r\n')), WINDOW_START, WINDOW_END)

		expect(events[0].title).not.toBe('')
	})

	it('flags all-day events', () => {
		const events = parse(ics([
			'BEGIN:VEVENT',
			'UID:allday-1',
			'DTSTAMP:20260701T000000Z',
			'DTSTART;VALUE=DATE:20260730',
			'DTEND;VALUE=DATE:20260731',
			'SUMMARY:تعطیل',
			'END:VEVENT',
		].join('\r\n')), WINDOW_START, WINDOW_END)

		expect(events).toHaveLength(1)
		expect(events[0].allDay).toBe(true)
	})

	it('drops events entirely outside the window', () => {
		const events = parse(ics([
			'BEGIN:VEVENT',
			'UID:far-away',
			'DTSTAMP:20200101T000000Z',
			'DTSTART:20200101T100000Z',
			'DTEND:20200101T110000Z',
			'SUMMARY:Old',
			'END:VEVENT',
		].join('\r\n')), WINDOW_START, WINDOW_END)

		expect(events).toHaveLength(0)
	})

	it('expands a weekly recurrence inside the window only', () => {
		const events = parse(ics([
			'BEGIN:VEVENT',
			'UID:weekly-1',
			'DTSTAMP:20260101T000000Z',
			'DTSTART;TZID=Asia/Tehran:20260103T100000',
			'DTEND;TZID=Asia/Tehran:20260103T110000',
			'RRULE:FREQ=WEEKLY',
			'SUMMARY:هفتگی',
			'END:VEVENT',
		].join('\r\n')), WINDOW_START, WINDOW_END)

		// July 2026 has five Saturdays: 4, 11, 18, 25 — plus 2026-07-01 is a
		// Wednesday, so the series (Saturdays) yields four occurrences.
		expect(events.length).toBeGreaterThanOrEqual(4)
		expect(events.every((event) => event.start >= WINDOW_START && event.start < WINDOW_END)).toBe(true)
		expect(events.every((event) => event.recurring)).toBe(true)
		expect(new Set(events.map((event) => event.id)).size).toBe(events.length)
	})

	it('terminates on an unbounded daily rule', () => {
		const events = parse(ics([
			'BEGIN:VEVENT',
			'UID:daily-1',
			'DTSTAMP:20100101T000000Z',
			'DTSTART:20100101T100000Z',
			'DTEND:20100101T110000Z',
			'RRULE:FREQ=DAILY',
			'SUMMARY:روزانه',
			'END:VEVENT',
		].join('\r\n')), WINDOW_START, WINDOW_END)

		expect(events).toHaveLength(31)
	})

	it('honours EXDATE', () => {
		const events = parse(ics([
			'BEGIN:VEVENT',
			'UID:exdate-1',
			'DTSTAMP:20260701T000000Z',
			'DTSTART:20260701T100000Z',
			'DTEND:20260701T110000Z',
			'RRULE:FREQ=DAILY;COUNT=5',
			'EXDATE:20260703T100000Z',
			'SUMMARY:با استثنا',
			'END:VEVENT',
		].join('\r\n')), WINDOW_START, WINDOW_END)

		expect(events).toHaveLength(4)
	})

	it('applies a modified occurrence in place of the original', () => {
		const events = parse(ics([
			'BEGIN:VEVENT',
			'UID:override-1',
			'DTSTAMP:20260701T000000Z',
			'DTSTART:20260701T100000Z',
			'DTEND:20260701T110000Z',
			'RRULE:FREQ=DAILY;COUNT=3',
			'SUMMARY:اصلی',
			'END:VEVENT',
			'BEGIN:VEVENT',
			'UID:override-1',
			'DTSTAMP:20260701T000000Z',
			'RECURRENCE-ID:20260702T100000Z',
			'DTSTART:20260702T140000Z',
			'DTEND:20260702T150000Z',
			'SUMMARY:جابه‌جا شده',
			'END:VEVENT',
		].join('\r\n')), WINDOW_START, WINDOW_END)

		expect(events).toHaveLength(3)
		const titles = events.map((event) => event.title)
		expect(titles).toContain('جابه‌جا شده')
		expect(titles.filter((title) => title === 'اصلی')).toHaveLength(2)
	})

	it('keeps a detached occurrence whose master is in another object', () => {
		const events = parse(ics([
			'BEGIN:VEVENT',
			'UID:orphan-1',
			'DTSTAMP:20260701T000000Z',
			'RECURRENCE-ID:20260715T100000Z',
			'DTSTART:20260715T120000Z',
			'DTEND:20260715T130000Z',
			'SUMMARY:جدا افتاده',
			'END:VEVENT',
		].join('\r\n')), WINDOW_START, WINDOW_END)

		expect(events).toHaveLength(1)
		expect(events[0].title).toBe('جدا افتاده')
	})

	it('returns nothing for a calendar object with no VEVENT', () => {
		const events = parse(ics([
			'BEGIN:VTODO',
			'UID:todo-1',
			'DTSTAMP:20260701T000000Z',
			'SUMMARY:کار',
			'END:VTODO',
		].join('\r\n')), WINDOW_START, WINDOW_END)

		expect(events).toHaveLength(0)
	})
})

describe('extractObjects (VTODO)', () => {
	it('places a task on its due date, matching the Calendar app', () => {
		const tasks = parse(ics([
			'BEGIN:VTODO',
			'UID:card-1',
			'DTSTAMP:20260701T000000Z',
			'DTSTART:20260710T090000Z',
			'DUE:20260730T140000Z',
			'SUMMARY:کارت دک',
			'END:VTODO',
		].join('\r\n')), WINDOW_START, WINDOW_END, 'VTODO')

		expect(tasks).toHaveLength(1)
		expect(tasks[0].isTask).toBe(true)
		expect(tasks[0].title).toBe('کارت دک')
		// Shown when due, not for the three weeks it has been open.
		expect(tasks[0].start).toEqual(tasks[0].end)
		expect(tasks[0].start.toISOString()).toBe('2026-07-30T14:00:00.000Z')
	})

	it('ignores a task with no due date', () => {
		const tasks = parse(ics([
			'BEGIN:VTODO',
			'UID:card-2',
			'DTSTAMP:20260701T000000Z',
			'DTSTART:20260710T090000Z',
			'SUMMARY:بدون مهلت',
			'END:VTODO',
		].join('\r\n')), WINDOW_START, WINDOW_END, 'VTODO')

		expect(tasks).toHaveLength(0)
	})

	it('flags a completed task by STATUS', () => {
		const tasks = parse(ics([
			'BEGIN:VTODO',
			'UID:card-3',
			'DTSTAMP:20260701T000000Z',
			'DUE:20260730T140000Z',
			'STATUS:COMPLETED',
			'SUMMARY:انجام شد',
			'END:VTODO',
		].join('\r\n')), WINDOW_START, WINDOW_END, 'VTODO')

		expect(tasks[0].completed).toBe(true)
	})

	it('flags a completed task by PERCENT-COMPLETE', () => {
		const tasks = parse(ics([
			'BEGIN:VTODO',
			'UID:card-4',
			'DTSTAMP:20260701T000000Z',
			'DUE:20260730T140000Z',
			'PERCENT-COMPLETE:100',
			'SUMMARY:صددرصد',
			'END:VTODO',
		].join('\r\n')), WINDOW_START, WINDOW_END, 'VTODO')

		expect(tasks[0].completed).toBe(true)
	})

	it('leaves a partially complete task open', () => {
		const tasks = parse(ics([
			'BEGIN:VTODO',
			'UID:card-5',
			'DTSTAMP:20260701T000000Z',
			'DUE:20260730T140000Z',
			'PERCENT-COMPLETE:40',
			'SUMMARY:در جریان',
			'END:VTODO',
		].join('\r\n')), WINDOW_START, WINDOW_END, 'VTODO')

		expect(tasks[0].completed).toBe(false)
	})

	it('handles an all-day due date', () => {
		const tasks = parse(ics([
			'BEGIN:VTODO',
			'UID:card-6',
			'DTSTAMP:20260701T000000Z',
			'DUE;VALUE=DATE:20260730',
			'SUMMARY:مهلت روزانه',
			'END:VTODO',
		].join('\r\n')), WINDOW_START, WINDOW_END, 'VTODO')

		expect(tasks[0].allDay).toBe(true)
		expect(dayKeysForEvent(tasks[0])).toEqual(['2026-07-30'])
	})

	it('gives every task in one object a distinct id', () => {
		const tasks = parse(ics([
			'BEGIN:VTODO',
			'UID:multi-1',
			'DTSTAMP:20260701T000000Z',
			'DUE:20260730T140000Z',
			'SUMMARY:یک',
			'END:VTODO',
			'BEGIN:VTODO',
			'UID:multi-2',
			'DTSTAMP:20260701T000000Z',
			'DUE:20260730T150000Z',
			'SUMMARY:دو',
			'END:VTODO',
		].join('\r\n')), WINDOW_START, WINDOW_END, 'VTODO')

		expect(tasks).toHaveLength(2)
		expect(new Set(tasks.map((task) => task.id)).size).toBe(2)
	})

	it('does not return events when asked for tasks', () => {
		const tasks = parse(ics([
			'BEGIN:VEVENT',
			'UID:evt-1',
			'DTSTAMP:20260701T000000Z',
			'DTSTART:20260730T100000Z',
			'DTEND:20260730T110000Z',
			'SUMMARY:رویداد',
			'END:VEVENT',
		].join('\r\n')), WINDOW_START, WINDOW_END, 'VTODO')

		expect(tasks).toHaveLength(0)
	})
})

describe('dayKeysForEvent', () => {
	it('puts a timed event on a single day', () => {
		expect(dayKeysForEvent({
			start: new Date(2026, 6, 30, 14, 0),
			end: new Date(2026, 6, 30, 15, 0),
			allDay: false,
		})).toEqual(['2026-07-30'])
	})

	it('does not bleed a one-day all-day event into the next day', () => {
		// DTEND is exclusive: 30 July all-day ends at midnight on the 31st.
		expect(dayKeysForEvent({
			start: new Date(2026, 6, 30),
			end: new Date(2026, 6, 31),
			allDay: true,
		})).toEqual(['2026-07-30'])
	})

	it('spans every day of a multi-day event', () => {
		expect(dayKeysForEvent({
			start: new Date(2026, 6, 30),
			end: new Date(2026, 7, 2),
			allDay: true,
		})).toEqual(['2026-07-30', '2026-07-31', '2026-08-01'])
	})

	it('does not bleed an event ending exactly at midnight', () => {
		expect(dayKeysForEvent({
			start: new Date(2026, 6, 30, 22, 0),
			end: new Date(2026, 6, 31, 0, 0),
			allDay: false,
		})).toEqual(['2026-07-30'])
	})

	it('handles a zero-length event', () => {
		expect(dayKeysForEvent({
			start: new Date(2026, 6, 30, 9, 0),
			end: new Date(2026, 6, 30, 9, 0),
			allDay: false,
		})).toEqual(['2026-07-30'])
	})
})

describe('groupEventsByDay', () => {
	const grid = buildMonthGrid(1405, 5, new Date(2026, 6, 30))

	it('creates a bucket for every cell, even empty ones', () => {
		const buckets = groupEventsByDay([], grid.days)
		expect(buckets.size).toBe(grid.days.length)
		expect([...buckets.values()].every((bucket) => bucket.length === 0)).toBe(true)
	})

	it('files an event under each day it covers', () => {
		const event = {
			id: 'a',
			title: 'سفر',
			start: new Date(2026, 6, 30),
			end: new Date(2026, 7, 2),
			allDay: true,
			color: '#f00',
			calendarId: CALENDAR.id,
		}

		const buckets = groupEventsByDay([event], grid.days)
		expect(buckets.get('2026-07-30')).toHaveLength(1)
		expect(buckets.get('2026-07-31')).toHaveLength(1)
		expect(buckets.get('2026-08-01')).toHaveLength(1)
		expect(buckets.get('2026-07-30')[0].multiDay).toBe(true)
	})

	it('ignores events outside the grid', () => {
		const event = {
			id: 'b',
			title: 'خارج',
			start: new Date(2020, 0, 1),
			end: new Date(2020, 0, 2),
			allDay: true,
			calendarId: CALENDAR.id,
		}

		const buckets = groupEventsByDay([event], grid.days)
		expect([...buckets.values()].every((bucket) => bucket.length === 0)).toBe(true)
	})

	it('sorts all-day events before timed ones, then by start time', () => {
		const day = new Date(2026, 6, 30)
		const events = [
			{ id: 'late', title: 'دیر', start: new Date(2026, 6, 30, 16), end: new Date(2026, 6, 30, 17), allDay: false, calendarId: CALENDAR.id },
			{ id: 'early', title: 'زود', start: new Date(2026, 6, 30, 9), end: new Date(2026, 6, 30, 10), allDay: false, calendarId: CALENDAR.id },
			{ id: 'allday', title: 'تمام‌روز', start: day, end: new Date(2026, 6, 31), allDay: true, calendarId: CALENDAR.id },
		]

		const bucket = groupEventsByDay(events, grid.days).get('2026-07-30')
		expect(bucket.map((event) => event.id)).toEqual(['allday', 'early', 'late'])
	})
})

describe('compareEvents', () => {
	it('is a stable total order for equal starts', () => {
		const start = new Date(2026, 6, 30, 9)
		const end = new Date(2026, 6, 30, 10)
		const a = { title: 'الف', start, end, allDay: false }
		const b = { title: 'ب', start, end, allDay: false }

		expect(Math.sign(compareEvents(a, b))).toBe(-Math.sign(compareEvents(b, a)))
	})
})
