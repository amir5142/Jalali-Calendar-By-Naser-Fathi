<!--
  - SPDX-FileCopyrightText: 2026 Naser Fathi
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<div class="jalali-admin">
		<NcSettingsSection :name="t('jalali_calendar', 'Week')"
			:description="t('jalali_calendar', 'Which day the calendar grid starts on, for everyone on this server.')">
			<fieldset>
				<NcCheckboxRadioSwitch type="radio"
					name="first-day"
					value="saturday"
					:model-value="firstDayOfWeek"
					:disabled="savingConfig"
					@update:model-value="setFirstDay">
					{{ t('jalali_calendar', 'Saturday (شنبه)') }}
				</NcCheckboxRadioSwitch>
				<NcCheckboxRadioSwitch type="radio"
					name="first-day"
					value="sunday"
					:model-value="firstDayOfWeek"
					:disabled="savingConfig"
					@update:model-value="setFirstDay">
					{{ t('jalali_calendar', 'Sunday (یک‌شنبه)') }}
				</NcCheckboxRadioSwitch>
			</fieldset>
		</NcSettingsSection>

		<NcSettingsSection :name="t('jalali_calendar', 'Working hours')"
			:description="t('jalali_calendar', 'Hours outside these are shaded in the day and week views, so the working day stands out.')">
			<div class="row">
				<NcTextField class="row__time"
					type="time"
					:label="t('jalali_calendar', 'Starts at')"
					:value.sync="workStart"
					@update:value="workStart = $event" />
				<NcTextField class="row__time"
					type="time"
					:label="t('jalali_calendar', 'Ends at')"
					:value.sync="workEnd"
					@update:value="workEnd = $event" />
				<NcButton variant="primary" :disabled="savingConfig || !hoursValid" @click="saveWorkingHours">
					{{ t('jalali_calendar', 'Save') }}
				</NcButton>
			</div>
			<p v-if="!hoursValid" class="hint hint--error">
				{{ t('jalali_calendar', 'The working day must end after it starts.') }}
			</p>

			<h4>{{ t('jalali_calendar', 'Working days') }}</h4>
			<div class="row row--wrap">
				<NcCheckboxRadioSwitch v-for="day in weekdayOptions"
					:key="day.value"
					type="checkbox"
					:model-value="workDays.includes(day.value)"
					:disabled="savingConfig"
					@update:model-value="toggleWorkDay(day.value, $event)">
					{{ day.label }}
				</NcCheckboxRadioSwitch>
			</div>
		</NcSettingsSection>

		<NcSettingsSection :name="t('jalali_calendar', 'Import off-days')"
			:description="t('jalali_calendar', 'Official holidays are stored on this server and shown to every user. Importing replaces what the same source imported before; days you added by hand are never touched.')">
			<div class="row">
				<NcTextField class="row__year"
					type="number"
					:label="t('jalali_calendar', 'Jalali year')"
					:value.sync="importYear"
					@update:value="importYear = $event" />
			</div>

			<h4>{{ t('jalali_calendar', 'Official Iranian holidays (time.ir)') }}</h4>
			<NcNoteCard v-if="datasetYears.length" type="info">
				{{ t('jalali_calendar', 'For the current Jalali year the dates are fetched live from time.ir, so they match its calendar exactly. Other years come from a dataset bundled with the app, covering {years} — in those, religious holidays may fall a day earlier than time.ir shows.', { years: datasetYearsLabel }) }}
			</NcNoteCard>
			<NcNoteCard v-else type="warning">
				{{ t('jalali_calendar', 'The bundled holiday dataset is missing from this installation.') }}
			</NcNoteCard>
			<div class="row">
				<NcButton variant="primary"
					:disabled="importing || !datasetCovers(importYear)"
					@click="runImport('time.ir')">
					<template #icon>
						<NcLoadingIcon v-if="importing === 'time.ir'" :size="20" />
					</template>
					{{ t('jalali_calendar', 'Import official holidays') }}
				</NcButton>
				<span v-if="datasetYears.length && !datasetCovers(importYear)" class="hint">
					{{ t('jalali_calendar', 'The dataset does not cover {year}.', { year: persian(importYear) }) }}
				</span>
			</div>

			<h4>{{ t('jalali_calendar', 'From an iCalendar (.ics) feed') }}</h4>
			<div class="row">
				<NcTextField class="row__grow"
					:label="t('jalali_calendar', 'https:// address of a holiday calendar')"
					:value.sync="importUrl"
					@update:value="importUrl = $event" />
				<NcButton variant="primary"
					:disabled="importing || !importUrl"
					@click="runImport('ics')">
					<template #icon>
						<NcLoadingIcon v-if="importing === 'ics'" :size="20" />
					</template>
					{{ t('jalali_calendar', 'Import') }}
				</NcButton>
			</div>

			<NcNoteCard v-if="importResult" type="success">
				{{ importResult }}
			</NcNoteCard>
			<NcNoteCard v-if="importError" type="error">
				{{ importError }}
			</NcNoteCard>
		</NcSettingsSection>

		<NcSettingsSection :name="t('jalali_calendar', 'Off-days')"
			:description="t('jalali_calendar', 'Add a day off by hand, or remove any entry below.')">
			<div class="row">
				<NcTextField class="row__narrow"
					type="number"
					:label="t('jalali_calendar', 'Year')"
					:value.sync="newDay.jy"
					@update:value="newDay.jy = $event" />
				<NcTextField class="row__narrow"
					type="number"
					:label="t('jalali_calendar', 'Month')"
					:value.sync="newDay.jm"
					@update:value="newDay.jm = $event" />
				<NcTextField class="row__narrow"
					type="number"
					:label="t('jalali_calendar', 'Day')"
					:value.sync="newDay.jd"
					@update:value="newDay.jd = $event" />
				<NcTextField class="row__grow"
					:label="t('jalali_calendar', 'Description')"
					:value.sync="newDay.title"
					@update:value="newDay.title = $event" />
				<NcButton variant="primary" :disabled="!canAdd" @click="addDay">
					{{ t('jalali_calendar', 'Add') }}
				</NcButton>
			</div>

			<NcNoteCard v-if="addError" type="error">
				{{ addError }}
			</NcNoteCard>

			<div class="row row--spaced">
				<NcButton :disabled="loadingList" @click="shiftYear(-1)">
					{{ t('jalali_calendar', 'Previous year') }}
				</NcButton>
				<strong>{{ persian(listYear) }}</strong>
				<NcButton :disabled="loadingList" @click="shiftYear(1)">
					{{ t('jalali_calendar', 'Next year') }}
				</NcButton>
				<NcLoadingIcon v-if="loadingList" :size="20" />
			</div>

			<NcEmptyContent v-if="!loadingList && offDays.length === 0"
				:name="t('jalali_calendar', 'No off-days stored for this year')"
				:description="t('jalali_calendar', 'Import them, or add one above.')" />

			<table v-else-if="offDays.length" class="offdays">
				<thead>
					<tr>
						<th>{{ t('jalali_calendar', 'Date') }}</th>
						<th>{{ t('jalali_calendar', 'Gregorian') }}</th>
						<th>{{ t('jalali_calendar', 'Description') }}</th>
						<th>{{ t('jalali_calendar', 'Source') }}</th>
						<th />
					</tr>
				</thead>
				<tbody>
					<tr v-for="day in offDays" :key="day.id">
						<td dir="rtl">{{ jalaliLabel(day) }}</td>
						<td>{{ day.gdate }}</td>
						<td dir="auto">{{ day.title }}</td>
						<td><span class="source">{{ day.source }}</span></td>
						<td>
							<NcButton variant="tertiary"
								:aria-label="t('jalali_calendar', 'Remove')"
								@click="removeDay(day)">
								<template #icon>
									<NcIconSvgWrapper :path="mdiDelete" :size="20" />
								</template>
							</NcButton>
						</td>
					</tr>
				</tbody>
			</table>
		</NcSettingsSection>
	</div>
</template>

<script>
import { mdiDelete } from '@mdi/js'
import { loadState } from '@nextcloud/initial-state'
import { t } from '@nextcloud/l10n'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import NcSettingsSection from '@nextcloud/vue/components/NcSettingsSection'
import NcTextField from '@nextcloud/vue/components/NcTextField'

import {
	createOffDay,
	deleteOffDay,
	errorMessage,
	fetchOffDaysForYear,
	importOffDays,
	saveAdminConfig,
} from './utils/api.js'
import { JALALI_MONTHS, WEEKDAYS, pad2, toPersianDigits } from './utils/jalali.js'

/**
 * @param {number} minutes minutes from midnight
 * @return {string} HH:MM for an <input type="time">
 */
function minutesToTime(minutes) {
	return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`
}

/**
 * @param {string} value HH:MM
 * @return {number} minutes from midnight
 */
function timeToMinutes(value) {
	const [hours, minutes] = String(value).split(':').map(Number)
	return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0)
}

export default {
	name: 'AdminSettings',

	components: {
		NcButton,
		NcCheckboxRadioSwitch,
		NcEmptyContent,
		NcIconSvgWrapper,
		NcLoadingIcon,
		NcNoteCard,
		NcSettingsSection,
		NcTextField,
	},

	setup() {
		return { mdiDelete }
	},

	data() {
		const state = loadState('jalali_calendar', 'admin', {})
		const year = state.currentJalaliYear ?? 1405

		return {
			firstDayOfWeek: state.firstDayOfWeek ?? 'saturday',
			workStart: minutesToTime(state.workStart ?? 540),
			workEnd: minutesToTime(state.workEnd ?? 1020),
			workDays: Array.isArray(state.workDays) ? [...state.workDays] : [6, 0, 1, 2, 3],
			datasetYears: state.dataset?.years ?? [],
			importUrl: state.importUrl ?? '',
			importYear: String(year),
			listYear: year,
			offDays: [],
			newDay: { jy: String(year), jm: '1', jd: '1', title: '' },
			savingConfig: false,
			loadingList: false,
			importing: null,
			importResult: '',
			importError: '',
			addError: '',
		}
	},

	computed: {
		/** Saturday-first, matching how the calendar itself reads. */
		weekdayOptions() {
			return [6, 0, 1, 2, 3, 4, 5].map((value) => ({
				value,
				label: WEEKDAYS[(value + 1) % 7],
			}))
		},

		hoursValid() {
			return timeToMinutes(this.workStart) < timeToMinutes(this.workEnd)
		},

		datasetYearsLabel() {
			if (this.datasetYears.length === 0) {
				return ''
			}
			const first = this.datasetYears[0]
			const last = this.datasetYears[this.datasetYears.length - 1]
			return first === last
				? toPersianDigits(first)
				: `${toPersianDigits(first)}–${toPersianDigits(last)}`
		},

		canAdd() {
			return this.newDay.title.trim() !== ''
				&& Number(this.newDay.jm) >= 1 && Number(this.newDay.jm) <= 12
				&& Number(this.newDay.jd) >= 1 && Number(this.newDay.jd) <= 31
				&& Number(this.newDay.jy) > 0
		},
	},

	async mounted() {
		await this.loadYear()
	},

	methods: {
		t,

		persian(value) {
			return toPersianDigits(value)
		},

		jalaliLabel(day) {
			return `${toPersianDigits(day.jd)} ${JALALI_MONTHS[day.jm - 1]} ${toPersianDigits(day.jy)}`
		},

		async setFirstDay(value) {
			const previous = this.firstDayOfWeek
			this.firstDayOfWeek = value
			this.savingConfig = true
			try {
				await saveAdminConfig({ firstDayOfWeek: value })
			} catch (error) {
				this.firstDayOfWeek = previous
				this.addError = errorMessage(error)
			} finally {
				this.savingConfig = false
			}
		},

		async saveWorkingHours() {
			this.savingConfig = true
			this.addError = ''
			try {
				await saveAdminConfig({
					workStart: timeToMinutes(this.workStart),
					workEnd: timeToMinutes(this.workEnd),
				})
			} catch (error) {
				this.addError = errorMessage(error)
			} finally {
				this.savingConfig = false
			}
		},

		async toggleWorkDay(value, enabled) {
			const previous = [...this.workDays]
			this.workDays = enabled
				? [...this.workDays, value].sort((a, b) => a - b)
				: this.workDays.filter((day) => day !== value)

			this.savingConfig = true
			try {
				await saveAdminConfig({ workDays: this.workDays })
			} catch (error) {
				this.workDays = previous
				this.addError = errorMessage(error)
			} finally {
				this.savingConfig = false
			}
		},

		datasetCovers(year) {
			return this.datasetYears.includes(Number(year))
		},

		async runImport(provider) {
			this.importing = provider
			this.importResult = ''
			this.importError = ''
			try {
				const result = await importOffDays(provider, Number(this.importYear), this.importUrl)
				this.importResult = result.provider === 'dataset'
					? t('jalali_calendar', 'Imported {imported} off-days from the bundled dataset (replaced {replaced}).', {
						imported: toPersianDigits(result.imported),
						replaced: toPersianDigits(result.replaced),
					})
					: t('jalali_calendar', 'Imported {imported} off-days live from time.ir (replaced {replaced}).', {
						imported: toPersianDigits(result.imported),
						replaced: toPersianDigits(result.replaced),
					})
				this.listYear = Number(this.importYear)
				await this.loadYear()
			} catch (error) {
				this.importError = errorMessage(error)
			} finally {
				this.importing = null
			}
		},

		async loadYear() {
			this.loadingList = true
			try {
				this.offDays = await fetchOffDaysForYear(this.listYear)
			} catch (error) {
				this.addError = errorMessage(error)
				this.offDays = []
			} finally {
				this.loadingList = false
			}
		},

		async shiftYear(delta) {
			this.listYear += delta
			await this.loadYear()
		},

		async addDay() {
			this.addError = ''
			try {
				await createOffDay({
					jy: Number(this.newDay.jy),
					jm: Number(this.newDay.jm),
					jd: Number(this.newDay.jd),
					title: this.newDay.title.trim(),
					isOff: true,
				})
				this.newDay.title = ''
				this.listYear = Number(this.newDay.jy)
				await this.loadYear()
			} catch (error) {
				this.addError = errorMessage(error)
			}
		},

		async removeDay(day) {
			this.addError = ''
			try {
				await deleteOffDay(day.id)
				this.offDays = this.offDays.filter((entry) => entry.id !== day.id)
			} catch (error) {
				this.addError = errorMessage(error)
			}
		},
	},
}
</script>

<style scoped lang="scss">
.jalali-admin {
	h4 {
		margin: 16px 0 4px;
		font-weight: bold;
	}
}

.row {
	display: flex;
	align-items: flex-end;
	gap: 8px;
	flex-wrap: wrap;
	margin-bottom: 8px;

	&--spaced {
		align-items: center;
		margin-top: 20px;
	}

	&__grow {
		flex: 1 1 260px;
	}

	&__narrow {
		flex: 0 0 90px;
	}

	&__year {
		flex: 0 0 140px;
	}

	&__time {
		flex: 0 0 150px;
	}

	&--wrap {
		gap: 4px 20px;
	}
}

.hint {
	align-self: center;

	&--error {
		color: var(--color-error-text, var(--color-error));
	}
	color: var(--color-text-maxcontrast);
	font-size: 13px;
}

.offdays {
	width: 100%;
	margin-top: 8px;
	border-collapse: collapse;

	th,
	td {
		padding: 6px 8px;
		border-bottom: 1px solid var(--color-border);
		text-align: start;
	}

	th {
		color: var(--color-text-maxcontrast);
		font-weight: normal;
	}
}

.source {
	padding: 1px 8px;
	border-radius: var(--border-radius-pill, 12px);
	background-color: var(--color-background-dark);
	font-size: 12px;
}
</style>
