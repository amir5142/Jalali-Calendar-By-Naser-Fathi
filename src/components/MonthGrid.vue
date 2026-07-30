<!--
  - SPDX-FileCopyrightText: 2026 Naser Fathi
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<div class="month-grid" dir="rtl" lang="fa" :style="gridStyle">
		<div class="month-grid__weekdays" role="row">
			<div v-if="showWeekNumbers" class="month-grid__weeknum-head" />
			<div v-for="(name, index) in visibleWeekdays"
				:key="name"
				class="month-grid__weekday"
				:class="{ 'month-grid__weekday--weekend': columns === 7 && index === weekendIndex }"
				role="columnheader"
				:title="name">
				<!-- Full name normally; the single letter only where a column is
				     too narrow for it. The full name stays in the accessibility
				     tree either way. -->
				<span class="month-grid__weekday-full">{{ name }}</span>
				<span class="month-grid__weekday-short" aria-hidden="true">{{ visibleShortWeekdays[index] }}</span>
			</div>
		</div>

		<div class="month-grid__days" role="grid" :aria-label="monthLabel">
			<template v-for="(day, index) in grid.days" :key="day.key">
				<!-- Emitted inline so each row reads: week number, then its days. -->
				<div v-if="showWeekNumbers && index % columns === 0"
					class="month-grid__weeknum"
					:title="t('jalali_calendar', 'Week of the year')">
					{{ weekNumber(index) }}
				</div>

				<div class="day-cell"
					:class="{
						'day-cell--outside': !day.inCurrentMonth,
						'day-cell--today': day.isToday,
						'day-cell--weekend': day.isWeekend,
						'day-cell--off': isOffDay(day),
						'day-cell--selected': day.key === selectedDayKey,
						'day-cell--row-start': index % columns === 0,
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

					<!-- Official off-day label, e.g. «عید فطر». -->
					<span v-if="offDayFor(day)" class="day-cell__offday" :title="offDayFor(day).title">
						{{ offDayFor(day).title }}
					</span>

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
			</template>
		</div>
	</div>
</template>

<script>
import { t } from '@nextcloud/l10n'

import EventChip from './EventChip.vue'
import {
	JALALI_MONTHS,
	WEEKDAYS_SHORT,
	WEEKS_IN_GRID,
	formatFullDate,
	formatMonthYear,
	jalaliWeekNumber,
	toPersianDigits,
	weekdayNames,
	weekendColumn,
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
		/** Map of day key -> official off-day record. */
		offDaysByDay: {
			type: Map,
			default: () => new Map(),
		},
		limitEvents: {
			type: Boolean,
			default: true,
		},
		showWeekNumbers: {
			type: Boolean,
			default: false,
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

	computed: {
		monthLabel() {
			return formatMonthYear(this.grid.jy, this.grid.jm)
		},

		/** Header labels rotate with the configured start of the week. */
		weekdays() {
			return weekdayNames(this.grid.firstDay)
		},

		shortWeekdays() {
			return weekdayNames(this.grid.firstDay, WEEKDAYS_SHORT)
		},

		visibleShortWeekdays() {
			if (this.columns === this.shortWeekdays.length) {
				return this.shortWeekdays
			}
			return this.shortWeekdays.filter((unused, index) => index !== this.weekendIndex)
		},

		/** Drops the weekend label when its column is not drawn. */
		visibleWeekdays() {
			if (this.columns === this.weekdays.length) {
				return this.weekdays
			}
			return this.weekdays.filter((unused, index) => index !== this.weekendIndex)
		},

		weekendIndex() {
			return weekendColumn(this.grid.firstDay)
		},

		/** Six rows always; the column count drops to 6 when weekends are hidden. */
		columns() {
			return Math.max(Math.round(this.grid.days.length / WEEKS_IN_GRID), 1)
		},

		gridStyle() {
			return {
				'--columns': this.columns,
				'--weeknum': this.showWeekNumbers ? '34px' : '0px',
			}
		},
	},

	methods: {
		t,

		eventsFor(day) {
			return this.eventsByDay.get(day.key) ?? []
		},

		visibleEventsFor(day) {
			return this.limitEvents ? this.eventsFor(day).slice(0, MAX_CHIPS_PER_DAY) : this.eventsFor(day)
		},

		overflowFor(day) {
			return this.limitEvents
				? Math.max(this.eventsFor(day).length - MAX_CHIPS_PER_DAY, 0)
				: 0
		},

		weekNumber(index) {
			return toPersianDigits(jalaliWeekNumber(this.grid.days[index].date, this.grid.firstDay))
		},

		dotsFor(day) {
			return this.eventsFor(day).slice(0, MAX_DOTS_PER_DAY)
		},

		offDayFor(day) {
			return this.offDaysByDay.get(day.key) ?? null
		},

		/** Only days flagged as an actual day off get the weekend colour. */
		isOffDay(day) {
			return this.offDayFor(day)?.isOff === true
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
			const parts = [formatFullDate(day)]
			const offDay = this.offDayFor(day)
			if (offDay) {
				parts.push(offDay.title)
			}
			const count = this.eventsFor(day).length
			if (count > 0) {
				parts.push(t('jalali_calendar', '{count} events', { count: toPersianDigits(count) }))
			}
			return parts.join(' — ')
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
		grid-template-columns: var(--weeknum, 0px) repeat(var(--columns, 7), minmax(0, 1fr));
		border-bottom: 1px solid var(--color-border);
	}

	&__weeknum-head,
	&__weeknum {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text-maxcontrast);
		font-size: 11px;
	}

	&__weeknum {
		border-bottom: 1px solid var(--color-border);
	}

	&__weekday {
		overflow: hidden;
		padding: 6px 4px;
		color: var(--color-text-maxcontrast);
		font-size: 13px;
		font-weight: bold;
		white-space: nowrap;
		text-align: center;
		text-overflow: ellipsis;

		&--weekend {
			color: var(--color-error-text, var(--color-error));
		}
	}

	&__weekday-short {
		display: none;
	}

	&__days {
		display: grid;
		flex: 1 1 auto;
		grid-template-columns: var(--weeknum, 0px) repeat(var(--columns, 7), minmax(0, 1fr));
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

	&--off .day-cell__number {
		color: var(--color-error-text, var(--color-error));
		font-weight: bold;
	}

	&--selected {
		background-color: var(--color-background-dark);
		box-shadow: inset 0 0 0 2px var(--color-primary-element);
	}

	&__offday {
		overflow: hidden;
		color: var(--color-error-text, var(--color-error));
		font-size: 11px;
		line-height: 14px;
		white-space: nowrap;
		text-overflow: ellipsis;
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

// «چهارشنبه» needs roughly 90px of column; below that fall back to the letter.
@media (max-width: 640px) {
	.month-grid__weekday-short {
		display: inline;
	}

	// Hidden from view, still read out by assistive technology.
	.month-grid__weekday-full {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		border: 0;
		overflow: hidden;
		white-space: nowrap;
		clip-path: inset(50%);
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
