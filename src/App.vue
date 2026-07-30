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
						<NcButton :aria-label="t('jalali_calendar', 'Previous month')"
							variant="tertiary"
							@click="shiftMonth(-1)">
							<template #icon>
								<NcIconSvgWrapper :path="mdiChevronRight" />
							</template>
						</NcButton>

						<NcButton :aria-label="t('jalali_calendar', 'Next month')"
							variant="tertiary"
							@click="shiftMonth(1)">
							<template #icon>
								<NcIconSvgWrapper :path="mdiChevronLeft" />
							</template>
						</NcButton>

						<NcButton :disabled="isViewingToday" @click="goToToday">
							{{ t('jalali_calendar', 'Today') }}
						</NcButton>
					</div>

					<h2 class="calendar-toolbar__title">
						{{ monthLabel }}
						<NcLoadingIcon v-if="loadingEvents" :size="20" />
					</h2>

					<p class="calendar-toolbar__gregorian">
						{{ gregorianLabel }}
					</p>
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

				<MonthGrid :grid="grid"
					:events-by-day="eventsByDay"
					:selected-day-key="selectedDay ? selectedDay.key : null"
					:selected-event-id="selectedEventId"
					@select-day="onSelectDay"
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
import MonthGrid from './components/MonthGrid.vue'
import { useCalendarStore } from './store/calendarStore.js'
import { groupEventsByDay } from './utils/events.js'
import {
	addMonths,
	buildMonthGrid,
	dateToJalali,
	dayKey,
	formatMonthYear,
} from './utils/jalali.js'

export default {
	name: 'App',

	components: {
		DaySidebar,
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
		const initial = config.initialMonth ?? dateToJalali(today)

		return {
			jy: initial.jy,
			jm: initial.jm,
			today,
			calendarTimezone: config.timezone ?? null,
			browserTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
			selectedDayKey: null,
			selectedEventId: null,
			midnightTimer: null,
		}
	},

	computed: {
		grid() {
			return buildMonthGrid(this.jy, this.jm, this.today)
		},

		monthLabel() {
			return formatMonthYear(this.jy, this.jm)
		},

		/**
		 * The Gregorian months the Jalali month straddles — useful for anyone
		 * cross-checking against the official Calendar app.
		 */
		gregorianLabel() {
			const format = (date) => date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
			const first = this.grid.days.find((day) => day.inCurrentMonth)
			const last = [...this.grid.days].reverse().find((day) => day.inCurrentMonth)
			const from = format(first.date)
			const to = format(last.date)
			return from === to ? from : `${from} – ${to}`
		},

		eventsByDay() {
			return groupEventsByDay(this.visibleEvents, this.grid.days)
		},

		selectedDay() {
			if (this.selectedDayKey === null) {
				return null
			}
			return this.grid.days.find((day) => day.key === this.selectedDayKey) ?? null
		},

		selectedDayEvents() {
			if (this.selectedDayKey === null) {
				return []
			}
			return this.eventsByDay.get(this.selectedDayKey) ?? []
		},

		isViewingToday() {
			const { jy, jm } = dateToJalali(this.today)
			return this.jy === jy && this.jm === jm
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
		 * The visible Gregorian window changes with the month, so refetch. The
		 * store discards responses that arrive out of order.
		 */
		grid: {
			handler(grid) {
				this.loadEvents(grid.rangeStart, grid.rangeEnd)
			},
		},

		// The sidebar shows a day from the current grid; leaving the month closes it.
		'grid.jm'() {
			this.closeSidebar()
		},
	},

	async mounted() {
		await this.loadCalendars()
		await this.loadEvents(this.grid.rangeStart, this.grid.rangeEnd)
		this.startMidnightWatch()
	},

	beforeUnmount() {
		if (this.midnightTimer) {
			clearInterval(this.midnightTimer)
		}
	},

	methods: {
		t,

		shiftMonth(delta) {
			const { jy, jm } = addMonths(this.jy, this.jm, delta)
			this.jy = jy
			this.jm = jm
		},

		goToToday() {
			const { jy, jm } = dateToJalali(this.today)
			this.jy = jy
			this.jm = jm
			this.selectedDayKey = dayKey(this.today)
			this.selectedEventId = null
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

		async reload() {
			await this.loadCalendars()
			await this.loadEvents(this.grid.rangeStart, this.grid.rangeEnd)
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
	},
}
</script>

<style scoped lang="scss">
.calendar-view {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
}

.calendar-toolbar {
	display: grid;
	align-items: center;
	gap: 0 12px;
	grid-template-areas:
		'nav title'
		'nav gregorian';
	grid-template-columns: auto 1fr;
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

@media (max-width: 700px) {
	.calendar-toolbar {
		grid-template-areas:
			'title nav'
			'gregorian gregorian';

		&__title {
			font-size: 17px;
		}
	}
}
</style>
