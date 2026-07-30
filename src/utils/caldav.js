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

import { extractObjects } from './events.js'

const DEFAULT_COLOR = '#0082c9'

export const VEVENT = 'VEVENT'
export const VTODO = 'VTODO'

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
				// Ask the server to cache webcal subscriptions rather than
				// refetch the remote source on every single request.
				'X-NC-CalDAV-Webcal-Caching': 'On',
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
 * Describe a CalDAV collection in plain, reactive-safe terms.
 *
 * The supported-component-set is what decides whether we ask a collection for
 * events, tasks or both. It matters more than it looks: Deck advertises
 * `VTODO` *only*, so filtering on VEVENT alone silently hides every board.
 * An absent set means "everything" per RFC 4791.
 *
 * @param {object} davCollection a cdav-library Calendar or Subscription
 * @param {boolean} isSubscription whether it came from the subscription list
 * @return {object}
 */
function toPlainCalendar(davCollection, isSubscription) {
	const components = davCollection.components
	const unrestricted = !Array.isArray(components) || components.length === 0

	return {
		id: davCollection.url,
		url: davCollection.url,
		displayName: (davCollection.displayname ?? '').trim() || t('jalali_calendar', 'Untitled calendar'),
		color: normalizeColor(davCollection.color),
		order: Number.isFinite(davCollection.order) ? davCollection.order : Number.MAX_SAFE_INTEGER,
		// Calendars the user disabled in the official Calendar app start hidden here too.
		enabledOnServer: davCollection.enabled !== false,
		supportsEvents: unrestricted || components.includes(VEVENT),
		// A subscription may be configured to drop the todos it imports.
		supportsTasks: (unrestricted || components.includes(VTODO))
			&& davCollection.stripTodos !== true,
		isSubscription,
		dav: davCollection,
	}
}

/**
 * List everything the Calendar app would list: real calendars, webcal
 * subscriptions, and app-generated calendars such as Deck boards.
 *
 * `findAllCalendars()` is deliberately not used — it filters subscriptions out.
 *
 * @return {Promise<object[]>}
 */
export async function fetchCalendars() {
	const client = await getClient()

	const home = client.calendarHomes[0]
	if (!home) {
		return []
	}

	const { calendars, subscriptions } = await home.findAllCalDAVCollectionsGrouped()

	return [
		...calendars.map((calendar) => toPlainCalendar(calendar, false)),
		...subscriptions.map((subscription) => toPlainCalendar(subscription, true)),
	]
		.filter((calendar) => calendar.supportsEvents || calendar.supportsTasks)
		.sort((a, b) => a.order - b.order || a.displayName.localeCompare(b.displayName, 'fa'))
}

/**
 * Which component types are worth asking a given collection for.
 *
 * @param {object} calendar a plain calendar
 * @return {string[]}
 */
function queryableTypes(calendar) {
	const types = []
	if (calendar.supportsEvents) {
		types.push(VEVENT)
	}
	if (calendar.supportsTasks) {
		types.push(VTODO)
	}
	return types
}

/**
 * Fetch and parse everything renderable in one collection.
 *
 * Each component type is a separate time-range REPORT, matching the type the
 * collection actually advertises, so a Deck board costs exactly one request.
 *
 * @param {object} calendar a plain calendar
 * @param {Date} rangeStart window start, inclusive
 * @param {Date} rangeEnd window end, exclusive
 * @return {Promise<object[]>}
 */
async function fetchFromCalendar(calendar, rangeStart, rangeEnd) {
	const perType = await Promise.all(queryableTypes(calendar).map(async (componentType) => {
		const objects = await calendar.dav.findByTypeInTimeRange(componentType, rangeStart, rangeEnd)

		return objects.flatMap((object) => {
			try {
				return extractObjects(object.data, {
					rangeStart,
					rangeEnd,
					calendar,
					objectUrl: object.url,
					componentType,
				})
			} catch (error) {
				// A single unparsable object should not cost us the calendar.
				console.error('[jalali_calendar] could not parse', object.url, error)
				return []
			}
		})
	}))

	return perType.flat()
}

/**
 * Fetch and parse every event and task overlapping a Gregorian window.
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
	const settled = await Promise.allSettled(
		calendars.map((calendar) => fetchFromCalendar(calendar, rangeStart, rangeEnd)),
	)

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
