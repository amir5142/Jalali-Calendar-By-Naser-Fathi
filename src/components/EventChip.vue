<!--
  - SPDX-FileCopyrightText: 2026 Naser Fathi
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<button class="event-chip"
		:class="{
			'event-chip--bar': isBar,
			'event-chip--selected': selected,
		}"
		:style="{ '--event-color': event.color }"
		:title="tooltip"
		type="button"
		@click.stop="$emit('select', event)">
		<span v-if="!isBar" class="event-chip__dot" aria-hidden="true" />
		<span v-if="!isBar" class="event-chip__time">{{ time }}</span>
		<span class="event-chip__title">{{ event.title }}</span>
	</button>
</template>

<script>
import { formatTime } from '../utils/jalali.js'

export default {
	name: 'EventChip',

	props: {
		event: {
			type: Object,
			required: true,
		},
		selected: {
			type: Boolean,
			default: false,
		},
	},

	emits: ['select'],

	computed: {
		/** All-day and multi-day events read better as a solid bar. */
		isBar() {
			return this.event.allDay || this.event.multiDay
		},

		time() {
			return formatTime(this.event.start)
		},

		tooltip() {
			return this.isBar
				? `${this.event.title} — ${this.event.calendarName}`
				: `${this.time} ${this.event.title} — ${this.event.calendarName}`
		},
	},
}
</script>

<style scoped lang="scss">
.event-chip {
	display: flex;
	align-items: center;
	gap: 4px;
	width: 100%;
	min-height: 20px;
	padding: 1px 4px;
	border: none;
	border-radius: var(--border-radius, 4px);
	background-color: transparent;
	color: var(--color-main-text);
	font-size: 12px;
	line-height: 18px;
	text-align: start;
	cursor: pointer;

	&:hover,
	&:focus-visible {
		background-color: var(--color-background-hover);
	}

	&:focus-visible {
		outline: 2px solid var(--color-primary-element);
		outline-offset: -2px;
	}

	&--bar {
		background-color: var(--event-color);
		color: #fff;

		&:hover,
		&:focus-visible {
			filter: brightness(1.1);
		}
	}

	&--selected {
		box-shadow: inset 0 0 0 2px var(--color-primary-element);
	}

	&__dot {
		flex: 0 0 auto;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background-color: var(--event-color);
	}

	&__time {
		flex: 0 0 auto;
		color: var(--color-text-maxcontrast);
		font-variant-numeric: tabular-nums;
	}

	&--bar &__time {
		color: inherit;
	}

	&__title {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
}
</style>
