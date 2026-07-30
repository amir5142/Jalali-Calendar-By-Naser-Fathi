/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest'

import {
	DAYS_IN_GRID,
	SATURDAY,
	SUNDAY,
	JALALI_MONTHS,
	WEEKDAYS,
	addMonths,
	buildMonthGrid,
	dateToJalali,
	dayKey,
	formatMonthYear,
	formatTime,
	isLeapJalaaliYear,
	jalaaliMonthLength,
	jalaliToDate,
	toPersianDigits,
	weekdayIndex,
	weekdayNameFor,
	weekdayNames,
	weekendColumn,
} from '../../src/utils/jalali.js'

describe('digit formatting', () => {
	it('rewrites ASCII digits as Persian ones', () => {
		expect(toPersianDigits(1405)).toBe('۱۴۰۵')
		expect(toPersianDigits('08:30')).toBe('۰۸:۳۰')
	})

	it('leaves non-digits alone', () => {
		expect(toPersianDigits('مرداد')).toBe('مرداد')
	})

	it('survives null and undefined', () => {
		expect(toPersianDigits(null)).toBe('')
		expect(toPersianDigits(undefined)).toBe('')
	})
})

describe('Gregorian <-> Jalali conversion', () => {
	it.each([
		// [gregorian, expected jalali]
		[[2026, 7, 30], { jy: 1405, jm: 5, jd: 8 }],
		[[2024, 3, 20], { jy: 1403, jm: 1, jd: 1 }], // Nowruz 1403
		[[2025, 3, 21], { jy: 1404, jm: 1, jd: 1 }], // Nowruz 1404
		[[2026, 3, 21], { jy: 1405, jm: 1, jd: 1 }], // Nowruz 1405
		[[1979, 2, 11], { jy: 1357, jm: 11, jd: 22 }], // 22 Bahman
	])('converts %s', (gregorian, expected) => {
		const [gy, gm, gd] = gregorian
		expect(dateToJalali(new Date(gy, gm - 1, gd))).toEqual(expected)
	})

	it('round-trips every day of a leap Jalali year', () => {
		const jy = 1403
		expect(isLeapJalaaliYear(jy)).toBe(true)

		for (let jm = 1; jm <= 12; jm++) {
			for (let jd = 1; jd <= jalaaliMonthLength(jy, jm); jd++) {
				expect(dateToJalali(jalaliToDate(jy, jm, jd))).toEqual({ jy, jm, jd })
			}
		}
	})

	it('gives Esfand 30 days in a leap year and 29 otherwise', () => {
		expect(jalaaliMonthLength(1403, 12)).toBe(30)
		expect(jalaaliMonthLength(1404, 12)).toBe(29)
	})

	it('uses 31-day months for the first half of the year', () => {
		for (let jm = 1; jm <= 6; jm++) {
			expect(jalaaliMonthLength(1405, jm)).toBe(31)
		}
		for (let jm = 7; jm <= 11; jm++) {
			expect(jalaaliMonthLength(1405, jm)).toBe(30)
		}
	})
})

describe('weekdayIndex', () => {
	it('treats Saturday as the first day of the week by default', () => {
		// 2026-07-25 is a Saturday.
		expect(weekdayIndex(new Date(2026, 6, 25))).toBe(0)
		expect(weekdayIndex(new Date(2026, 6, 26))).toBe(1) // Sunday
		expect(weekdayIndex(new Date(2026, 6, 31))).toBe(6) // Friday
	})

	it('shifts every column when the week starts on Sunday', () => {
		expect(weekdayIndex(new Date(2026, 6, 26), SUNDAY)).toBe(0) // Sunday
		expect(weekdayIndex(new Date(2026, 6, 31), SUNDAY)).toBe(5) // Friday
		expect(weekdayIndex(new Date(2026, 6, 25), SUNDAY)).toBe(6) // Saturday
	})
})

describe('week start configuration', () => {
	it('rotates the weekday labels', () => {
		expect(weekdayNames(SATURDAY)[0]).toBe('شنبه')
		expect(weekdayNames(SUNDAY)[0]).toBe('یکشنبه')
		expect(weekdayNames(SUNDAY)[6]).toBe('شنبه')
	})

	it('keeps all seven labels, without duplicates, either way', () => {
		for (const firstDay of [SATURDAY, SUNDAY]) {
			const names = weekdayNames(firstDay)
			expect(names).toHaveLength(7)
			expect(new Set(names).size).toBe(7)
		}
	})

	it('moves the weekend column with the week start', () => {
		expect(weekendColumn(SATURDAY)).toBe(6)
		expect(weekendColumn(SUNDAY)).toBe(5)
		// Whichever way round, the weekend column is Friday.
		expect(weekdayNames(SATURDAY)[weekendColumn(SATURDAY)]).toBe('جمعه')
		expect(weekdayNames(SUNDAY)[weekendColumn(SUNDAY)]).toBe('جمعه')
	})

	it('names a date the same regardless of week start', () => {
		expect(weekdayNameFor(new Date(2026, 6, 25))).toBe('شنبه')
		expect(weekdayNameFor(new Date(2026, 6, 30))).toBe('پنج‌شنبه')
	})

	it('builds a Sunday-first grid that still covers the whole month', () => {
		const grid = buildMonthGrid(1405, 5, new Date(2026, 6, 30), SUNDAY)

		expect(grid.days).toHaveLength(DAYS_IN_GRID)
		expect(grid.days[0].date.getDay()).toBe(0) // Sunday
		expect(grid.firstDay).toBe(SUNDAY)
		expect(grid.days.filter((day) => day.inCurrentMonth)).toHaveLength(grid.monthLength)
	})

	it('still marks exactly six Fridays as the weekend when Sunday-first', () => {
		const grid = buildMonthGrid(1405, 5, new Date(2026, 6, 30), SUNDAY)
		const weekends = grid.days.filter((day) => day.isWeekend)

		expect(weekends).toHaveLength(6)
		expect(weekends.every((day) => day.date.getDay() === 5)).toBe(true)
	})

	it('covers a different Gregorian window than the Saturday-first grid', () => {
		const sat = buildMonthGrid(1405, 5, new Date(2026, 6, 30), SATURDAY)
		const sun = buildMonthGrid(1405, 5, new Date(2026, 6, 30), SUNDAY)

		// The Sunday grid starts a day later, since Mordad 1 is a Friday.
		expect(sun.rangeStart.getTime()).not.toBe(sat.rangeStart.getTime())
		expect(sun.days.filter((d) => d.inCurrentMonth)).toHaveLength(sat.days.filter((d) => d.inCurrentMonth).length)
	})
})

describe('addMonths', () => {
	it('moves within a year', () => {
		expect(addMonths(1405, 5, 2)).toEqual({ jy: 1405, jm: 7 })
	})

	it('rolls forward over the new year', () => {
		expect(addMonths(1405, 12, 1)).toEqual({ jy: 1406, jm: 1 })
	})

	it('rolls backward over the new year', () => {
		expect(addMonths(1405, 1, -1)).toEqual({ jy: 1404, jm: 12 })
	})

	it('handles multi-year jumps in both directions', () => {
		expect(addMonths(1405, 6, 24)).toEqual({ jy: 1407, jm: 6 })
		expect(addMonths(1405, 6, -24)).toEqual({ jy: 1403, jm: 6 })
	})
})

describe('buildMonthGrid', () => {
	it('always produces six full weeks starting on a Saturday', () => {
		const grid = buildMonthGrid(1405, 5, new Date(2026, 6, 30))

		expect(grid.days).toHaveLength(DAYS_IN_GRID)
		expect(grid.days[0].weekday).toBe(0)
		expect(grid.days[0].date.getDay()).toBe(6) // JS Saturday
		expect(grid.days.every((day, index) => day.weekday === index % 7)).toBe(true)
	})

	it('contains every day of the month exactly once', () => {
		const grid = buildMonthGrid(1405, 5, new Date(2026, 6, 30))
		const inMonth = grid.days.filter((day) => day.inCurrentMonth)

		expect(inMonth).toHaveLength(grid.monthLength)
		expect(inMonth.map((day) => day.jd)).toEqual(
			Array.from({ length: grid.monthLength }, (unused, index) => index + 1),
		)
	})

	it('covers a contiguous Gregorian range that brackets the month', () => {
		const grid = buildMonthGrid(1405, 5, new Date(2026, 6, 30))

		expect(grid.rangeStart).toEqual(grid.days[0].date)
		// rangeEnd is exclusive: the day after the last cell.
		expect(grid.rangeEnd.getTime() - grid.days[DAYS_IN_GRID - 1].date.getTime())
			.toBe(24 * 60 * 60 * 1000)

		for (let index = 1; index < grid.days.length; index++) {
			const delta = grid.days[index].date - grid.days[index - 1].date
			expect(delta).toBe(24 * 60 * 60 * 1000)
		}
	})

	it('marks exactly one cell as today when today is in view', () => {
		const grid = buildMonthGrid(1405, 5, new Date(2026, 6, 30))
		const todays = grid.days.filter((day) => day.isToday)

		expect(todays).toHaveLength(1)
		expect(todays[0].jd).toBe(8)
		expect(todays[0].inCurrentMonth).toBe(true)
	})

	it('marks no cell as today when today is elsewhere', () => {
		const grid = buildMonthGrid(1390, 1, new Date(2026, 6, 30))
		expect(grid.days.some((day) => day.isToday)).toBe(false)
	})

	it('marks Fridays, and only Fridays, as the weekend', () => {
		const grid = buildMonthGrid(1405, 5, new Date(2026, 6, 30))
		const weekends = grid.days.filter((day) => day.isWeekend)

		expect(weekends).toHaveLength(6)
		expect(weekends.every((day) => day.date.getDay() === 5)).toBe(true)
	})

	it('handles Esfand of a leap year (30 days)', () => {
		const grid = buildMonthGrid(1403, 12, new Date(2026, 6, 30))
		expect(grid.monthLength).toBe(30)
		expect(grid.days.filter((day) => day.inCurrentMonth)).toHaveLength(30)
	})

	it('spans a Jalali new year without gaps', () => {
		const grid = buildMonthGrid(1405, 1, new Date(2026, 6, 30))
		const leading = grid.days.filter((day) => !day.inCurrentMonth && day.jm === 12)

		expect(leading.every((day) => day.jy === 1404)).toBe(true)
		expect(grid.days[0].inCurrentMonth || leading.length > 0).toBe(true)
	})

	it('produces unique day keys', () => {
		const grid = buildMonthGrid(1405, 5, new Date(2026, 6, 30))
		expect(new Set(grid.days.map((day) => day.key)).size).toBe(DAYS_IN_GRID)
	})

	it('builds every month of a year without error', () => {
		for (let jm = 1; jm <= 12; jm++) {
			const grid = buildMonthGrid(1405, jm, new Date(2026, 6, 30))
			expect(grid.days).toHaveLength(DAYS_IN_GRID)
			expect(grid.days.filter((day) => day.inCurrentMonth)).toHaveLength(grid.monthLength)
		}
	})
})

describe('formatting', () => {
	it('renders month and year in Persian', () => {
		expect(formatMonthYear(1405, 5)).toBe('مرداد ۱۴۰۵')
		expect(formatMonthYear(1404, 1)).toBe('فروردین ۱۴۰۴')
	})

	it('renders clock time with Persian digits', () => {
		expect(formatTime(new Date(2026, 6, 30, 14, 5))).toBe('۱۴:۰۵')
		expect(formatTime(new Date(2026, 6, 30, 9, 0))).toBe('۰۹:۰۰')
	})

	it('has twelve month names and seven weekday names', () => {
		expect(JALALI_MONTHS).toHaveLength(12)
		expect(WEEKDAYS).toHaveLength(7)
		expect(WEEKDAYS[0]).toBe('شنبه')
	})
})

describe('dayKey', () => {
	it('is zero-padded and local-calendar based', () => {
		expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
	})

	it('does not shift across a late-evening boundary', () => {
		// A naive toISOString() would report the next day for anywhere east of UTC.
		expect(dayKey(new Date(2026, 6, 30, 23, 59))).toBe('2026-07-30')
		expect(dayKey(new Date(2026, 6, 30, 0, 1))).toBe('2026-07-30')
	})
})
