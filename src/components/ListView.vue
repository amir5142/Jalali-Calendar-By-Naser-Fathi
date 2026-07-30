<!--
  - SPDX-FileCopyrightText: 2026 Naser Fathi
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<div class="list-view" dir="rtl" lang="fa">
		<NcEmptyContent v-if="groups.length === 0"
			:name="t('jalali_calendar', 'Nothing scheduled')"
			:description="t('jalali_calendar', 'There are no events in this range.')" />

		<ol v-else class="list-view__days">
			<li v-for="group in groups" :key="group.day.key" class="list-view__day">
				<button class="list-view__date"
					:class="{
						'list-view__date--today': group.day.isToday,
						'list-view__date--off': isOffDay(group.day),
					}"
					type="button"
					@click="$emit('select-day', group.day)">
					<span class="list-view__date-number">{{ persian(group.day.jd) }}</span>
					<span class="list-view__date-rest">
						<span>{{ monthName(group.day) }}</span>
						<span class="list-view__weekday">{{ weekdayName(group.day) }}</span>
					</span>
					<span v-if="offDayFor(group.day)" class="list-view__offday">
						{{ offDayFor(group.day).title }}
					</span>
				</button>

				<ul class="list-view__events">
					<li v-for="event in group.events" :key="event.id">
						<button class="entry"
							:class="{
								'entry--selected': event.id === selectedEventId,
								'entry--completed': event.completed,
							}"
							:style="{ '--event-color': event.color }"
							type="button"
							@click="$emit('select-event', group.day, event)">
							<span class="entry__bar" aria-hidden="true" />
							<span class="entry__when">{{ when(event) }}</span>
							<span class="entry__title">{{ event.title }}</span>
							<span class="entry__calendar">{{ event.calendarName }}</span>
						</button>
					</li>
				</ul>
			</li>
		</ol>
	</div>
</template>

<script>
import { t } from '@nextcloud/l10n'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'

import {
	JALALI_MONTHS,
	formatTime,
	toPersianDigits,
	weekdayNameFor,
} from '../utils/jalali.js'

export default {
	name: 'ListView',

	components: { NcEmptyContent },

	props: {
		days: {
			type: Array,
			required: true,
		},
		eventsByDay: {
			type: Map,
			required: true,
		},
		offDaysByDay: {
			type: Map,
			default: () => new Map(),
		},
		selectedEventId: {
			type: String,
			default: null,
		},
	},

	emits: ['select-day', 'select-event'],

	computed: {
		/** Only days that actually have something on them. */
		groups() {
			return this.days
				.map((day) => ({ day, events: this.eventsByDay.get(day.key) ?? [] }))
				.filter((group) => group.events.length > 0)
		},
	},

	methods: {
		t,

		persian: toPersianDigits,

		monthName(day) {
			return JALALI_MONTHS[day.jm - 1]
		},

		weekdayName(day) {
			return weekdayNameFor(day.date)
		},

		offDayFor(day) {
			return this.offDaysByDay.get(day.key) ?? null
		},

		isOffDay(day) {
			return this.offDayFor(day)?.isOff === true
		},

		when(event) {
			if (event.isTask) {
				return event.allDay
					? t('jalali_calendar', 'Due today')
					: t('jalali_calendar', 'Due at {time}', { time: formatTime(event.start) })
			}
			if (event.allDay || event.multiDay) {
				return t('jalali_calendar', 'All day')
			}
			return `${formatTime(event.start)}–${formatTime(event.end)}`
		},
	},
}
</script>

<style scoped lang="scss">
.list-view {
	height: 100%;
	padding: 8px 12px;
	overflow-y: auto;

	&__days {
		list-style: none;
	}

	&__day {
		display: grid;
		gap: 8px;
		grid-template-columns: 120px 1fr;
		padding: 8px 0;
		border-bottom: 1px solid var(--color-border);

		@media (max-width: 640px) {
			grid-template-columns: 1fr;
		}
	}

	&__date {
		display: flex;
		align-items: baseline;
		gap: 6px;
		align-self: start;
		padding: 4px 6px;
		border: none;
		border-radius: var(--border-radius, 4px);
		background: none;
		color: var(--color-main-text);
		text-align: start;
		cursor: pointer;

		&:hover {
			background-color: var(--color-background-hover);
		}

		&--today &-number,
		&--off &-number {
			color: var(--color-primary-element);
		}
	}

	&__date-number {
		font-size: 20px;
		font-weight: bold;
	}

	&__date-rest {
		display: flex;
		flex-direction: column;
	}

	&__weekday,
	&__offday {
		color: var(--color-text-maxcontrast);
		font-size: 12px;
	}

	&__offday {
		color: var(--color-error-text, var(--color-error));
	}

	&__events {
		display: flex;
		flex-direction: column;
		gap: 2px;
		list-style: none;
	}
}

.entry {
	display: grid;
	align-items: center;
	gap: 8px;
	grid-template-columns: 4px 110px 1fr auto;
	width: 100%;
	padding: 4px 6px;
	border: none;
	border-radius: var(--border-radius, 4px);
	background: none;
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;

	&:hover {
		background-color: var(--color-background-hover);
	}

	&--selected {
		box-shadow: inset 0 0 0 2px var(--color-primary-element);
	}

	&--completed &__title {
		color: var(--color-text-maxcontrast);
		text-decoration: line-through;
	}

	&__bar {
		align-self: stretch;
		min-height: 18px;
		border-radius: 2px;
		background-color: var(--event-color);
	}

	&__when {
		color: var(--color-text-maxcontrast);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}

	&__title {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	&__calendar {
		color: var(--color-text-maxcontrast);
		font-size: 11px;
	}

	@media (max-width: 640px) {
		grid-template-columns: 4px 1fr;

		&__calendar {
			display: none;
		}
	}
}
</style>
