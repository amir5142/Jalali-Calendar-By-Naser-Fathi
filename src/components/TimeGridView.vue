<!--
  - SPDX-FileCopyrightText: 2026 Naser Fathi
  - SPDX-License-Identifier: AGPL-3.0-or-later
  -
  - The day and week views are the same grid with a different number of
  - columns, so they share this component.
-->
<template>
	<div class="time-grid" dir="rtl" lang="fa">
		<div class="time-grid__head">
			<div class="time-grid__gutter-head" />
			<div v-for="day in days"
				:key="day.key"
				class="time-grid__day-head"
				:class="{
					'time-grid__day-head--today': day.isToday,
					'time-grid__day-head--off': isOffDay(day),
					'time-grid__day-head--weekend': day.isWeekend,
				}"
				role="button"
				tabindex="0"
				@click="$emit('select-day', day)"
				@keydown.enter.prevent="$emit('select-day', day)">
				<span class="time-grid__day-name">{{ weekdayName(day) }}</span>
				<span class="time-grid__day-number">{{ persian(day.jd) }}</span>
				<span class="time-grid__day-month">{{ monthName(day) }}</span>
				<span v-if="offDayFor(day)" class="time-grid__day-offday">{{ offDayFor(day).title }}</span>
			</div>
		</div>

		<!-- All-day and multi-day events cannot be positioned against an hour. -->
		<div v-if="hasAllDay" class="time-grid__allday">
			<div class="time-grid__gutter-head time-grid__allday-label">
				{{ t('jalali_calendar', 'All day') }}
			</div>
			<div v-for="day in days" :key="day.key" class="time-grid__allday-cell">
				<EventChip v-for="event in allDayFor(day)"
					:key="event.id"
					:event="event"
					:selected="event.id === selectedEventId"
					@select="$emit('select-event', day, $event)" />
			</div>
		</div>

		<div ref="scroller" class="time-grid__body">
			<div class="time-grid__gutter">
				<div v-for="hour in 24" :key="hour" class="time-grid__hour-label">
					<span>{{ hourLabel(hour - 1) }}</span>
				</div>
			</div>

			<div v-for="day in days" :key="day.key" class="time-grid__column">
				<div v-for="row in rowsFor(day)"
					:key="row.hour"
					class="time-grid__hour"
					:class="{ 'time-grid__hour--off-hours': !row.isWorking }">
					<div v-for="slot in slotsPerHour - 1"
						:key="slot"
						class="time-grid__slot"
						:style="{ top: `${(slot / slotsPerHour) * 100}%` }" />
				</div>

				<div v-if="day.isToday" class="time-grid__now" :style="nowStyle" aria-hidden="true" />

                <button v-for="event in timedFor(day)"
					:key="event.id"
					class="time-grid__event"
					:class="{ 'time-grid__event--selected': event.id === selectedEventId }"
					:style="eventStyle(event)"
					type="button"
					@click.stop="$emit('select-event', day, event)">
					<span class="time-grid__event-time">{{ timeRange(event) }}</span>
					<span class="time-grid__event-title">{{ event.title }}</span>
				</button>
			</div>
		</div>
	</div>
</template>

<script>
import { t } from '@nextcloud/l10n'

import EventChip from './EventChip.vue'
import {
	JALALI_MONTHS,
	formatTime,
	toPersianDigits,
	weekdayNameFor,
} from '../utils/jalali.js'
import {
	MINUTES_PER_DAY,
	formatHourLabel,
	hourRows,
	layoutDay,
	minutesInto,
	splitByKind,
} from '../utils/timeline.js'

/** Pixels per hour; 24 of these is the scrollable height. */
const HOUR_HEIGHT = 48

export default {
	name: 'TimeGridView',

	components: { EventChip },

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
		/** {start, end, days} — minutes from midnight and getDay() values. */
		working: {
			type: Object,
			required: true,
		},
		/** Minutes per ruled row: 15, 30 or 60. */
		slotDuration: {
			type: Number,
			default: 30,
		},
		now: {
			type: Date,
			required: true,
		},
		selectedEventId: {
			type: String,
			default: null,
		},
	},

	emits: ['select-day', 'select-event'],

	computed: {
		hasAllDay() {
			return this.days.some((day) => this.allDayFor(day).length > 0)
		},

		/** Sub-hour gridlines, drawn lighter than the hour lines. */
		slotsPerHour() {
			return Math.max(Math.round(60 / this.slotDuration), 1)
		},

		nowStyle() {
			const minutes = minutesInto(this.now, this.now)
			return { top: `${(minutes / MINUTES_PER_DAY) * 100}%` }
		},
	},

	mounted() {
		this.scrollToWorkingHours()
	},

	methods: {
		t,

		persian: toPersianDigits,

		weekdayName(day) {
			return weekdayNameFor(day.date)
		},

		monthName(day) {
			return JALALI_MONTHS[day.jm - 1]
		},

		hourLabel(hour) {
			return formatHourLabel(hour * 60)
		},

		eventsFor(day) {
			return this.eventsByDay.get(day.key) ?? []
		},

		allDayFor(day) {
			return splitByKind(this.eventsFor(day)).allDay
		},

		timedFor(day) {
			return layoutDay(splitByKind(this.eventsFor(day)).timed, day.date)
		},

		rowsFor(day) {
			return hourRows(day.date, this.working)
		},

		offDayFor(day) {
			return this.offDaysByDay.get(day.key) ?? null
		},

		isOffDay(day) {
			return this.offDayFor(day)?.isOff === true
		},

		/**
		 * Absolute box for one timed event: vertical position from the clock,
		 * horizontal share from how many events it overlaps.
		 *
		 * @param {object} event an event decorated by layoutDay()
		 * @return {object} inline styles
		 */
		eventStyle(event) {
			const { startMinute, endMinute, lane, lanes } = event.layout
			const width = 100 / lanes

			return {
				top: `${(startMinute / MINUTES_PER_DAY) * 100}%`,
				height: `${((endMinute - startMinute) / MINUTES_PER_DAY) * 100}%`,
				insetInlineStart: `${lane * width}%`,
				width: `${width}%`,
				'--event-color': event.color,
			}
		},

		timeRange(event) {
			return `${formatTime(event.start)}–${formatTime(event.end)}`
		},

		/** Open on the working day rather than at midnight. */
		scrollToWorkingHours() {
			const scroller = this.$refs.scroller
			if (!scroller) {
				return
			}
			scroller.scrollTop = Math.max((this.working.start / 60) * HOUR_HEIGHT - HOUR_HEIGHT, 0)
		},
	},
}
</script>

<style scoped lang="scss">
$hour-height: 48px;

.time-grid {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;

	&__head,
	&__allday {
		display: grid;
		grid-template-columns: var(--gutter, 56px) repeat(var(--columns, 7), minmax(0, 1fr));
		border-bottom: 1px solid var(--color-border);
	}

	&__day-head {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		padding: 6px 2px;
		border-inline-start: 1px solid var(--color-border);
		cursor: pointer;

		&:hover {
			background-color: var(--color-background-hover);
		}

		&--weekend .time-grid__day-number,
		&--off .time-grid__day-number {
			color: var(--color-error-text, var(--color-error));
		}

		&--today .time-grid__day-number {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-width: 26px;
			height: 26px;
			border-radius: 13px;
			background-color: var(--color-primary-element);
			color: var(--color-primary-element-text);
		}
	}

	&__day-name {
		color: var(--color-text-maxcontrast);
		font-size: 12px;
	}

	&__day-number {
		font-size: 17px;
		font-weight: bold;
	}

	&__day-month,
	&__day-offday {
		overflow: hidden;
		max-width: 100%;
		font-size: 11px;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	&__day-month {
		color: var(--color-text-maxcontrast);
	}

	&__day-offday {
		color: var(--color-error-text, var(--color-error));
	}

	&__allday-cell {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		max-height: 84px;
		padding: 2px;
		border-inline-start: 1px solid var(--color-border);
		overflow-y: auto;
	}

	&__gutter-head {
		border-inline-start: none;
	}

	&__allday-label {
		align-self: center;
		padding-inline-end: 6px;
		color: var(--color-text-maxcontrast);
		font-size: 11px;
		text-align: end;
	}

	&__body {
		display: grid;
		flex: 1 1 auto;
		grid-template-columns: var(--gutter, 56px) repeat(var(--columns, 7), minmax(0, 1fr));
		min-height: 0;
		overflow-y: auto;
		// Reserve the scrollbar's width instead of letting it overlay the
		// grid. The track sits on the leading edge under dir="rtl", so an
		// overlay scrollbar lands on top of the last day column and reads as
		// a stray bar floating in the empty non-working hours beside it.
		scrollbar-gutter: stable;
	}

	&__gutter {
		position: relative;
	}

	&__hour-label {
		height: $hour-height;
		padding-inline-end: 6px;
		color: var(--color-text-maxcontrast);
		font-size: 11px;
		text-align: end;
		// Sit the label on the gridline rather than inside the slot.
		transform: translateY(-6px);
	}

	&__column {
		position: relative;
		border-inline-start: 1px solid var(--color-border);
	}

	&__hour {
		position: relative;
		height: $hour-height;
		border-bottom: 1px solid var(--color-border);

		&--off-hours {
			background-color: var(--color-background-dark);
		}
	}

	&__slot {
		position: absolute;
		inset-inline: 0;
		border-bottom: 1px dotted var(--color-border);
		opacity: 0.6;
	}

	&__now {
		position: absolute;
		z-index: 2;
		inset-inline: 0;
		height: 2px;
		background-color: var(--color-error, #e9322d);
		pointer-events: none;
	}

	&__event {
		position: absolute;
		z-index: 1;
		display: flex;
		flex-direction: column;
		gap: 1px;
		overflow: hidden;
		padding: 2px 4px;
		border: none;
		border-inline-start: 3px solid var(--event-color);
		border-radius: var(--border-radius, 4px);
		background-color: color-mix(in srgb, var(--event-color) 25%, var(--color-main-background));
		color: var(--color-main-text);
		font-size: 11px;
		line-height: 14px;
		text-align: start;
		cursor: pointer;

		&:hover {
			filter: brightness(1.15);
		}

		&--selected {
			outline: 2px solid var(--color-primary-element);
			outline-offset: -2px;
		}
	}

	&__event-time {
		color: var(--color-text-maxcontrast);
		font-variant-numeric: tabular-nums;
	}

	&__event-title {
		overflow: hidden;
		font-weight: bold;
		text-overflow: ellipsis;
	}
}

@media (max-width: 700px) {
	.time-grid__head,
	.time-grid__allday,
	.time-grid__body {
		--gutter: 40px;
	}

	.time-grid__day-month {
		display: none;
	}
}
</style>
