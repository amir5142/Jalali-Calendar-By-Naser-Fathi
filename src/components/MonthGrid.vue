<!--
  - SPDX-FileCopyrightText: 2026 Naser Fathi
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<div class="month-grid" dir="rtl" lang="fa">
		<div class="month-grid__weekdays" role="row">
			<div v-for="(name, index) in weekdays"
				:key="name"
				class="month-grid__weekday"
				:class="{ 'month-grid__weekday--weekend': index === fridayIndex }"
				role="columnheader"
				:title="name">
				<abbr :title="name">{{ shortWeekdays[index] }}</abbr>
			</div>
		</div>

		<div class="month-grid__days" role="grid" :aria-label="monthLabel">
			<div v-for="day in grid.days"
				:key="day.key"
				class="day-cell"
				:class="{
					'day-cell--outside': !day.inCurrentMonth,
					'day-cell--today': day.isToday,
					'day-cell--weekend': day.isWeekend,
					'day-cell--selected': day.key === selectedDayKey,
				}"
				role="gridcell"
				tabindex="0"
				:aria-label="ariaLabel(day)"
				:aria-selected="day.key === selectedDayKey"
				@click="$emit('select-day', day)"
				@keydown.enter.prevent="$emit('select-day', day)"
				@keydown.space.prevent="$emit('select-day', day)">
				<div class="day-cell__header">
					<span class="day-cell__number">{{ dayNumber(day) }}</span>
					<span v-if="day.jd === 1" class="day-cell__month">{{ monthName(day) }}</span>
				</div>

				<div class="day-cell__events">
					<EventChip v-for="event in visibleEventsFor(day)"
						:key="event.id"
						:event="event"
						:selected="event.id === selectedEventId"
						@select="$emit('select-event', day, $event)" />

					<button v-if="overflowFor(day) > 0"
						class="day-cell__more"
						type="button"
						@click.stop="$emit('select-day', day)">
						{{ moreLabel(overflowFor(day)) }}
					</button>
				</div>

				<!-- Chips do not fit on a phone; dots keep the day scannable
				     and the day panel carries the detail. -->
				<div v-if="eventsFor(day).length" class="day-cell__dots" aria-hidden="true">
					<span v-for="event in dotsFor(day)"
						:key="event.id"
						class="day-cell__dot"
						:style="{ backgroundColor: event.color }" />
				</div>
			</div>
		</div>
	</div>
</template>

<script>
import { t } from '@nextcloud/l10n'

import EventChip from './EventChip.vue'
import {
	FRIDAY,
	JALALI_MONTHS,
	WEEKDAYS,
	WEEKDAYS_SHORT,
	formatFullDate,
	formatMonthYear,
	toPersianDigits,
} from '../utils/jalali.js'

/** Beyond this a cell gets unreadable, so the rest collapses into "+N more". */
const MAX_CHIPS_PER_DAY = 3

/** Narrow screens fall back to coloured dots instead of chips. */
const MAX_DOTS_PER_DAY = 4

export default {
	name: 'MonthGrid',

	components: {
		EventChip,
	},

	props: {
		grid: {
			type: Object,
			required: true,
		},
		/** Map of day key -> events, from groupEventsByDay(). */
		eventsByDay: {
			type: Map,
			required: true,
		},
		selectedDayKey: {
			type: String,
			default: null,
		},
		selectedEventId: {
			type: String,
			default: null,
		},
	},

	emits: ['select-day', 'select-event'],

	data() {
		return {
			weekdays: WEEKDAYS,
			shortWeekdays: WEEKDAYS_SHORT,
			fridayIndex: FRIDAY,
		}
	},

	computed: {
		monthLabel() {
			return formatMonthYear(this.grid.jy, this.grid.jm)
		},
	},

	methods: {
		t,

		eventsFor(day) {
			return this.eventsByDay.get(day.key) ?? []
		},

		visibleEventsFor(day) {
			return this.eventsFor(day).slice(0, MAX_CHIPS_PER_DAY)
		},

		overflowFor(day) {
			return Math.max(this.eventsFor(day).length - MAX_CHIPS_PER_DAY, 0)
		},

		dotsFor(day) {
			return this.eventsFor(day).slice(0, MAX_DOTS_PER_DAY)
		},

		moreLabel(count) {
			return t('jalali_calendar', '{count} more', { count: toPersianDigits(count) })
		},

		dayNumber(day) {
			return toPersianDigits(day.jd)
		},

		monthName(day) {
			return JALALI_MONTHS[day.jm - 1]
		},

		ariaLabel(day) {
			const count = this.eventsFor(day).length
			if (count === 0) {
				return formatFullDate(day)
			}
			return `${formatFullDate(day)} — ${t('jalali_calendar', '{count} events', { count: toPersianDigits(count) })}`
		},
	},
}
</script>

<style scoped lang="scss">
.month-grid {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;

	&__weekdays {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		border-bottom: 1px solid var(--color-border);
	}

	&__weekday {
		padding: 6px 4px;
		color: var(--color-text-maxcontrast);
		font-size: 13px;
		font-weight: bold;
		text-align: center;

		&--weekend {
			color: var(--color-error-text, var(--color-error));
		}

		abbr {
			text-decoration: none;
			cursor: default;
		}
	}

	&__days {
		display: grid;
		flex: 1 1 auto;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		grid-template-rows: repeat(6, minmax(84px, 1fr));
		min-height: 0;
	}
}

.day-cell {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
	padding: 4px;
	border-inline-start: 1px solid var(--color-border);
	border-bottom: 1px solid var(--color-border);
	overflow: hidden;
	cursor: pointer;

	&:nth-child(7n + 1) {
		border-inline-start: none;
	}

	&:hover {
		background-color: var(--color-background-hover);
	}

	&:focus-visible {
		outline: 2px solid var(--color-primary-element);
		outline-offset: -2px;
	}

	&--outside {
		background-color: var(--color-background-dark);

		.day-cell__number {
			color: var(--color-text-maxcontrast);
		}
	}

	&--weekend .day-cell__number {
		color: var(--color-error-text, var(--color-error));
	}

	&--selected {
		background-color: var(--color-background-dark);
		box-shadow: inset 0 0 0 2px var(--color-primary-element);
	}

	&__header {
		display: flex;
		align-items: baseline;
		gap: 4px;
		justify-content: space-between;
	}

	&__number {
		font-size: 14px;
		font-variant-numeric: tabular-nums;
	}

	&__month {
		color: var(--color-text-maxcontrast);
		font-size: 11px;
	}

	&--today &__number {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 24px;
		height: 24px;
		padding: 0 4px;
		border-radius: 12px;
		background-color: var(--color-primary-element);
		color: var(--color-primary-element-text);
		font-weight: bold;
	}

	&__events {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		gap: 2px;
		min-height: 0;
		overflow: hidden;
	}

	&__more {
		padding: 0 4px;
		border: none;
		background: none;
		color: var(--color-text-maxcontrast);
		font-size: 11px;
		text-align: start;
		cursor: pointer;

		&:hover {
			text-decoration: underline;
		}
	}

	&__dots {
		display: none;
		gap: 3px;
		justify-content: center;
		padding-bottom: 2px;
	}

	&__dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
	}
}

@media (max-width: 700px) {
	.month-grid__days {
		grid-template-rows: repeat(6, minmax(56px, 1fr));
	}

	.day-cell {
		justify-content: space-between;

		&__events {
			display: none;
		}

		&__dots {
			display: flex;
		}

		&__header {
			justify-content: center;
		}

		&__month {
			display: none;
		}
	}
}
</style>
