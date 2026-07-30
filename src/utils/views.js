/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Each view is a set of days plus the Gregorian window that covers them. The
 * window is what gets handed to the CalDAV time-range REPORT, so everything
 * downstream — fetching, grouping, rendering — works the same whichever view
 * is on screen.
 */

import {
	JALALI_MONTHS,
	SATURDAY,
	addDays,
	addMonths,
	buildMonthGrid,
	dateToJalali,
	dayKey,
	jalaaliMonthLength,
	jalaliToDate,
	toPersianDigits,
	weekdayIndex,
	weekdayNameFor,
	weekendColumn,
} from './jalali.js'

export const DAY = 'day'
export const WEEK = 'week'
export const MONTH = 'month'
export const YEAR = 'year'
export const LIST = 'list'

export const VIEWS = [DAY, WEEK, MONTH, YEAR, LIST]

/**
 * @param {string} value candidate view name
 * @return {boolean}
 */
export function isView(value) {
	return VIEWS.includes(value)
}

/**
 * Build the day descriptors for a contiguous Gregorian span.
 *
 * @param {Date} start first day, inclusive
 * @param {number} count how many days
 * @param {Date} today the date to mark
 * @param {number} firstDay SATURDAY or SUNDAY
 * @return {object[]}
 */
function daysFrom(start, count, today, firstDay) {
	const todayKey = dayKey(today)
	const weekend = weekendColumn(firstDay)

	return Array.from({ length: count }, (unused, offset) => {
		const date = addDays(start, offset)
		const { jy, jm, jd } = dateToJalali(date)
		const weekday = weekdayIndex(date, firstDay)

		return {
			key: dayKey(date),
			date,
			jy,
			jm,
			jd,
			weekday,
			inCurrentMonth: true,
			isToday: dayKey(date) === todayKey,
			isWeekend: weekday === weekend,
		}
	})
}

/**
 * First day of the week containing `date`, for the configured week start.
 *
 * @param {Date} date any date
 * @param {number} firstDay SATURDAY or SUNDAY
 * @return {Date}
 */
export function startOfWeek(date, firstDay) {
	return addDays(date, -weekdayIndex(date, firstDay))
}

/**
 * @param {number} jy Jalali year
 * @param {number} jm Jalali month
 * @param {number} jd Jalali day
 * @return {string} e.g. «۸ مرداد ۱۴۰۵»
 */
function formatDayLabel(jy, jm, jd) {
	return `${toPersianDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`
}

/**
 * Describe one view: which days it shows, the CalDAV window, and its heading.
 *
 * @param {string} view one of VIEWS
 * @param {object} anchor {jy, jm, jd} — the date the view is centred on
 * @param {Date} today the date to mark as today
 * @param {number} [firstDay] SATURDAY or SUNDAY
 * @return {object}
 */
export function buildView(view, anchor, today, firstDay = SATURDAY) {
	const { jy, jm, jd } = anchor

	if (view === MONTH || view === LIST) {
		const grid = buildMonthGrid(jy, jm, today, firstDay)
		return {
			view,
			...grid,
			anchor,
			title: `${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`,
		}
	}

	if (view === YEAR) {
		const start = jalaliToDate(jy, 1, 1)
		const end = jalaliToDate(jy, 12, jalaaliMonthLength(jy, 12))
		const count = Math.round((end - start) / 86400000) + 1

		return {
			view,
			jy,
			jm,
			anchor,
			firstDay,
			days: daysFrom(start, count, today, firstDay),
			rangeStart: start,
			rangeEnd: addDays(end, 1),
			title: toPersianDigits(jy),
		}
	}

	if (view === WEEK) {
		const start = startOfWeek(jalaliToDate(jy, jm, jd), firstDay)
		const days = daysFrom(start, 7, today, firstDay)
		const first = days[0]
		const last = days[6]

		// «۳ مرداد – ۹ مرداد ۱۴۰۵», collapsing the parts that do not change.
		const sameMonth = first.jy === last.jy && first.jm === last.jm
		const title = sameMonth
			? `${toPersianDigits(first.jd)} – ${formatDayLabel(last.jy, last.jm, last.jd)}`
			: `${formatDayLabel(first.jy, first.jm, first.jd)} – ${formatDayLabel(last.jy, last.jm, last.jd)}`

		return {
			view,
			jy,
			jm,
			anchor,
			firstDay,
			days,
			rangeStart: first.date,
			rangeEnd: addDays(last.date, 1),
			title,
		}
	}

	// Day view.
	const date = jalaliToDate(jy, jm, jd)
	const days = daysFrom(date, 1, today, firstDay)

	return {
		view,
		jy,
		jm,
		anchor,
		firstDay,
		days,
		rangeStart: date,
		rangeEnd: addDays(date, 1),
		title: `${weekdayNameFor(date)} ${formatDayLabel(jy, jm, jd)}`,
	}
}

/**
 * Move the anchor by one step of whatever the current view shows.
 *
 * @param {string} view one of VIEWS
 * @param {object} anchor {jy, jm, jd}
 * @param {number} delta -1 or +1
 * @param {number} [firstDay] SATURDAY or SUNDAY
 * @return {object} the new anchor
 */
export function shiftAnchor(view, anchor, delta, firstDay = SATURDAY) {
	const { jy, jm, jd } = anchor

	if (view === DAY) {
		return dateToJalali(addDays(jalaliToDate(jy, jm, jd), delta))
	}

	if (view === WEEK) {
		return dateToJalali(addDays(jalaliToDate(jy, jm, jd), delta * 7))
	}

	if (view === YEAR) {
		// Keep the day of month meaningful after the jump.
		const target = { jy: jy + delta, jm, jd: 1 }
		return clampDay(target)
	}

	// Month and list both step a month at a time.
	const moved = addMonths(jy, jm, delta)
	return clampDay({ ...moved, jd })
}

/**
 * Pull a day number back into range after a month or year jump — 31 Mordad has
 * no counterpart in Esfand.
 *
 * @param {object} anchor {jy, jm, jd}
 * @return {object}
 */
export function clampDay(anchor) {
	const length = jalaaliMonthLength(anchor.jy, anchor.jm)
	return { ...anchor, jd: Math.min(Math.max(anchor.jd, 1), length) }
}
