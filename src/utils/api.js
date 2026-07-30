/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Thin wrapper over the app's own OCS endpoints.
 */

import axios from '@nextcloud/axios'
import { generateOcsUrl } from '@nextcloud/router'

const BASE = generateOcsUrl('apps/jalali_calendar/api/v1')

/**
 * OCS wraps everything in ocs.data; unwrap it so callers see plain payloads.
 *
 * @param {object} response an axios response
 * @return {any}
 */
function unwrap(response) {
	return response?.data?.ocs?.data ?? null
}

/**
 * Pull a human-readable message out of a failed OCS call.
 *
 * @param {Error} error the axios error
 * @return {string}
 */
export function errorMessage(error) {
	return error?.response?.data?.ocs?.data?.message
		?? error?.response?.data?.ocs?.meta?.message
		?? error?.message
		?? 'Unknown error'
}

/**
 * @param {string} from Gregorian YYYY-MM-DD, inclusive
 * @param {string} to Gregorian YYYY-MM-DD, inclusive
 * @return {Promise<object[]>}
 */
export async function fetchOffDays(from, to) {
	return unwrap(await axios.get(`${BASE}/offdays`, { params: { from, to } })) ?? []
}

/**
 * @param {number} jy Jalali year
 * @return {Promise<object[]>}
 */
export async function fetchOffDaysForYear(jy) {
	return unwrap(await axios.get(`${BASE}/offdays/year/${jy}`)) ?? []
}

/**
 * @param {object} offDay {jy, jm, jd, title, isOff}
 * @return {Promise<object>}
 */
export async function createOffDay(offDay) {
	return unwrap(await axios.post(`${BASE}/offdays`, offDay))
}

/**
 * @param {number} id row id
 * @return {Promise<void>}
 */
export async function deleteOffDay(id) {
	await axios.delete(`${BASE}/offdays/${id}`)
}

/**
 * @param {string} provider 'time.ir' or 'ics'
 * @param {number} jy Jalali year
 * @param {string} [url] ICS feed, for the ics provider
 * @return {Promise<{imported: number, replaced: number, skipped: number}>}
 */
export async function importOffDays(provider, jy, url = '') {
	return unwrap(await axios.post(`${BASE}/offdays/import`, { provider, jy, url }))
}

/**
 * @return {Promise<object>}
 */
export async function fetchAdminConfig() {
	return unwrap(await axios.get(`${BASE}/config`))
}

/**
 * @param {object} patch partial config
 * @return {Promise<object>}
 */
export async function saveAdminConfig(patch) {
	return unwrap(await axios.put(`${BASE}/config`, patch))
}

/**
 * @return {Promise<object>} the signed-in user's display preferences
 */
export async function fetchPreferences() {
	return unwrap(await axios.get(`${BASE}/preferences`))
}

/**
 * @param {object} patch partial preferences
 * @return {Promise<object>}
 */
export async function savePreferences(patch) {
	return unwrap(await axios.put(`${BASE}/preferences`, patch))
}
