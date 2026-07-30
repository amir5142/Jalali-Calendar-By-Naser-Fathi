<!--
  - SPDX-FileCopyrightText: 2026 Naser Fathi
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<NcAppSidebar v-if="day"
		:open="true"
		:name="title"
		:subname="subtitle"
		@update:open="$emit('close')"
		@close="$emit('close')">
		<div class="day-panel" dir="rtl" lang="fa">
			<NcEmptyContent v-if="events.length === 0"
				:name="t('jalali_calendar', 'No events')"
				:description="t('jalali_calendar', 'Nothing is scheduled for this day.')">
				<template #icon>
					<NcIconSvgWrapper :path="mdiCalendarBlankOutline" />
				</template>
			</NcEmptyContent>

			<ul v-else class="day-panel__list">
				<li v-for="event in events" :key="event.id">
					<details class="event-details"
						:open="event.id === selectedEventId"
						:style="{ '--event-color': event.color }">
						<summary class="event-details__summary">
							<span class="event-details__bar" aria-hidden="true" />
							<span class="event-details__text">
								<span class="event-details__title">{{ event.title }}</span>
								<span class="event-details__when">{{ formatWhen(event) }}</span>
							</span>
						</summary>

						<dl class="event-details__body">
							<template v-if="event.location">
								<dt>
									<NcIconSvgWrapper :path="mdiMapMarkerOutline" :size="16" />
									{{ t('jalali_calendar', 'Location') }}
								</dt>
								<dd>{{ event.location }}</dd>
							</template>

							<dt>
								<NcIconSvgWrapper :path="mdiCalendarOutline" :size="16" />
								{{ t('jalali_calendar', 'Calendar') }}
							</dt>
							<dd>{{ event.calendarName }}</dd>

							<template v-if="event.recurring">
								<dt>
									<NcIconSvgWrapper :path="mdiRepeat" :size="16" />
									{{ t('jalali_calendar', 'Repeats') }}
								</dt>
								<dd>{{ t('jalali_calendar', 'This is one occurrence of a repeating event.') }}</dd>
							</template>

							<template v-if="event.description">
								<dt>
									<NcIconSvgWrapper :path="mdiTextBoxOutline" :size="16" />
									{{ t('jalali_calendar', 'Description') }}
								</dt>
								<dd class="event-details__description">{{ event.description }}</dd>
							</template>
						</dl>
					</details>
				</li>
			</ul>
		</div>
	</NcAppSidebar>
</template>

<script>
import {
	mdiCalendarBlankOutline,
	mdiCalendarOutline,
	mdiMapMarkerOutline,
	mdiRepeat,
	mdiTextBoxOutline,
} from '@mdi/js'
import { t } from '@nextcloud/l10n'
import NcAppSidebar from '@nextcloud/vue/components/NcAppSidebar'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'

import {
	JALALI_MONTHS,
	WEEKDAYS,
	formatTime,
	startOfDay,
	toPersianDigits,
} from '../utils/jalali.js'

export default {
	name: 'DaySidebar',

	components: {
		NcAppSidebar,
		NcEmptyContent,
		NcIconSvgWrapper,
	},

	props: {
		day: {
			type: Object,
			default: null,
		},
		events: {
			type: Array,
			default: () => [],
		},
		selectedEventId: {
			type: String,
			default: null,
		},
	},

	emits: ['close'],

	setup() {
		return {
			mdiCalendarBlankOutline,
			mdiCalendarOutline,
			mdiMapMarkerOutline,
			mdiRepeat,
			mdiTextBoxOutline,
		}
	},

	computed: {
		title() {
			if (!this.day) {
				return ''
			}
			return `${toPersianDigits(this.day.jd)} ${JALALI_MONTHS[this.day.jm - 1]} ${toPersianDigits(this.day.jy)}`
		},

		subtitle() {
			if (!this.day) {
				return ''
			}
			// The Gregorian date is worth showing: it is what every other
			// CalDAV client will display for the same day.
			const gregorian = this.day.date.toLocaleDateString('en-GB', {
				weekday: 'long',
				day: 'numeric',
				month: 'long',
				year: 'numeric',
			})
			return `${WEEKDAYS[this.day.weekday]} · ${gregorian}`
		},
	},

	methods: {
		t,

		/**
		 * Describe when an event happens *relative to the day being viewed*, so
		 * a multi-day event reads "all day" on its middle days rather than
		 * repeating its original start time.
		 *
		 * @param {object} event the event to describe
		 * @return {string}
		 */
		formatWhen(event) {
			if (event.allDay && !event.multiDay) {
				return t('jalali_calendar', 'All day')
			}

			const dayStart = startOfDay(this.day.date)
			const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1)
			const startsToday = event.start >= dayStart
			const endsToday = event.end <= dayEnd

			if (event.allDay || (!startsToday && !endsToday)) {
				return t('jalali_calendar', 'All day')
			}
			if (startsToday && endsToday) {
				return `${formatTime(event.start)} – ${formatTime(event.end)}`
			}
			if (startsToday) {
				return t('jalali_calendar', 'From {time}', { time: formatTime(event.start) })
			}
			return t('jalali_calendar', 'Until {time}', { time: formatTime(event.end) })
		},
	},
}
</script>

<style scoped lang="scss">
.day-panel {
	padding: 0 12px 12px;

	&__list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		list-style: none;
	}
}

.event-details {
	border-radius: var(--border-radius-large, 8px);

	&__summary {
		display: flex;
		align-items: stretch;
		gap: 8px;
		padding: 6px 8px;
		border-radius: var(--border-radius-large, 8px);
		cursor: pointer;

		&:hover {
			background-color: var(--color-background-hover);
		}

		&::marker {
			content: '';
		}
	}

	&__bar {
		flex: 0 0 auto;
		width: 4px;
		border-radius: 2px;
		background-color: var(--event-color);
	}

	&__text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	&__title {
		overflow: hidden;
		font-weight: bold;
		text-overflow: ellipsis;
	}

	&__when {
		color: var(--color-text-maxcontrast);
		font-size: 13px;
	}

	&__body {
		display: grid;
		gap: 2px 8px;
		grid-template-columns: auto 1fr;
		padding: 4px 20px 10px;

		dt {
			display: flex;
			align-items: center;
			gap: 4px;
			color: var(--color-text-maxcontrast);
			white-space: nowrap;
		}

		dd {
			min-width: 0;
			overflow-wrap: anywhere;
		}
	}

	&__description {
		white-space: pre-wrap;
	}
}
</style>
