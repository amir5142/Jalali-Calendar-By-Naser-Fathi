/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest'

import { SATURDAY, SUNDAY, dateToJalali } from '../../src/utils/jalali.js'
import {
	VIEWS,
	buildView,
	clampDay,
	isView,
	shiftAnchor,
	startOfWeek,
} from '../../src/utils/views.js'
import {
	hourRows,
	isWorkingMinute,
	layoutDay,
	minutesInto,
	splitByKind,
} from '../../src/utils/timeline.js'

const TODAY = new Date(2026, 6, 30) // 8 Mordad 1405
const ANCHOR = { jy: 1405, jm: 5, jd: 8 }
const DAY_MS = 86400000

/**
 * @param {object} view a built view
 * @return {number} days covered by its CalDAV window
 */
function windowDays(view) {
	return Math.round((view.rangeEnd - view.rangeStart) / DAY_MS)
}

describe('view registry', () => {
	it('offers exactly the five views', () => {
		expect(VIEWS).toEqual(['day', 'week', 'month', 'year', 'list'])
	})

	it('validates view names', () => {
		expect(isView('week')).toBe(true)
		expect(isView('decade')).toBe(false)
		expect(isView(null)).toBe(false)
	})
})

describe('buildView', () => {
	it.each([
		['day', 1, 1],
		['week', 7, 7],
		['month', 42, 42],
		['list', 42, 42],
	])('%s covers %i days', (view, dayCount, windowSize) => {
		const built = buildView(view, ANCHOR, TODAY, SATURDAY)
		expect(built.days).toHaveLength(dayCount)
		expect(windowDays(built)).toBe(windowSize)
	})

	it('year covers a whole Jalali year', () => {
		const built = buildView('year', ANCHOR, TODAY, SATURDAY)
		// 1405 is a common year: 6*31 + 5*30 + 29.
		expect(built.days).toHaveLength(365)
		expect(windowDays(built)).toBe(365)
		expect(dateToJalali(built.rangeStart)).toEqual({ jy: 1405, jm: 1, jd: 1 })
	})

	it('year covers 366 days in a leap year', () => {
		const built = buildView('year', { jy: 1403, jm: 1, jd: 1 }, TODAY, SATURDAY)
		expect(built.days).toHaveLength(366)
	})

	it('every view produces a contiguous run of days', () => {
		for (const view of VIEWS) {
			const { days } = buildView(view, ANCHOR, TODAY, SATURDAY)
			for (let i = 1; i < days.length; i++) {
				// Compared as calendar days, not milliseconds: a day is 23 or 25
				// hours long either side of a DST switch, so a year view in a
				// zone that observes DST has uneven gaps by design.
				const expected = new Date(days[i - 1].date)
				expected.setDate(expected.getDate() + 1)
				expect(days[i].date.toDateString()).toBe(expected.toDateString())
			}
		}
	})

	it('every view has a non-empty title and a window that brackets its days', () => {
		for (const view of VIEWS) {
			const built = buildView(view, ANCHOR, TODAY, SATURDAY)
			expect(built.title).toBeTruthy()
			expect(built.rangeStart.getTime()).toBeLessThanOrEqual(built.days[0].date.getTime())
			expect(built.rangeEnd.getTime())
				.toBeGreaterThan(built.days[built.days.length - 1].date.getTime())
		}
	})

	it('the day view is anchored on the requested day', () => {
		const built = buildView('day', ANCHOR, TODAY, SATURDAY)
		expect(built.days[0].jd).toBe(8)
		expect(built.days[0].jm).toBe(5)
		expect(built.days[0].isToday).toBe(true)
	})

	it('the week view starts on the configured first day', () => {
		expect(buildView('week', ANCHOR, TODAY, SATURDAY).days[0].date.getDay()).toBe(6)
		expect(buildView('week', ANCHOR, TODAY, SUNDAY).days[0].date.getDay()).toBe(0)
	})

	it('the week containing the anchor actually contains it', () => {
		for (const firstDay of [SATURDAY, SUNDAY]) {
			const { days } = buildView('week', ANCHOR, TODAY, firstDay)
			expect(days.some((day) => day.jd === 8 && day.jm === 5)).toBe(true)
		}
	})
})

describe('startOfWeek', () => {
	it('is idempotent', () => {
		const start = startOfWeek(new Date(2026, 6, 30), SATURDAY)
		expect(startOfWeek(start, SATURDAY).getTime()).toBe(start.getTime())
	})
})

describe('shiftAnchor', () => {
	it('moves a day at a time in the day view', () => {
		expect(shiftAnchor('day', ANCHOR, 1, SATURDAY)).toEqual({ jy: 1405, jm: 5, jd: 9 })
		expect(shiftAnchor('day', ANCHOR, -1, SATURDAY)).toEqual({ jy: 1405, jm: 5, jd: 7 })
	})

	it('rolls over a month boundary in the day view', () => {
		expect(shiftAnchor('day', { jy: 1405, jm: 5, jd: 31 }, 1, SATURDAY))
			.toEqual({ jy: 1405, jm: 6, jd: 1 })
	})

	it('moves a week at a time in the week view', () => {
		expect(shiftAnchor('week', ANCHOR, 1, SATURDAY)).toEqual({ jy: 1405, jm: 5, jd: 15 })
	})

	it('moves a month at a time in month and list views', () => {
		for (const view of ['month', 'list']) {
			expect(shiftAnchor(view, ANCHOR, 1, SATURDAY)).toMatchObject({ jy: 1405, jm: 6 })
			expect(shiftAnchor(view, ANCHOR, -1, SATURDAY)).toMatchObject({ jy: 1405, jm: 4 })
		}
	})

	it('moves a year at a time in the year view', () => {
		expect(shiftAnchor('year', ANCHOR, 1, SATURDAY).jy).toBe(1406)
		expect(shiftAnchor('year', ANCHOR, -1, SATURDAY).jy).toBe(1404)
	})

	it('never lands on a day the target month does not have', () => {
		// 31 Mordad -> Shahrivar has 31, but Mehr has 30 and Esfand 29.
		let anchor = { jy: 1405, jm: 5, jd: 31 }
		for (let i = 0; i < 12; i++) {
			anchor = shiftAnchor('month', anchor, 1, SATURDAY)
			const built = buildView('day', anchor, TODAY, SATURDAY)
			expect(built.days[0].jd).toBe(anchor.jd)
			expect(built.days[0].jm).toBe(anchor.jm)
		}
	})
})

describe('clampDay', () => {
	it('pulls an impossible day back into the month', () => {
		expect(clampDay({ jy: 1405, jm: 12, jd: 31 })).toEqual({ jy: 1405, jm: 12, jd: 29 })
		expect(clampDay({ jy: 1403, jm: 12, jd: 31 })).toEqual({ jy: 1403, jm: 12, jd: 30 })
	})

	it('leaves a valid day alone', () => {
		expect(clampDay({ jy: 1405, jm: 5, jd: 8 })).toEqual({ jy: 1405, jm: 5, jd: 8 })
	})
})

describe('minutesInto', () => {
	const day = new Date(2026, 6, 30)

	it('measures from midnight of the day', () => {
		expect(minutesInto(new Date(2026, 6, 30, 9, 30), day)).toBe(570)
	})

	it('clamps an event that began yesterday', () => {
		expect(minutesInto(new Date(2026, 6, 29, 22, 0), day)).toBe(0)
	})

	it('clamps an event that ends tomorrow', () => {
		expect(minutesInto(new Date(2026, 6, 31, 3, 0), day)).toBe(1440)
	})
})

describe('splitByKind', () => {
	it('separates all-day and multi-day events from timed ones', () => {
		const { allDay, timed } = splitByKind([
			{ id: 'a', allDay: true },
			{ id: 'b', allDay: false, multiDay: true },
			{ id: 'c', allDay: false },
		])
		expect(allDay.map((e) => e.id)).toEqual(['a', 'b'])
		expect(timed.map((e) => e.id)).toEqual(['c'])
	})
})

describe('layoutDay', () => {
	const day = new Date(2026, 6, 30)

	/**
	 * @param {string} id event id
	 * @param {number} startHour start hour
	 * @param {number} endHour end hour
	 * @return {object}
	 */
	function ev(id, startHour, endHour) {
		return {
			id,
			title: id,
			start: new Date(2026, 6, 30, startHour),
			end: new Date(2026, 6, 30, endHour),
			allDay: false,
		}
	}

	it('gives a lone event the full width', () => {
		const [only] = layoutDay([ev('a', 9, 10)], day)
		expect(only.layout).toMatchObject({ startMinute: 540, endMinute: 600, lane: 0, lanes: 1 })
	})

	it('puts two overlapping events side by side', () => {
		const laid = layoutDay([ev('a', 9, 11), ev('b', 10, 12)], day)
		expect(laid.every((e) => e.layout.lanes === 2)).toBe(true)
		expect(laid.map((e) => e.layout.lane).sort()).toEqual([0, 1])
	})

	it('keeps non-overlapping events at full width', () => {
		const laid = layoutDay([ev('a', 9, 10), ev('b', 11, 12)], day)
		expect(laid.every((e) => e.layout.lanes === 1)).toBe(true)
	})

	it('reuses a lane once the earlier event has finished', () => {
		// a 9-10, b 9-12, c 10-11. a is over by the time c starts, so c takes
		// a's lane and the cluster needs two lanes, not three. Which lane index
		// each event lands on is an implementation detail — that a lane is
		// reused at all is not.
		const laid = layoutDay([ev('a', 9, 10), ev('b', 9, 12), ev('c', 10, 11)], day)
		const byId = Object.fromEntries(laid.map((e) => [e.id, e.layout]))

		expect(byId.a.lanes).toBe(2)
		expect(byId.c.lane).toBe(byId.a.lane)
		expect(byId.b.lane).not.toBe(byId.a.lane)
	})

	it('never overlaps two events in the same lane', () => {
		const laid = layoutDay(
			[ev('a', 8, 12), ev('b', 9, 10), ev('c', 9, 11), ev('d', 13, 14)],
			day,
		)
		for (const one of laid) {
			for (const other of laid) {
				if (one.id === other.id || one.layout.lane !== other.layout.lane) {
					continue
				}
				const disjoint = one.layout.endMinute <= other.layout.startMinute
					|| other.layout.endMinute <= one.layout.startMinute
				expect(disjoint).toBe(true)
			}
		}
	})

	it('gives a zero-length event a visible height', () => {
		const [only] = layoutDay([ev('a', 9, 9)], day)
		expect(only.layout.endMinute).toBeGreaterThan(only.layout.startMinute)
	})

	it('returns every event it was given', () => {
		const events = [ev('a', 9, 10), ev('b', 9, 11), ev('c', 14, 15)]
		expect(layoutDay(events, day)).toHaveLength(3)
	})
})

describe('working hours', () => {
	// Saturday to Wednesday, 09:00-17:00.
	const working = { start: 540, end: 1020, days: [6, 0, 1, 2, 3] }
	const saturday = new Date(2026, 6, 25)
	const friday = new Date(2026, 6, 31)

	it('counts a minute inside the range on a working day', () => {
		expect(isWorkingMinute(saturday, 600, working)).toBe(true)
	})

	it('excludes minutes outside the range', () => {
		expect(isWorkingMinute(saturday, 480, working)).toBe(false)
		expect(isWorkingMinute(saturday, 1020, working)).toBe(false)
	})

	it('excludes every minute of a non-working day', () => {
		expect(isWorkingMinute(friday, 600, working)).toBe(false)
	})

	it('marks the right hour rows as working', () => {
		const rows = hourRows(saturday, working)
		expect(rows).toHaveLength(24)
		expect(rows.filter((row) => row.isWorking).map((row) => row.hour))
			.toEqual([9, 10, 11, 12, 13, 14, 15, 16])
	})

	it('marks no hour on a non-working day', () => {
		expect(hourRows(friday, working).some((row) => row.isWorking)).toBe(false)
	})
})
