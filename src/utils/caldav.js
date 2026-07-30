/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Thin wrapper over @nextcloud/cdav-library — the same client the official
 * Calendar app uses, pointed at the same /remote.php/dav endpoint.
 */

import { getRequestToken } from '@nextcloud/auth'
import { t } from '@nextcloud/l10n'
import { generateRemoteUrl } from '@nextcloud/router'
import DavClient from '@nextcloud/cdav-library'

import { extractEvents } from './events.js'

const DEFAULT_COLOR = '#0082c9'

let clientPromise = null

/**
 * Connect once and reuse; a failed connection is not cached so the UI can retry.
 *
 * @return {Promise<DavClient>}
 */
export async function getClient() {
	if (clientPromise === null) {
		const client = new DavClient({
			rootUrl: generateRemoteUrl('dav'),
			defaultHeaders: {
				'X-Requested-With': 'XMLHttpRequest',
				requesttoken: getRequestToken() ?? '',
			},
		})

		clientPromise = client.connect({ enableCalDAV: true })
			.catch((error) => {
				clientPromise = null
				throw error
			})
	}

	return clientPromise
}

/**
 * CalDAV colours may carry an alpha suffix (#RRGGBBAA), which CSS on older
 * browsers will not accept; drop it.
 *
 * @param {string|null} color the raw calendar-color property
 * @return {string}
 */
function normalizeColor(color) {
	if (typeof color !== 'string') {
		return DEFAULT_COLOR
	}
	const match = color.trim().match(/^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i)
	return match ? `#${match[1]}` : DEFAULT_COLOR
}

/**
 * @param {object} davCalendar a cdav-library Calendar
 * @return {boolean} whether the calendar can hold events at all
 */
function supportsEvents(davCalendar) {
	const components = davCalendar.components
	// An absent supported-component-set means "everything" per RFC 4791.
	return !Array.isArray(components) || components.length === 0 || components.includes('VEVENT')
}

/**
 * @param {object} davCalendar a cdav-library Calendar
 * @return {object} a plain, reactive-safe description of the calendar
 */
function toPlainCalendar(davCalendar) {
	return {
		id: davCalendar.url,
		url: davCalendar.url,
		displayName: (davCalendar.displayname ?? '').trim() || t('jalali_calendar', 'Untitled calendar'),
		color: normalizeColor(davCalendar.color),
		order: Number.isFinite(davCalendar.order) ? davCalendar.order : Number.MAX_SAFE_INTEGER,
		// Calendars the user disabled in the official Calendar app start hidden here too.
		enabledOnServer: davCalendar.enabled !== false,
		dav: davCalendar,
	}
}

/**
 * List the user's event calendars, ordered the way the Calendar app orders them.
 *
 * @return {Promise<object[]>}
 */
export async function fetchCalendars() {
	const client = await getClient()

	const home = client.calendarHomes[0]
	if (!home) {
		return []
	}

	const calendars = await home.findAllCalendars()

	return calendars
		.filter(supportsEvents)
		.map(toPlainCalendar)
		.sort((a, b) => a.order - b.order || a.displayName.localeCompare(b.displayName, 'fa'))
}

/**
 * Fetch and parse every event overlapping a Gregorian window.
 *
 * One unreachable or malformed calendar must not blank the whole month, so
 * failures are collected and reported alongside whatever did load.
 *
 * @param {object[]} calendars plain calendars from fetchCalendars()
 * @param {Date} rangeStart window start, inclusive
 * @param {Date} rangeEnd window end, exclusive
 * @return {Promise<{events: object[], failures: object[]}>}
 */
export async function fetchEventsInRange(calendars, rangeStart, rangeEnd) {
	const settled = await Promise.allSettled(calendars.map(async (calendar) => {
		const objects = await calendar.dav.findByTypeInTimeRange('VEVENT', rangeStart, rangeEnd)

		return objects.flatMap((object) => {
			try {
				return extractEvents(object.data, {
					rangeStart,
					rangeEnd,
					calendar,
					objectUrl: object.url,
				})
			} catch (error) {
				// A single unparsable object should not cost us the calendar.
				console.error('[jalali_calendar] could not parse', object.url, error)
				return []
			}
		})
	}))

	const events = []
	const failures = []

	settled.forEach((result, index) => {
		if (result.status === 'fulfilled') {
			events.push(...result.value)
		} else {
			console.error('[jalali_calendar] could not load', calendars[index].displayName, result.reason)
			failures.push({ calendar: calendars[index], reason: result.reason })
		}
	})

	return { events, failures }
}
