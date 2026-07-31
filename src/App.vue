<!--
  - SPDX-FileCopyrightText: 2026 Naser Fathi
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<NcContent app-name="jalali_calendar">
		<NcAppNavigation :aria-label="t('jalali_calendar', 'Calendars')">
			<template #list>
				<NcAppNavigationCaption :name="t('jalali_calendar', 'Calendars')" />

				<NcAppNavigationItem v-if="loadingCalendars"
					:name="t('jalali_calendar', 'Loading calendars …')"
					:loading="true" />

				<NcAppNavigationItem v-for="calendar in calendars"
					v-else
					:key="calendar.id"
					:name="calendar.displayName"
					class="calendar-item"
					:class="{ 'calendar-item--hidden': hiddenCalendarIds.has(calendar.id) }"
					:aria-pressed="!hiddenCalendarIds.has(calendar.id)"
					@click.prevent="toggleCalendar(calendar.id)">
					<template #icon>
						<span class="calendar-item__bullet"
							:style="{ backgroundColor: calendar.color }"
							aria-hidden="true" />
					</template>
				</NcAppNavigationItem>

				<p v-if="!loadingCalendars && calendars.length === 0" class="navigation-hint">
					{{ t('jalali_calendar', 'No calendars found.') }}
				</p>
			</template>

			<template #footer>
				<p class="navigation-hint">
					{{ t('jalali_calendar', 'Events are read from your existing CalDAV calendars. Create and edit them in the Calendar app.') }}
				</p>
			</template>
		</NcAppNavigation>

		<NcAppContent>
			<div class="calendar-view">
				<div class="calendar-toolbar" dir="rtl" lang="fa">
					<div class="calendar-toolbar__nav">
						<NcButton :aria-label="previousLabel" variant="tertiary" @click="shift(-1)">
							<template #icon>
								<NcIconSvgWrapper :path="mdiChevronRight" />
							</template>
						</NcButton>

						<NcButton :aria-label="nextLabel" variant="tertiary" @click="shift(1)">
							<template #icon>
								<NcIconSvgWrapper :path="mdiChevronLeft" />
							</template>
						</NcButton>

						<NcButton :disabled="isViewingToday" @click="goToToday">
							{{ t('jalali_calendar', 'Today') }}
						</NcButton>
					</div>

					<h2 class="calendar-toolbar__title">
						{{ current.title }}
						<NcLoadingIcon v-if="loadingEvents" :size="20" />
					</h2>

					<p class="calendar-toolbar__gregorian">
						{{ gregorianLabel }}
					</p>

					<div class="calendar-toolbar__views">
						<NcButton v-for="option in viewOptions"
							:key="option.id"
							:variant="option.id === view ? 'primary' : 'tertiary'"
							:aria-pressed="option.id === view"
							@click="setView(option.id)">
							{{ option.label }}
						</NcButton>
					</div>
				</div>

				<NcNoteCard v-if="calendarError"
					type="error"
					:heading="t('jalali_calendar', 'Could not load your calendars')">
					{{ calendarErrorMessage }}
					<NcButton class="note-action" @click="reload">
						{{ t('jalali_calendar', 'Try again') }}
					</NcButton>
				</NcNoteCard>

				<NcNoteCard v-else-if="failedCalendars.length"
					type="warning"
					:heading="t('jalali_calendar', 'Some calendars could not be loaded')">
					{{ failedCalendarNames }}
				</NcNoteCard>

				<!-- Times are rendered in the browser's zone. When that differs
				     from the calendar timezone, events look shifted against the
				     Calendar app, so say so rather than let it look like a bug. -->
				<NcNoteCard v-if="timezoneMismatch" type="info">
					{{ t('jalali_calendar', 'Times are shown in this device\'s timezone ({device}), which differs from your calendar timezone ({calendar}).', {
						device: browserTimezone,
						calendar: calendarTimezone,
					}) }}
				</NcNoteCard>

				<MonthGrid v-if="view === 'month'"
					:grid="current"
					:events-by-day="eventsByDay"
					:off-days-by-day="offDaysByDay"
					:limit-events="prefs.limitMonthEvents"
					:show-week-numbers="prefs.showWeekNumbers"
					:selected-day-key="selectedDayKey"
					:selected-event-id="selectedEventId"
					@select-day="onSelectDay"
					@select-event="onSelectEvent" />

				<TimeGridView v-else-if="view === 'day' || view === 'week'"
					:key="view + current.days[0].key"
					:days="current.days"
					:events-by-day="eventsByDay"
					:off-days-by-day="offDaysByDay"
					:working="working"
					:slot-duration="prefs.slotDuration"
					:now="today"
					:selected-event-id="selectedEventId"
					:style="{ '--columns': current.days.length }"
					@select-day="openDay"
					@select-event="onSelectEvent" />

				<YearView v-else-if="view === 'year'"
					:jy="current.jy"
					:first-day="firstDay"
					:today="today"
					:events-by-day="eventsByDay"
					:off-days-by-day="offDaysByDay"
					@select-day="openDay"
					@select-month="openMonth" />

				<ListView v-else
					:days="current.days"
					:events-by-day="eventsByDay"
					:off-days-by-day="offDaysByDay"
					:selected-event-id="selectedEventId"
					@select-day="openDay"
					@select-event="onSelectEvent" />
			</div>
		</NcAppContent>

		<DaySidebar :day="selectedDay"
			:events="selectedDayEvents"
			:selected-event-id="selectedEventId"
			@close="closeSidebar" />
	</NcContent>
</template>

<script>
import { mdiChevronLeft, mdiChevronRight } from '@mdi/js'
import { loadState } from '@nextcloud/initial-state'
import { t } from '@nextcloud/l10n'
import NcAppContent from '@nextcloud/vue/components/NcAppContent'
import NcAppNavigation from '@nextcloud/vue/components/NcAppNavigation'
import NcAppNavigationCaption from '@nextcloud/vue/components/NcAppNavigationCaption'
import NcAppNavigationItem from '@nextcloud/vue/components/NcAppNavigationItem'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcContent from '@nextcloud/vue/components/NcContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'

import DaySidebar from './components/DaySidebar.vue'
import ListView from './components/ListView.vue'
import MonthGrid from './components/MonthGrid.vue'
import TimeGridView from './components/TimeGridView.vue'
import YearView from './components/YearView.vue'
import { useCalendarStore } from './store/calendarStore.js'
import { fetchOffDays } from './utils/api.js'
import { groupEventsByDay } from './utils/events.js'
import { SATURDAY, SUNDAY, dateToJalali, dayKey, formatMonthYear } from './utils/jalali.js'
import { VIEWS, buildView, clampDay, isView, shiftAnchor } from './utils/views.js'

/** Remembered per browser, like the calendar visibility toggles. */
const VIEW_STORAGE_KEY = 'jalali_calendar:view'

export default {
	name: 'App',

	components: {
		DaySidebar,
		ListView,
		MonthGrid,
		NcAppContent,
		NcAppNavigation,
		NcAppNavigationCaption,
		NcAppNavigationItem,
		NcButton,
		NcContent,
		NcIconSvgWrapper,
		NcLoadingIcon,
		NcNoteCard,
		TimeGridView,
		YearView,
	},

	setup() {
		return {
			...useCalendarStore(),
			mdiChevronLeft,
			mdiChevronRight,
		}
	},

	data() {
		const today = new Date()
		const config = loadState('jalali_calendar', 'config', {})
		const initial = config.initialMonth
			? clampDay({ ...config.initialMonth, jd: 1 })
			: dateToJalali(today)

		return {
			anchor: initial,
			view: this.readStoredView(),
			today,
			calendarTimezone: config.timezone ?? null,
			browserTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
			firstDay: config.firstDayOfWeek === 'sunday' ? SUNDAY : SATURDAY,
			working: {
				start: Number.isFinite(config.workStart) ? config.workStart : 9 * 60,
				end: Number.isFinite(config.workEnd) ? config.workEnd : 17 * 60,
				days: Array.isArray(config.workDays) ? config.workDays : [6, 0, 1, 2, 3],
			},
			prefs: {
				showTasks: config.preferences?.showTasks ?? true,
				limitMonthEvents: config.preferences?.limitMonthEvents ?? true,
				showWeekends: config.preferences?.showWeekends ?? true,
				showWeekNumbers: config.preferences?.showWeekNumbers ?? false,
				slotDuration: config.preferences?.slotDuration ?? 30,
			},
			offDays: [],
			selectedDayKey: null,
			selectedEventId: null,
			midnightTimer: null,
		}
	},

	computed: {
		current() {
			const built = buildView(this.view, this.anchor, this.today, this.firstDay)
			if (this.prefs.showWeekends || this.view === 'year' || this.view === 'list') {
				return built
			}

			// Hiding the weekend drops a column from the grid; the CalDAV window
			// is deliberately left alone, so an event on a hidden day is simply
			// not drawn rather than silently refetched.
			return { ...built, days: built.days.filter((day) => !day.isWeekend) }
		},

		/** Tasks are opt-out, matching the Calendar app. */
		shownEvents() {
			return this.prefs.showTasks
				? this.visibleEvents
				: this.visibleEvents.filter((event) => !event.isTask)
		},

		viewOptions() {
			const labels = {
				day: t('jalali_calendar', 'Day'),
				week: t('jalali_calendar', 'Week'),
				month: t('jalali_calendar', 'Month'),
				year: t('jalali_calendar', 'Year'),
				list: t('jalali_calendar', 'List'),
			}
			return VIEWS.map((id) => ({ id, label: labels[id] }))
		},

		previousLabel() {
			return t('jalali_calendar', 'Previous')
		},

		nextLabel() {
			return t('jalali_calendar', 'Next')
		},

		/** Identifies the visible window; changes exactly once per navigation. */
		rangeKey() {
			return `${this.current.rangeStart.getTime()}-${this.current.rangeEnd.getTime()}`
		},

		/** Map of day key -> off-day record. */
		offDaysByDay() {
			const map = new Map()
			for (const offDay of this.offDays) {
				map.set(offDay.gdate, offDay)
			}
			return map
		},

		/**
		 * The Gregorian span on screen — useful for anyone cross-checking
		 * against the official Calendar app.
		 */
		gregorianLabel() {
			const days = this.current.days
			const format = (date) => date.toLocaleDateString('en-GB', {
				day: this.view === 'day' || this.view === 'week' ? 'numeric' : undefined,
				month: 'long',
				year: 'numeric',
			})
			const from = format(days[0].date)
			const to = format(days[days.length - 1].date)
			return from === to ? from : `${from} – ${to}`
		},

		eventsByDay() {
			return groupEventsByDay(this.shownEvents, this.current.days)
		},

		selectedDay() {
			if (this.selectedDayKey === null) {
				return null
			}
			return this.current.days.find((day) => day.key === this.selectedDayKey) ?? null
		},

		selectedDayEvents() {
			if (this.selectedDayKey === null) {
				return []
			}
			return this.eventsByDay.get(this.selectedDayKey) ?? []
		},

		isViewingToday() {
			return this.current.days.some((day) => day.isToday)
		},

		calendarErrorMessage() {
			return this.calendarError?.message
				?? t('jalali_calendar', 'Please check your connection and try again.')
		},

		failedCalendarNames() {
			return this.failedCalendars.map((failure) => failure.calendar.displayName).join('، ')
		},

		timezoneMismatch() {
			return Boolean(this.calendarTimezone)
				&& Boolean(this.browserTimezone)
				&& this.calendarTimezone !== this.browserTimezone
		},
	},

	watch: {
		/**
		 * Any change of view or anchor moves the visible window, so refetch.
		 * Watching one derived key rather than both ends of the range matters:
		 * two watchers would fire two fetches for every navigation.
		 */
		rangeKey() {
			this.reloadRange()
		},

		// The sidebar shows a day from the current view; leaving it closes it.
		'current.days'(days) {
			if (this.selectedDayKey !== null && !days.some((day) => day.key === this.selectedDayKey)) {
				this.closeSidebar()
			}
		},
	},

	async mounted() {
		await this.loadCalendars()
		await this.reloadRange()
		this.startMidnightWatch()
	},

	beforeUnmount() {
		if (this.midnightTimer) {
			clearInterval(this.midnightTimer)
		}
	},

	methods: {
		t,

		readStoredView() {
			try {
				const stored = window.localStorage.getItem(VIEW_STORAGE_KEY)
				return isView(stored) ? stored : 'month'
			} catch (error) {
				return 'month'
			}
		},

		setView(view) {
			if (!isView(view) || view === this.view) {
				return
			}
			this.view = view
			try {
				window.localStorage.setItem(VIEW_STORAGE_KEY, view)
			} catch (error) {
				// Remembering the choice is a convenience, not a requirement.
			}
		},

		shift(delta) {
			this.anchor = shiftAnchor(this.view, this.anchor, delta, this.firstDay)
		},

		goToToday() {
			this.anchor = dateToJalali(this.today)
			this.selectedDayKey = null
			this.selectedEventId = null
		},

		/** Clicking a day in the month, year or list view drills into it. */
		openDay(day) {
			this.anchor = { jy: day.jy, jm: day.jm, jd: day.jd }
			this.setView('day')
		},

		openMonth(jm) {
			this.anchor = clampDay({ ...this.anchor, jm, jd: 1 })
			this.setView('month')
		},

		onSelectDay(day) {
			this.selectedDayKey = day.key
			this.selectedEventId = null
		},

		onSelectEvent(day, event) {
			this.selectedDayKey = day.key
			this.selectedEventId = event.id
		},

		closeSidebar() {
			this.selectedDayKey = null
			this.selectedEventId = null
		},

		async reloadRange() {
			const { rangeStart, rangeEnd, days } = this.current
			await Promise.all([
				this.loadEvents(rangeStart, rangeEnd),
				this.loadOffDays(days),
			])
		},

		/**
		 * Official off-days are server-side data, independent of CalDAV, so a
		 * failure here must not disturb the events already on screen.
		 *
		 * @param {object[]} days the days on screen
		 */
		async loadOffDays(days) {
			try {
				this.offDays = await fetchOffDays(days[0].key, days[days.length - 1].key)
			} catch (error) {
				console.error('[jalali_calendar] could not load off-days', error)
				this.offDays = []
			}
		},

		async reload() {
			await this.loadCalendars()
			await this.reloadRange()
		},

		/**
		 * A calendar left open overnight would keep highlighting yesterday.
		 */
		startMidnightWatch() {
			this.midnightTimer = setInterval(() => {
				const now = new Date()
				if (dayKey(now) !== dayKey(this.today)) {
					this.today = now
				}
			}, 60 * 1000)
		},

		formatMonthYear,
	},
}
</script>

<style scoped lang="scss">
.calendar-view {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	// Nextcloud floats its app-navigation toggle over the start of the app
	// content, which otherwise lands on top of the first view button and
	// clipped "List" to "st". The padding is logical and set here rather than
	// on the toolbar because the toolbar hardcodes dir="rtl": logical
	// properties resolve against the element's own direction, so on the
	// toolbar this would reserve space on the wrong side whenever the
	// surrounding Nextcloud UI is left-to-right.
	padding-inline-start: var(--default-clickable-area, 44px);
}

.calendar-toolbar {
	display: grid;
	align-items: center;
	gap: 0 12px;
	grid-template-areas:
		'nav title views'
		'nav gregorian views';
	grid-template-columns: auto 1fr auto;
	padding: 8px 12px;

	&__nav {
		display: flex;
		align-items: center;
		gap: 4px;
		grid-area: nav;
	}

	&__title {
		display: flex;
		align-items: center;
		gap: 8px;
		grid-area: title;
		margin: 0;
		font-size: 20px;
		font-weight: bold;
	}

	&__gregorian {
		grid-area: gregorian;
		color: var(--color-text-maxcontrast);
		font-size: 13px;
		// The label is Latin text inside an RTL toolbar. Without an isolate the
		// bidi algorithm reorders a leading day number to the far end, so the
		// week range "25 July 2026 – 31 July 2026" renders as
		// "July 2026 – 31 July 2026 25". Only day and week views set a day
		// number, which is why the month view looked fine.
		direction: ltr;
		unicode-bidi: isolate;
		text-align: right;
	}

	&__views {
		display: flex;
		gap: 2px;
		grid-area: views;
		flex-wrap: wrap;
		justify-content: flex-end;
	}
}

.calendar-item {
	&__bullet {
		display: block;
		width: 14px;
		height: 14px;
		margin: auto;
		border-radius: 50%;
	}

	&--hidden {
		opacity: 0.5;

		.calendar-item__bullet {
			background-color: transparent !important;
			box-shadow: inset 0 0 0 2px var(--color-text-maxcontrast);
		}
	}
}

.navigation-hint {
	padding: 8px 12px;
	color: var(--color-text-maxcontrast);
	font-size: 12px;
}

.note-action {
	margin-top: 8px;
}

@media (max-width: 900px) {
	.calendar-toolbar {
		grid-template-areas:
			'nav title'
			'gregorian gregorian'
			'views views';
		grid-template-columns: auto 1fr;

		&__title {
			font-size: 17px;
		}

		&__views {
			justify-content: flex-start;
			margin-top: 4px;
		}
	}
}
</style>
