<!--
  - SPDX-FileCopyrightText: 2026 Naser Fathi
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<button class="event-chip"
		:class="{
			'event-chip--bar': isBar,
			'event-chip--selected': selected,
			'event-chip--task': event.isTask,
			'event-chip--completed': event.completed,
		}"
		:style="{ '--event-color': event.color }"
		:title="tooltip"
		type="button"
		@click.stop="$emit('select', event)">
		<NcIconSvgWrapper v-if="event.isTask"
			class="event-chip__icon"
			:path="event.completed ? mdiCheckCircleOutline : mdiCircleOutline"
			:size="12" />
		<span v-else-if="!isBar" class="event-chip__dot" aria-hidden="true" />
		<span v-if="showTime" class="event-chip__time">{{ time }}</span>
		<span class="event-chip__title">{{ event.title }}</span>
	</button>
</template>

<script>
import { mdiCheckCircleOutline, mdiCircleOutline } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'

import { formatTime } from '../utils/jalali.js'

export default {
	name: 'EventChip',

	components: {
		NcIconSvgWrapper,
	},

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

	setup() {
		return { mdiCheckCircleOutline, mdiCircleOutline }
	},

	computed: {
		/**
		 * All-day and multi-day events read better as a solid bar. Tasks never
		 * do — they mark a single due moment, and a full-width bar would read
		 * as "all day long".
		 */
		isBar() {
			return !this.event.isTask && (this.event.allDay || this.event.multiDay)
		},

		/** An all-day task has no meaningful clock time to show. */
		showTime() {
			return !this.isBar && !this.event.allDay
		},

		time() {
			return formatTime(this.event.start)
		},

		tooltip() {
			const parts = []
			if (this.event.isTask) {
				parts.push(this.event.completed
					? t('jalali_calendar', 'Task (completed)')
					: t('jalali_calendar', 'Task'))
			}
			if (!this.isBar && !this.event.allDay) {
				parts.push(this.time)
			}
			parts.push(this.event.title, '—', this.event.calendarName)
			return parts.join(' ')
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

	&__icon {
		flex: 0 0 auto;
		color: var(--event-color);
	}

	&--completed {
		color: var(--color-text-maxcontrast);

		.event-chip__title {
			text-decoration: line-through;
		}
	}
}
</style>
