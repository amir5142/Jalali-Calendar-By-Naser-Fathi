<!--
  - SPDX-FileCopyrightText: 2026 Naser Fathi
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<div class="year-view" dir="rtl" lang="fa">
		<section v-for="month in months" :key="month.jm" class="mini">
			<h3 class="mini__title">
				<button type="button" @click="$emit('select-month', month.jm)">
					{{ monthName(month.jm) }}
				</button>
			</h3>

			<div class="mini__weekdays">
				<span v-for="(name, index) in shortWeekdays"
					:key="name + index"
					class="mini__weekday"
					:class="{ 'mini__weekday--weekend': index === weekendIndex }">
					{{ name }}
				</span>
			</div>

			<div class="mini__days">
				<button v-for="day in month.days"
					:key="day.key"
					class="mini__day"
					:class="{
						'mini__day--outside': !day.inCurrentMonth,
						'mini__day--today': day.isToday,
						'mini__day--weekend': day.isWeekend,
						'mini__day--off': isOffDay(day),
					}"
					type="button"
					:title="dayTitle(day)"
					@click="$emit('select-day', day)">
					<span class="mini__number">{{ persian(day.jd) }}</span>
					<span v-if="countFor(day) > 0" class="mini__dot" aria-hidden="true" />
				</button>
			</div>
		</section>
	</div>
</template>

<script>
import { t } from '@nextcloud/l10n'

import {
	JALALI_MONTHS,
	WEEKDAYS_SHORT,
	buildMonthGrid,
	formatFullDate,
	toPersianDigits,
	weekdayNames,
	weekendColumn,
} from '../utils/jalali.js'

export default {
	name: 'YearView',

	props: {
		jy: {
			type: Number,
			required: true,
		},
		firstDay: {
			type: Number,
			required: true,
		},
		today: {
			type: Date,
			required: true,
		},
		eventsByDay: {
			type: Map,
			default: () => new Map(),
		},
		offDaysByDay: {
			type: Map,
			default: () => new Map(),
		},
	},

	emits: ['select-day', 'select-month'],

	computed: {
		months() {
			return Array.from({ length: 12 }, (unused, index) => ({
				jm: index + 1,
				...buildMonthGrid(this.jy, index + 1, this.today, this.firstDay),
			}))
		},

		shortWeekdays() {
			return weekdayNames(this.firstDay, WEEKDAYS_SHORT)
		},

		weekendIndex() {
			return weekendColumn(this.firstDay)
		},
	},

	methods: {
		t,

		persian: toPersianDigits,

		monthName(jm) {
			return JALALI_MONTHS[jm - 1]
		},

		countFor(day) {
			return (this.eventsByDay.get(day.key) ?? []).length
		},

		offDayFor(day) {
			return this.offDaysByDay.get(day.key) ?? null
		},

		isOffDay(day) {
			return this.offDayFor(day)?.isOff === true
		},

		dayTitle(day) {
			const parts = [formatFullDate(day)]
			const offDay = this.offDayFor(day)
			if (offDay) {
				parts.push(offDay.title)
			}
			const count = this.countFor(day)
			if (count > 0) {
				parts.push(t('jalali_calendar', '{count} events', { count: toPersianDigits(count) }))
			}
			return parts.join(' — ')
		},
	},
}
</script>

<style scoped lang="scss">
.year-view {
	display: grid;
	gap: 16px;
	grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
	padding: 12px;
	overflow-y: auto;
}

.mini {
	&__title {
		margin: 0 0 4px;
		text-align: center;

		button {
			padding: 2px 8px;
			border: none;
			border-radius: var(--border-radius, 4px);
			background: none;
			color: var(--color-main-text);
			font-size: 15px;
			font-weight: bold;
			cursor: pointer;

			&:hover {
				background-color: var(--color-background-hover);
			}
		}
	}

	&__weekdays,
	&__days {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
	}

	&__weekday {
		padding-bottom: 2px;
		color: var(--color-text-maxcontrast);
		font-size: 10px;
		text-align: center;

		&--weekend {
			color: var(--color-error-text, var(--color-error));
		}
	}

	&__day {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1px;
		aspect-ratio: 1;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: none;
		color: var(--color-main-text);
		font-size: 11px;
		cursor: pointer;

		&:hover {
			background-color: var(--color-background-hover);
		}

		&--outside {
			color: var(--color-text-maxcontrast);
			opacity: 0.45;
		}

		&--weekend,
		&--off {
			color: var(--color-error-text, var(--color-error));
		}

		&--today {
			background-color: var(--color-primary-element);
			color: var(--color-primary-element-text);
			font-weight: bold;
		}
	}

	&__dot {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background-color: currentcolor;
	}
}
</style>
