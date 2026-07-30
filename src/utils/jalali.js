/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Everything that turns Gregorian dates into the Jalali (Shamsi) grid the UI
 * draws. Nothing in here ever touches CalDAV: events are stored in Gregorian /
 * UTC, and Jalali is strictly a display layer on top.
 */

import {
	isLeapJalaaliYear,
	isValidJalaaliDate,
	jalaaliMonthLength,
	toGregorian,
	toJalaali,
} from 'jalaali-js'

/** Month names, index 0 == Farvardin. */
export const JALALI_MONTHS = [
	'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
	'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]

/** Weekday names in Saturday-first order. */
export const WEEKDAYS = [
	'شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه',
]

/** Single-letter weekday labels, Saturday-first. */
export const WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

/**
 * Week-start options, expressed as JS `Date#getDay()` values so they can be
 * used directly in arithmetic. Saturday is the Iranian default; some
 * organisations run a Sunday-first week instead.
 */
export const SATURDAY = 6
export const SUNDAY = 0

/** Friday is the Iranian weekend, whatever the week starts on. */
export const FRIDAY_GETDAY = 5

/**
 * Weekday labels rotated for the configured week start.
 *
 * @param {number} firstDay SATURDAY or SUNDAY
 * @param {string[]} [names] the Saturday-first source list
 * @return {string[]}
 */
export function weekdayNames(firstDay = SATURDAY, names = WEEKDAYS) {
	// `names` is Saturday-first, so entry i is getDay (6 + i) % 7. The label for
	// column 0 is therefore the entry at (firstDay - SATURDAY) mod 7.
	const offset = (firstDay - SATURDAY + 7) % 7
	return names.slice(offset).concat(names.slice(0, offset))
}

/**
 * Weekday name of a date, independent of which day the week starts on.
 *
 * @param {Date} date the date to name
 * @return {string}
 */
export function weekdayNameFor(date) {
	return WEEKDAYS[(date.getDay() + 1) % 7]
}

/**
 * Column index of the Iranian weekend (Friday) for the configured week start.
 *
 * @param {number} firstDay SATURDAY or SUNDAY
 * @return {number}
 */
export function weekendColumn(firstDay = SATURDAY) {
	return (FRIDAY_GETDAY - firstDay + 7) % 7
}

/** A month grid is always six full weeks, so the layout never jumps around. */
export const WEEKS_IN_GRID = 6
export const DAYS_IN_GRID = WEEKS_IN_GRID * 7

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

/**
 * Rewrite ASCII digits as Persian ones. Done by hand rather than through Intl
 * so the output is identical on every browser and in tests.
 *
 * @param {string|number} value value to convert
 * @return {string}
 */
export function toPersianDigits(value) {
	return String(value ?? '').replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)])
}

/**
 * @param {number} value number to pad
 * @return {string}
 */
export function pad2(value) {
	return String(value).padStart(2, '0')
}

/**
 * @param {Date} date a Gregorian date
 * @return {{jy: number, jm: number, jd: number}}
 */
export function dateToJalali(date) {
	return toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

/**
 * @param {number} jy Jalali year
 * @param {number} jm Jalali month, 1-12
 * @param {number} jd Jalali day of month
 * @param {number} [hours] hours in local time
 * @param {number} [minutes] minutes in local time
 * @return {Date} the matching date in the browser's local timezone
 */
export function jalaliToDate(jy, jm, jd, hours = 0, minutes = 0) {
	const { gy, gm, gd } = toGregorian(jy, jm, jd)
	return new Date(gy, gm - 1, gd, hours, minutes, 0, 0)
}

/**
 * Column index of a date for the configured week start.
 *
 * @param {Date} date the date to inspect
 * @param {number} [firstDay] SATURDAY or SUNDAY
 * @return {number}
 */
export function weekdayIndex(date, firstDay = SATURDAY) {
	return (date.getDay() - firstDay + 7) % 7
}

/**
 * Shift a Jalali year/month pair by a number of months.
 *
 * @param {number} jy Jalali year
 * @param {number} jm Jalali month, 1-12
 * @param {number} delta months to add (may be negative)
 * @return {{jy: number, jm: number}}
 */
export function addMonths(jy, jm, delta) {
	const total = jy * 12 + (jm - 1) + delta
	return { jy: Math.floor(total / 12), jm: (total % 12) + 1 }
}

/**
 * @param {Date} date any date
 * @return {Date} local midnight of that day
 */
export function startOfDay(date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * @param {Date} date any date
 * @param {number} days days to add
 * @return {Date} local midnight, `days` later
 */
export function addDays(date, days) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/**
 * Stable per-day key, used to bucket events into grid cells. Built from the
 * local calendar fields rather than an ISO string so it never shifts by a day
 * in timezones behind UTC.
 *
 * @param {Date} date the day to identify
 * @return {string}
 */
export function dayKey(date) {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * Build the six-week Jalali month grid.
 *
 * The returned range is the *Gregorian* window the grid covers, which is what
 * gets handed to the CalDAV time-range REPORT. `rangeEnd` is exclusive.
 *
 * @param {number} jy Jalali year
 * @param {number} jm Jalali month, 1-12
 * @param {Date} [today] the date to mark as today (injectable for tests)
 * @param {number} [firstDay] SATURDAY (Iranian default) or SUNDAY
 * @return {object}
 */
export function buildMonthGrid(jy, jm, today = new Date(), firstDay = SATURDAY) {
	const firstOfMonth = jalaliToDate(jy, jm, 1)
	// Back up to the first weekday on or before the 1st, so column 0 always
	// holds the configured start of the week.
	const gridStart = addDays(firstOfMonth, -weekdayIndex(firstOfMonth, firstDay))
	const todayKey = dayKey(today)
	const weekend = weekendColumn(firstDay)

	const days = []
	for (let offset = 0; offset < DAYS_IN_GRID; offset++) {
		const date = addDays(gridStart, offset)
		const { jy: cellYear, jm: cellMonth, jd: cellDay } = dateToJalali(date)
		const weekday = offset % 7

		days.push({
			key: dayKey(date),
			date,
			jy: cellYear,
			jm: cellMonth,
			jd: cellDay,
			weekday,
			inCurrentMonth: cellYear === jy && cellMonth === jm,
			isToday: dayKey(date) === todayKey,
			isWeekend: weekday === weekend,
		})
	}

	return {
		jy,
		jm,
		days,
		firstDay,
		monthLength: jalaaliMonthLength(jy, jm),
		isLeapYear: isLeapJalaaliYear(jy),
		rangeStart: days[0].date,
		rangeEnd: addDays(days[days.length - 1].date, 1),
	}
}

/**
 * @param {number} jy Jalali year
 * @param {number} jm Jalali month, 1-12
 * @return {string} e.g. «مرداد ۱۴۰۵»
 */
export function formatMonthYear(jy, jm) {
	return `${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`
}

/**
 * @param {object} day a cell produced by buildMonthGrid()
 * @return {string} e.g. «پنج‌شنبه ۸ مرداد ۱۴۰۵»
 */
export function formatFullDate(day) {
	// Named from the date itself, so the label stays correct whichever day the
	// week is configured to start on.
	return `${weekdayNameFor(day.date)} ${toPersianDigits(day.jd)} ${JALALI_MONTHS[day.jm - 1]} ${toPersianDigits(day.jy)}`
}

/**
 * @param {Date} date the date whose clock time to render
 * @return {string} e.g. «۱۴:۳۰»
 */
export function formatTime(date) {
	return toPersianDigits(`${pad2(date.getHours())}:${pad2(date.getMinutes())}`)
}

/**
 * Week number within the Jalali year, counting the week containing Farvardin 1
 * as week one.
 *
 * @param {Date} date any date
 * @param {number} [firstDay] SATURDAY or SUNDAY
 * @return {number} 1-53
 */
export function jalaliWeekNumber(date, firstDay = SATURDAY) {
	const { jy } = dateToJalali(date)
	const nowruz = jalaliToDate(jy, 1, 1)
	// Align both ends to the start of their week, so the count is whole weeks.
	const weekOfNowruz = addDays(nowruz, -weekdayIndex(nowruz, firstDay))
	const weekOfDate = addDays(date, -weekdayIndex(date, firstDay))
	const days = Math.round((startOfDay(weekOfDate) - startOfDay(weekOfNowruz)) / 86400000)

	return Math.floor(days / 7) + 1
}

export { isLeapJalaaliYear, isValidJalaaliDate, jalaaliMonthLength }
