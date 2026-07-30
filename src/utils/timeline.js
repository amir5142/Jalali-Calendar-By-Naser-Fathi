/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Laying timed events out on an hour grid: which pixel row they start on, and
 * how to share the width when several overlap.
 */

import { startOfDay, toPersianDigits, pad2 } from './jalali.js'

export const MINUTES_PER_DAY = 24 * 60

/** A zero-length event still needs to be clickable. */
const MIN_DURATION_MINUTES = 15

/**
 * Minutes from midnight of `day` that `date` falls at, clamped to the day.
 *
 * @param {Date} date the instant to place
 * @param {Date} day the day being drawn
 * @return {number} 0-1440
 */
export function minutesInto(date, day) {
	const midnight = startOfDay(day).getTime()
	const minutes = Math.round((date.getTime() - midnight) / 60000)

	return Math.min(Math.max(minutes, 0), MINUTES_PER_DAY)
}

/**
 * @param {number} minutes minutes from midnight
 * @return {string} e.g. «۰۹:۰۰»
 */
export function formatHourLabel(minutes) {
	const hour = Math.floor(minutes / 60) % 24
	return toPersianDigits(`${pad2(hour)}:${pad2(minutes % 60)}`)
}

/**
 * Split a day's events into the all-day bar and the timed grid.
 *
 * Multi-day events are drawn in the bar too: on their middle days they have no
 * meaningful start or end time to position against.
 *
 * @param {object[]} events events already bucketed to this day
 * @return {{allDay: object[], timed: object[]}}
 */
export function splitByKind(events) {
	const allDay = []
	const timed = []

	for (const event of events) {
		if (event.allDay || event.multiDay) {
			allDay.push(event)
		} else {
			timed.push(event)
		}
	}

	return { allDay, timed }
}

/**
 * Position timed events on one day's column.
 *
 * Events that overlap in time share the column's width. The packing is the
 * usual one: sort by start, group into clusters of mutually overlapping
 * events, then within a cluster give each event the first free lane.
 *
 * @param {object[]} events timed events for a single day
 * @param {Date} day the day being drawn
 * @return {object[]} events decorated with `layout` {startMinute, endMinute, lane, lanes}
 */
export function layoutDay(events, day) {
	const placed = events
		.map((event) => {
			const startMinute = minutesInto(event.start, day)
			const rawEnd = minutesInto(event.end, day)
			return {
				event,
				startMinute,
				// An event ending at or before its start (or at midnight of the
				// next day) still needs a visible box.
				endMinute: Math.max(rawEnd, startMinute + MIN_DURATION_MINUTES),
			}
		})
		.sort((a, b) => a.startMinute - b.startMinute
			|| b.endMinute - a.endMinute
			|| a.event.title.localeCompare(b.event.title, 'fa'))

	const result = []
	let cluster = []
	let clusterEnd = -1

	/** Assign lanes within one cluster and flush it to the result. */
	const flush = () => {
		if (cluster.length === 0) {
			return
		}

		const laneEnds = []
		for (const item of cluster) {
			let lane = laneEnds.findIndex((end) => end <= item.startMinute)
			if (lane === -1) {
				lane = laneEnds.length
			}
			laneEnds[lane] = item.endMinute
			item.lane = lane
		}

		const lanes = laneEnds.length
		for (const item of cluster) {
			result.push({
				...item.event,
				layout: {
					startMinute: item.startMinute,
					endMinute: item.endMinute,
					lane: item.lane,
					lanes,
				},
			})
		}

		cluster = []
		clusterEnd = -1
	}

	for (const item of placed) {
		// A gap means nothing later can overlap what came before.
		if (cluster.length > 0 && item.startMinute >= clusterEnd) {
			flush()
		}
		cluster.push(item)
		clusterEnd = Math.max(clusterEnd, item.endMinute)
	}
	flush()

	return result
}

/**
 * Whether a given minute of a given day falls inside working hours.
 *
 * @param {Date} day the day
 * @param {number} minute minutes from midnight
 * @param {object} working {start, end, days}
 * @return {boolean}
 */
export function isWorkingMinute(day, minute, working) {
	if (!working?.days?.includes(day.getDay())) {
		return false
	}

	return minute >= working.start && minute < working.end
}

/**
 * The hour rows to draw, tagged with whether each is working time.
 *
 * @param {Date} day the day being drawn
 * @param {object} working {start, end, days}
 * @return {object[]} 24 entries
 */
export function hourRows(day, working) {
	return Array.from({ length: 24 }, (unused, hour) => ({
		hour,
		minute: hour * 60,
		label: formatHourLabel(hour * 60),
		// An hour counts as working if any part of it is.
		isWorking: isWorkingMinute(day, hour * 60, working)
			|| isWorkingMinute(day, hour * 60 + 59, working),
	}))
}
