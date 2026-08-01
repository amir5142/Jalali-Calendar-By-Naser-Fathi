/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Marshalling for the strings native `<input type="date">` and
 * `<input type="datetime-local">` accept.
 *
 * Deliberately free of both the DOM and the calendar so it can be tested on its
 * own. Exactness matters more here than anywhere else in the picker: a
 * malformed value is discarded by the input without an exception, a console
 * warning, or any other trace — the field simply goes blank.
 */

import { pad2 } from './jalali.js'

/**
 * Accepts what the two input types actually produce. The seconds and the space
 * separator are not emitted by us, but Chromium includes seconds once a step is
 * set, and values arriving from an app's own model are not always normalised.
 */
const VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?$/

/**
 * @param {number} value year to pad
 * @return {string} four digits, so year 999 and earlier stay parseable
 */
export function pad4(value) {
	return String(value).padStart(4, '0')
}

/**
 * Split a native date value into its parts.
 *
 * @param {string|null|undefined} raw the input's current value
 * @return {{gy: number, gm: number, gd: number, time: string|null}|null}
 *   null when the value is empty or unparseable — both mean "no date yet", and
 *   the caller should fall back to today rather than guess.
 */
export function parseDateValue(raw) {
	const match = String(raw ?? '').trim().match(VALUE_PATTERN)
	if (!match) {
		return null
	}

	const [, gy, gm, gd, time] = match
	const parsed = {
		gy: Number(gy),
		gm: Number(gm),
		gd: Number(gd),
		time: time ?? null,
	}

	// The pattern only proves the shape. "2026-13-45" matches it and would then
	// convert to a nonsense Jalali date, so range-check before trusting it.
	if (parsed.gm < 1 || parsed.gm > 12 || parsed.gd < 1 || parsed.gd > 31) {
		return null
	}

	return parsed
}

/**
 * Render a value the native input will accept.
 *
 * @param {string} type the input's `type` attribute
 * @param {number} gy Gregorian year
 * @param {number} gm Gregorian month, 1-12
 * @param {number} gd Gregorian day of month
 * @param {string|null} [time] existing time of day to keep, `HH:MM` or `HH:MM:SS`
 * @return {string}
 */
export function buildValue(type, gy, gm, gd, time = null) {
	const date = `${pad4(gy)}-${pad2(gm)}-${pad2(gd)}`
	if (type !== 'datetime-local') {
		return date
	}

	// Only the date is being changed, so an existing time of day survives the
	// edit. Seconds are dropped: the input rejects them unless a matching step
	// is set, and nothing in the picker can set one.
	const kept = time ? time.slice(0, 5) : '00:00'

	return `${date}T${kept}`
}
