/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Covers the calendar-discovery rules that decide whether Deck boards,
 * webcal subscriptions and birthday calendars show up at all.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { grouped } = vi.hoisted(() => ({ grouped: vi.fn() }))

vi.mock('@nextcloud/auth', () => ({ getRequestToken: () => 'request-token' }))
vi.mock('@nextcloud/router', () => ({
	generateRemoteUrl: (path) => `https://cloud.example/remote.php/${path}`,
}))
vi.mock('@nextcloud/cdav-library', () => ({
	default: class FakeDavClient {

		constructor(options) {
			this.options = options
			this.calendarHomes = [{ findAllCalDAVCollectionsGrouped: grouped }]
		}

		async connect() {
			return this
		}

	},
}))

/**
 * A cdav-library-shaped collection.
 *
 * @param {object} overrides property overrides
 * @return {object}
 */
function collection(overrides = {}) {
	return {
		url: '/calendars/naser/personal/',
		displayname: 'Personal',
		color: '#ff0000',
		order: 1,
		enabled: true,
		components: ['VEVENT', 'VTODO'],
		findByTypeInTimeRange: vi.fn().mockResolvedValue([]),
		...overrides,
	}
}

/** Deck advertises VTODO only, and names boards "Deck: <board>". */
function deckBoard() {
	return collection({
		url: '/calendars/naser/app-generated--deck--board-3/',
		displayname: 'Deck: Roadmap',
		color: '#0082c9',
		order: undefined,
		enabled: undefined,
		components: ['VTODO'],
	})
}

let caldav

describe('fetchCalendars', () => {
	beforeEach(async () => {
		vi.resetModules()
		grouped.mockReset().mockResolvedValue({ calendars: [], subscriptions: [] })
		caldav = await import('../../src/utils/caldav.js')
	})

	it('includes Deck boards even though they advertise VTODO only', async () => {
		grouped.mockResolvedValue({ calendars: [collection(), deckBoard()], subscriptions: [] })

		const calendars = await caldav.fetchCalendars()
		const deck = calendars.find((calendar) => calendar.displayName === 'Deck: Roadmap')

		expect(deck).toBeDefined()
		expect(deck.supportsTasks).toBe(true)
		expect(deck.supportsEvents).toBe(false)
	})

	it('includes webcal subscriptions, which findAllCalendars() would drop', async () => {
		grouped.mockResolvedValue({
			calendars: [collection()],
			subscriptions: [collection({
				url: '/calendars/naser/holidays/',
				displayname: 'Iranian holidays',
				components: undefined,
			})],
		})

		const calendars = await caldav.fetchCalendars()
		const subscription = calendars.find((calendar) => calendar.isSubscription)

		expect(subscription).toBeDefined()
		expect(subscription.displayName).toBe('Iranian holidays')
		// No advertised component set means "everything" per RFC 4791.
		expect(subscription.supportsEvents).toBe(true)
	})

	it('respects a subscription that strips todos', async () => {
		grouped.mockResolvedValue({
			calendars: [],
			subscriptions: [collection({ stripTodos: true })],
		})

		const [subscription] = await caldav.fetchCalendars()
		expect(subscription.supportsTasks).toBe(false)
		expect(subscription.supportsEvents).toBe(true)
	})

	it('drops a collection that supports neither events nor tasks', async () => {
		grouped.mockResolvedValue({
			calendars: [collection({ components: ['VJOURNAL'] })],
			subscriptions: [],
		})

		expect(await caldav.fetchCalendars()).toHaveLength(0)
	})

	it('treats a calendar with no explicit enabled flag as visible', async () => {
		grouped.mockResolvedValue({ calendars: [deckBoard()], subscriptions: [] })

		const [deck] = await caldav.fetchCalendars()
		expect(deck.enabledOnServer).toBe(true)
	})

	it('carries the server-side disabled flag through', async () => {
		grouped.mockResolvedValue({
			calendars: [collection({ enabled: false })],
			subscriptions: [],
		})

		const [calendar] = await caldav.fetchCalendars()
		expect(calendar.enabledOnServer).toBe(false)
	})

	it('strips the alpha suffix from calendar colours', async () => {
		grouped.mockResolvedValue({
			calendars: [collection({ color: '#AABBCCDD' })],
			subscriptions: [],
		})

		const [calendar] = await caldav.fetchCalendars()
		expect(calendar.color).toBe('#AABBCC')
	})

	it('falls back to a default colour for an unusable value', async () => {
		grouped.mockResolvedValue({
			calendars: [collection({ color: 'chartreuse' })],
			subscriptions: [],
		})

		const [calendar] = await caldav.fetchCalendars()
		expect(calendar.color).toMatch(/^#[0-9a-f]{6}$/i)
	})

	it('orders by calendar order, putting unordered collections last', async () => {
		grouped.mockResolvedValue({
			calendars: [
				collection({ url: '/b/', displayname: 'B', order: 5 }),
				deckBoard(),
				collection({ url: '/a/', displayname: 'A', order: 1 }),
			],
			subscriptions: [],
		})

		const names = (await caldav.fetchCalendars()).map((calendar) => calendar.displayName)
		expect(names).toEqual(['A', 'B', 'Deck: Roadmap'])
	})
})

describe('fetchEventsInRange', () => {
	const rangeStart = new Date(2026, 6, 1)
	const rangeEnd = new Date(2026, 7, 1)

	beforeEach(async () => {
		vi.resetModules()
		grouped.mockReset().mockResolvedValue({ calendars: [], subscriptions: [] })
		caldav = await import('../../src/utils/caldav.js')
	})

	it('asks a Deck board for VTODO only — never VEVENT', async () => {
		grouped.mockResolvedValue({ calendars: [deckBoard()], subscriptions: [] })
		const [deck] = await caldav.fetchCalendars()

		await caldav.fetchEventsInRange([deck], rangeStart, rangeEnd)

		const types = deck.dav.findByTypeInTimeRange.mock.calls.map((call) => call[0])
		expect(types).toEqual(['VTODO'])
	})

	it('asks a normal calendar for both events and tasks', async () => {
		grouped.mockResolvedValue({ calendars: [collection()], subscriptions: [] })
		const [calendar] = await caldav.fetchCalendars()

		await caldav.fetchEventsInRange([calendar], rangeStart, rangeEnd)

		const types = calendar.dav.findByTypeInTimeRange.mock.calls.map((call) => call[0])
		expect(types.sort()).toEqual(['VEVENT', 'VTODO'])
	})

	it('parses Deck cards into tasks', async () => {
		const board = deckBoard()
		board.findByTypeInTimeRange = vi.fn().mockResolvedValue([{
			url: '/calendars/naser/app-generated--deck--board-3/card-7.ics',
			data: [
				'BEGIN:VCALENDAR',
				'VERSION:2.0',
				'PRODID:-//Deck//EN',
				'BEGIN:VTODO',
				'UID:deck-card-7',
				'DTSTAMP:20260701T000000Z',
				'DUE:20260730T120000Z',
				'SUMMARY:Ship the release',
				'END:VTODO',
				'END:VCALENDAR',
			].join('\r\n'),
		}])

		grouped.mockResolvedValue({ calendars: [board], subscriptions: [] })
		const [deck] = await caldav.fetchCalendars()

		const { events, failures } = await caldav.fetchEventsInRange([deck], rangeStart, rangeEnd)

		expect(failures).toHaveLength(0)
		expect(events).toHaveLength(1)
		expect(events[0].isTask).toBe(true)
		expect(events[0].title).toBe('Ship the release')
		expect(events[0].calendarName).toBe('Deck: Roadmap')
	})

	it('reports a failing calendar without losing the others', async () => {
		const good = collection({ url: '/good/', displayname: 'Good' })
		const bad = collection({ url: '/bad/', displayname: 'Bad' })
		bad.findByTypeInTimeRange = vi.fn().mockRejectedValue(new Error('offline'))

		grouped.mockResolvedValue({ calendars: [good, bad], subscriptions: [] })
		const calendars = await caldav.fetchCalendars()

		const { failures } = await caldav.fetchEventsInRange(calendars, rangeStart, rangeEnd)

		expect(failures).toHaveLength(1)
		expect(failures[0].calendar.displayName).toBe('Bad')
	})

	it('survives an unparsable calendar object', async () => {
		const calendar = collection()
		calendar.findByTypeInTimeRange = vi.fn().mockResolvedValue([
			{ url: '/broken.ics', data: 'this is not iCalendar' },
		])

		grouped.mockResolvedValue({ calendars: [calendar], subscriptions: [] })
		const calendars = await caldav.fetchCalendars()

		const { events, failures } = await caldav.fetchEventsInRange(calendars, rangeStart, rangeEnd)

		expect(events).toHaveLength(0)
		expect(failures).toHaveLength(0)
	})
})
