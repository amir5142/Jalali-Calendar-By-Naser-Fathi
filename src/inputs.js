/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Entry point for the Shamsi picker that rides along on every page.
 *
 * Kept deliberately separate from `main.js`. This bundle is loaded on every
 * logged-in page render in the whole instance, so it must stay small: it pulls
 * in the date conversion and the picker, and nothing else. Vue and
 * `@nextcloud/vue` are what make the calendar bundle large, and neither belongs
 * anywhere near a global script.
 */

import { startInputPicker } from './utils/inputPicker.js'

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', startInputPicker)
} else {
	startInputPicker()
}
