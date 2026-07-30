<!--
  - SPDX-FileCopyrightText: 2026 Naser Fathi
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<div class="jalali-personal">
		<NcSettingsSection :name="t('jalali_calendar', 'Display')"
			:description="t('jalali_calendar', 'How the Jalali calendar looks for you. These settings are yours alone.')">
			<NcCheckboxRadioSwitch type="switch"
				:model-value="prefs.showTasks"
				:disabled="saving"
				@update:model-value="save('showTasks', $event)">
				{{ t('jalali_calendar', 'Show tasks in calendar') }}
			</NcCheckboxRadioSwitch>

			<NcCheckboxRadioSwitch type="switch"
				:model-value="prefs.limitMonthEvents"
				:disabled="saving"
				@update:model-value="save('limitMonthEvents', $event)">
				{{ t('jalali_calendar', 'Limit the number of events displayed in the monthly view') }}
			</NcCheckboxRadioSwitch>

			<NcCheckboxRadioSwitch type="switch"
				:model-value="prefs.showWeekends"
				:disabled="saving"
				@update:model-value="save('showWeekends', $event)">
				{{ t('jalali_calendar', 'Show weekends') }}
			</NcCheckboxRadioSwitch>

			<NcCheckboxRadioSwitch type="switch"
				:model-value="prefs.showWeekNumbers"
				:disabled="saving"
				@update:model-value="save('showWeekNumbers', $event)">
				{{ t('jalali_calendar', 'Show week numbers') }}
			</NcCheckboxRadioSwitch>

			<h4>{{ t('jalali_calendar', 'Time increments') }}</h4>
			<p class="hint">
				{{ t('jalali_calendar', 'How finely the day and week views are ruled.') }}
			</p>
			<fieldset class="row">
				<NcCheckboxRadioSwitch v-for="option in slotOptions"
					:key="option.value"
					type="radio"
					name="slot-duration"
					:value="String(option.value)"
					:model-value="String(prefs.slotDuration)"
					:disabled="saving"
					@update:model-value="save('slotDuration', Number($event))">
					{{ option.label }}
				</NcCheckboxRadioSwitch>
			</fieldset>

			<NcNoteCard v-if="error" type="error">
				{{ error }}
			</NcNoteCard>
		</NcSettingsSection>

		<NcSettingsSection :name="t('jalali_calendar', 'CalDAV')"
			:description="t('jalali_calendar', 'This app reads the same calendars as the Calendar app. Use these addresses to add them to a phone or desktop client.')">
			<div class="row row--wrap">
				<NcButton @click="copy(davUrl, 'primary')">
					<template #icon>
						<NcIconSvgWrapper :path="copied === 'primary' ? mdiCheck : mdiContentCopy" :size="20" />
					</template>
					{{ copied === 'primary'
						? t('jalali_calendar', 'Copied')
						: t('jalali_calendar', 'Copy primary CalDAV address') }}
				</NcButton>

				<NcButton @click="copy(davPrincipalUrl, 'ios')">
					<template #icon>
						<NcIconSvgWrapper :path="copied === 'ios' ? mdiCheck : mdiContentCopy" :size="20" />
					</template>
					{{ copied === 'ios'
						? t('jalali_calendar', 'Copied')
						: t('jalali_calendar', 'Copy iOS/macOS CalDAV address') }}
				</NcButton>
			</div>

			<p v-if="copyError" class="hint hint--error">
				{{ copyError }}
			</p>

			<p class="hint">
				<a v-if="availabilityUrl" :href="availabilityUrl">
					{{ t('jalali_calendar', 'Personal availability settings') }}
				</a>
			</p>
		</NcSettingsSection>
	</div>
</template>

<script>
import { mdiCheck, mdiContentCopy } from '@mdi/js'
import { loadState } from '@nextcloud/initial-state'
import { t } from '@nextcloud/l10n'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import NcSettingsSection from '@nextcloud/vue/components/NcSettingsSection'

import { errorMessage, savePreferences } from './utils/api.js'
import { toPersianDigits } from './utils/jalali.js'

export default {
	name: 'PersonalSettings',

	components: {
		NcButton,
		NcCheckboxRadioSwitch,
		NcIconSvgWrapper,
		NcNoteCard,
		NcSettingsSection,
	},

	setup() {
		return { mdiCheck, mdiContentCopy }
	},

	data() {
		const state = loadState('jalali_calendar', 'personal', {})

		return {
			prefs: {
				showTasks: state.showTasks ?? true,
				limitMonthEvents: state.limitMonthEvents ?? true,
				showWeekends: state.showWeekends ?? true,
				showWeekNumbers: state.showWeekNumbers ?? false,
				slotDuration: state.slotDuration ?? 30,
			},
			davUrl: state.davUrl ?? '',
			davPrincipalUrl: state.davPrincipalUrl ?? '',
			availabilityUrl: state.availabilityUrl ?? '',
			saving: false,
			error: '',
			copied: null,
			copyError: '',
		}
	},

	computed: {
		slotOptions() {
			return [15, 30, 60].map((value) => ({
				value,
				label: t('jalali_calendar', '{count} minutes', { count: toPersianDigits(value) }),
			}))
		},
	},

	methods: {
		t,

		async save(key, value) {
			const previous = this.prefs[key]
			this.prefs[key] = value
			this.saving = true
			this.error = ''

			try {
				const state = await savePreferences({ [key]: value })
				if (state) {
					this.prefs = { ...this.prefs, ...state }
				}
			} catch (error) {
				this.prefs[key] = previous
				this.error = errorMessage(error)
			} finally {
				this.saving = false
			}
		},

		async copy(value, which) {
			this.copyError = ''
			try {
				// The clipboard API needs a secure context; Nextcloud is served
				// over HTTPS, but say so plainly rather than fail silently.
				await navigator.clipboard.writeText(value)
				this.copied = which
				window.setTimeout(() => {
					this.copied = null
				}, 2000)
			} catch (error) {
				this.copyError = t('jalali_calendar', 'Could not copy. The address is: {url}', { url: value })
			}
		},
	},
}
</script>

<style scoped lang="scss">
.jalali-personal {
	h4 {
		margin: 16px 0 2px;
		font-weight: bold;
	}
}

.row {
	display: flex;
	align-items: center;
	gap: 8px;
	border: none;

	&--wrap {
		flex-wrap: wrap;
	}
}

.hint {
	margin-bottom: 6px;
	color: var(--color-text-maxcontrast);
	font-size: 13px;

	&--error {
		color: var(--color-error-text, var(--color-error));
	}
}
</style>
