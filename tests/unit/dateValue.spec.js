/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The strings native date inputs accept are unforgiving and fail quietly: a
 * malformed value is discarded with no exception and no warning, and the field
 * just empties. These tests are the only thing standing between a formatting
 * slip and a due date that silently refuses to save.
 */

import { describe, expect, it } from 'vitest'
import { toGregorian, toJalaali } from 'jalaali-js'
import { buildValue, pad4, parseDateValue } from '../../src/utils/dateValue.js'

describe('parseDateValue', () => {
	it('reads a datetime-local value', () => {
		expect(parseDateValue('2026-07-31T14:30')).toEqual({
			gy: 2026, gm: 7, gd: 31, time: '14:30',
		})
	})

	it('reads a date-only value', () => {
		expect(parseDateValue('2026-07-31')).toEqual({
			gy: 2026, gm: 7, gd: 31, time: null,
		})
	})

	it('keeps seconds when the input supplies them', () => {
		expect(parseDateValue('2026-07-31T14:30:45').time).toBe('14:30:45')
	})

	it('accepts a space separator as well as T', () => {
		expect(parseDateValue('2026-07-31 14:30')).toEqual({
			gy: 2026, gm: 7, gd: 31, time: '14:30',
		})
	})

	it('trims surrounding whitespace', () => {
		expect(parseDateValue('  2026-07-31  ')?.gd).toBe(31)
	})

	// A Jalali year typed into a Gregorian field is indistinguishable from the
	// Gregorian year of the same number, and 1405 AD is a perfectly real date.
	// Guessing at intent here would break genuine historical dates, so the
	// value is taken at face value and the Shamsi badge shows the consequence.
	it('reads a Jalali-looking year as the Gregorian year it literally is', () => {
		expect(parseDateValue('1405-05-09')).toEqual({
			gy: 1405, gm: 5, gd: 9, time: null,
		})
	})

	// Everything below means "no date yet". The caller falls back to today, so
	// returning a half-parsed object would silently anchor the picker wrong.
	it.each([
		['empty string', ''],
		['whitespace only', '   '],
		['null', null],
		['undefined', undefined],
		['garbage', 'not a date'],
		['unpadded month', '2026-7-31'],
		['two-digit year', '26-07-31'],
		['slashes', '2026/07/31'],
		['month 13', '2026-13-01'],
		['month 00', '2026-00-01'],
		['day 32', '2026-07-32'],
		['day 00', '2026-07-00'],
		['time without a date', '14:30'],
		['trailing junk', '2026-07-31T14:30xyz'],
	])('rejects %s', (unused, input) => {
		expect(parseDateValue(input)).toBeNull()
	})
})

describe('buildValue', () => {
	it('emits YYYY-MM-DDTHH:MM for datetime-local', () => {
		expect(buildValue('datetime-local', 2026, 7, 31, '14:30')).toBe('2026-07-31T14:30')
	})

	it('emits YYYY-MM-DD for date, dropping any time', () => {
		expect(buildValue('date', 2026, 7, 31, '14:30')).toBe('2026-07-31')
	})

	it('defaults to midnight when there is no existing time', () => {
		expect(buildValue('datetime-local', 2026, 7, 31, null)).toBe('2026-07-31T00:00')
	})

	// datetime-local rejects seconds unless a matching `step` is set, and the
	// picker has no way to set one — so they are trimmed rather than echoed.
	it('trims seconds back to HH:MM', () => {
		expect(buildValue('datetime-local', 2026, 7, 31, '14:30:45')).toBe('2026-07-31T14:30')
	})

	it('zero-pads month and day', () => {
		expect(buildValue('date', 2026, 1, 5)).toBe('2026-01-05')
	})

	it('pads years below four digits', () => {
		expect(pad4(999)).toBe('0999')
		expect(buildValue('date', 999, 1, 1)).toBe('0999-01-01')
	})
})

describe('round trip through the picker', () => {
	// What the picker actually does: read the field, convert to Jalali, pick a
	// day, convert back, and write it. Time of day must survive untouched.
	const pick = (value, type, jy, jm, jd) => {
		const existing = parseDateValue(value)
		const { gy, gm, gd } = toGregorian(jy, jm, jd)

		return buildValue(type, gy, gm, gd, existing?.time ?? null)
	}

	it('preserves the time of day while changing the date', () => {
		expect(pick('2026-07-31T09:15', 'datetime-local', 1405, 5, 1)).toBe('2026-07-23T09:15')
	})

	it('still works when the field started empty', () => {
		expect(pick('', 'datetime-local', 1405, 5, 9)).toBe('2026-07-31T00:00')
	})

	it.each([
		[1400, 1, 1], [1400, 6, 31], [1400, 7, 1], [1400, 12, 29],
		[1403, 12, 30], // a leap year: Esfand has 30 days
		[1404, 1, 1], [1405, 5, 9], [1410, 12, 29], [1420, 7, 30],
	])('survives the month boundary at %i/%i/%i', (jy, jm, jd) => {
		const value = pick('2026-01-01T08:45', 'datetime-local', jy, jm, jd)

		expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T08:45$/)

		// And converts back to exactly the Jalali date that was picked.
		const parsed = parseDateValue(value)
		expect(toJalaali(parsed.gy, parsed.gm, parsed.gd)).toEqual({ jy, jm, jd })
	})
})
