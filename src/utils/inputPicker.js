/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A Shamsi picker for the native date fields *other* Nextcloud apps render —
 * Deck due dates above all.
 *
 * Those fields are `<input type="datetime-local">`, drawn by the browser
 * itself, which always renders a Gregorian calendar and honours no locale or
 * stylesheet. The only way to offer Shamsi there is to put our own UI beside
 * the control.
 *
 * The native input stays the source of truth throughout. Apps bind their models
 * to that exact element, so it is enhanced in place and never replaced: a
 * re-created input loses Deck's binding on the next render, and the field
 * silently stops saving.
 */

import {
	JALALI_MONTHS,
	SATURDAY,
	WEEKDAYS_SHORT,
	jalaliToDate,
	jalaaliMonthLength,
	dateToJalali,
	toPersianDigits,
	weekdayIndex,
} from './jalali.js'
import { buildValue, parseDateValue } from './dateValue.js'

/**
 * Marks an input as already enhanced, so a re-scan never doubles it up.
 *
 * Namespaced to this app on purpose. The standalone `jalali_datepicker`
 * prototype this grew out of claims the generic `data-jalali-enhanced`, and
 * sharing an attribute with another app would mean silently depending on its
 * internals — whichever script loaded first would win, and which one that was
 * would not be obvious from either codebase.
 */
const MARKER = 'data-jalali-calendar-picker'

const SELECTOR = `input[type="datetime-local"]:not([${MARKER}]), input[type="date"]:not([${MARKER}])`

/**
 * Day-cell geometry, in pixels.
 *
 * Nextcloud gives every `<button>` roughly a 44px minimum touch target. Seven
 * of those do not fit a picker popup, and `1fr` columns cannot shrink below a
 * minimum — the seventh column simply overflows. The grid is therefore laid out
 * in fixed pixels rather than fractions, and each cell overrides the minimum
 * explicitly.
 */
const CELL = 32
const GAP = 2
const PADDING = 12
const GRID_WIDTH = CELL * 7 + GAP * 6

let openPopup = null

/**
 * Read the input's current value as Gregorian parts.
 *
 * @param {HTMLInputElement} input the field being enhanced
 * @return {{gy: number, gm: number, gd: number, time: string|null}|null}
 */
function currentValue(input) {
	return parseDateValue(input.value)
}

/**
 * Build a local Date from Gregorian parts.
 *
 * `new Date(y, m, d)` remaps years 0-99 onto 1900-1999, so a genuine four-digit
 * value like 0099-01-01 would quietly come out as 1999 and the badge would name
 * the wrong century. Setting the year explicitly afterwards is the documented
 * way around it.
 *
 * @param {number} gy Gregorian year
 * @param {number} gm Gregorian month, 1-12
 * @param {number} gd Gregorian day of month
 * @return {Date}
 */
function localDate(gy, gm, gd) {
	const date = new Date(gy, gm - 1, gd)
	if (gy >= 0 && gy < 100) {
		date.setFullYear(gy)
	}

	return date
}

/**
 * Write a Gregorian date back so the host app notices.
 *
 * Assigning `input.value` sets the property without going through the setter
 * React and Vue patch, so no model ever updates — the field shows the new date
 * and saves the old one. Going through the prototype's own setter and then
 * dispatching bubbling events is the whole mechanism this feature rests on.
 *
 * @param {HTMLInputElement} input the field to update
 * @param {number} gy Gregorian year
 * @param {number} gm Gregorian month, 1-12
 * @param {number} gd Gregorian day of month
 */
function writeBack(input, gy, gm, gd) {
	const existing = currentValue(input)
	const value = buildValue(input.type, gy, gm, gd, existing?.time ?? null)

	const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
	if (descriptor?.set) {
		descriptor.set.call(input, value)
	} else {
		input.value = value
	}

	// Both, and both bubbling: v-model listens for `input`, while validation and
	// dirty-tracking commonly wait for `change`.
	input.dispatchEvent(new Event('input', { bubbles: true }))
	input.dispatchEvent(new Event('change', { bubbles: true }))
}

/**
 * @param {HTMLInputElement} input the field to describe
 * @return {string} the Shamsi equivalent of the current value
 */
function badgeText(input) {
	const parsed = currentValue(input)
	if (!parsed) {
		return '—'
	}

	const { jy, jm, jd } = dateToJalali(localDate(parsed.gy, parsed.gm, parsed.gd))

	return `${toPersianDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`
}

function closePopup() {
	openPopup?.remove()
	openPopup = null
}

/**
 * @param {string} className the class to apply
 * @param {string} [text] text content
 * @return {HTMLButtonElement} a button that never submits the surrounding form
 */
function button(className, text) {
	const element = document.createElement('button')
	// Deck's due-date field sits inside a form; without this the browser's
	// default submit type would save the card on every navigation click.
	element.type = 'button'
	element.className = className
	if (text !== undefined) {
		element.textContent = text
	}

	return element
}

/**
 * Build the month grid popup for one input.
 *
 * @param {HTMLInputElement} input the field being picked for
 * @return {HTMLElement} the popup, not yet attached
 */
function buildPopup(input) {
	const parsed = currentValue(input)
	const anchor = parsed
		? dateToJalali(localDate(parsed.gy, parsed.gm, parsed.gd))
		: dateToJalali(new Date())

	let viewYear = anchor.jy
	let viewMonth = anchor.jm

	const root = document.createElement('div')
	root.className = 'jalali-picker'
	root.setAttribute('dir', 'rtl')

	const shift = (delta) => {
		viewMonth += delta
		if (viewMonth < 1) {
			viewMonth = 12
			viewYear -= 1
		} else if (viewMonth > 12) {
			viewMonth = 1
			viewYear += 1
		}
		render()
	}

	/**
	 * @param {Event} event the originating click
	 * @param {Function} action what to run instead of the default
	 */
	const onClick = (event, action) => {
		event.preventDefault()
		// The host app may well have its own click handling on the surrounding
		// dialog; closing Deck's card mid-pick would lose the edit.
		event.stopPropagation()
		action()
	}

	function render() {
		root.textContent = ''

		const head = document.createElement('div')
		head.className = 'jalali-picker__head'

		const previous = button('jalali-picker__nav', '‹')
		previous.addEventListener('click', (event) => onClick(event, () => shift(-1)))

		const next = button('jalali-picker__nav', '›')
		next.addEventListener('click', (event) => onClick(event, () => shift(1)))

		const title = document.createElement('span')
		title.className = 'jalali-picker__title'
		title.textContent = `${JALALI_MONTHS[viewMonth - 1]} ${toPersianDigits(viewYear)}`

		// Reading right to left, "previous" belongs on the right.
		head.append(next, title, previous)
		root.appendChild(head)

		const grid = document.createElement('div')
		grid.className = 'jalali-picker__grid'

		for (const name of WEEKDAYS_SHORT) {
			const cell = document.createElement('div')
			cell.className = 'jalali-picker__weekday'
			cell.textContent = name
			grid.appendChild(cell)
		}

		// Blank cells until the first of the month reaches its own column.
		const offset = weekdayIndex(jalaliToDate(viewYear, viewMonth, 1), SATURDAY)
		for (let i = 0; i < offset; i += 1) {
			grid.appendChild(document.createElement('div'))
		}

		const selected = currentValue(input)
		const selectedJalali = selected
			? dateToJalali(localDate(selected.gy, selected.gm, selected.gd))
			: null
		const today = dateToJalali(new Date())

		for (let day = 1; day <= jalaaliMonthLength(viewYear, viewMonth); day += 1) {
			const cell = button('jalali-picker__day', toPersianDigits(day))

			if (selectedJalali?.jy === viewYear
				&& selectedJalali?.jm === viewMonth
				&& selectedJalali?.jd === day) {
				cell.classList.add('is-selected')
			}
			if (today.jy === viewYear && today.jm === viewMonth && today.jd === day) {
				cell.classList.add('is-today')
			}

			cell.addEventListener('click', (event) => onClick(event, () => {
				// Round-trip through a local Date, the same way the calendar
				// page does, so the picker and the grid can never disagree.
				const date = jalaliToDate(viewYear, viewMonth, day)
				writeBack(input, date.getFullYear(), date.getMonth() + 1, date.getDate())
				closePopup()
			}))

			grid.appendChild(cell)
		}

		root.appendChild(grid)
	}

	render()

	return root
}

/**
 * Place the popup, once it is attached and can measure itself.
 *
 * Fixed positioning against the viewport, because the field commonly sits
 * inside a scrolling, clipping dialog that an absolutely positioned popup would
 * be cut off by.
 *
 * @param {HTMLElement} popup the attached popup
 * @param {HTMLElement} anchor the field it belongs to
 */
function positionPopup(popup, anchor) {
	const rect = anchor.getBoundingClientRect()
	const width = popup.offsetWidth || GRID_WIDTH + PADDING * 2
	const height = popup.offsetHeight || 320

	let top = rect.bottom + 4
	if (top + height > window.innerHeight - 8) {
		// No room below: flip above the field rather than run off-screen.
		top = rect.top - height - 4
		if (top < 8) {
			top = Math.max(8, window.innerHeight - height - 8)
		}
	}

	popup.style.position = 'fixed'
	popup.style.top = `${top}px`
	popup.style.insetInlineStart = 'auto'
	popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`
	popup.style.zIndex = '100000'
}

/**
 * Attach the trigger and badge to one input.
 *
 * @param {HTMLInputElement} input the field to enhance
 */
function enhance(input) {
	if (input.getAttribute(MARKER)) {
		return
	}
	input.setAttribute(MARKER, '1')

	const wrap = document.createElement('span')
	wrap.className = 'jalali-picker-wrap'

	const badge = document.createElement('span')
	badge.className = 'jalali-picker-badge'
	badge.textContent = badgeText(input)

	const trigger = button('jalali-picker-trigger', 'شمسی')
	trigger.title = 'انتخاب تاریخ شمسی'
	trigger.setAttribute('aria-label', 'انتخاب تاریخ شمسی')

	trigger.addEventListener('click', (event) => {
		event.preventDefault()
		event.stopPropagation()

		const wasOpen = openPopup
		closePopup()
		// A second click on the same trigger closes rather than reopens.
		if (wasOpen) {
			return
		}

		const popup = buildPopup(input)
		document.body.appendChild(popup)
		positionPopup(popup, input)
		openPopup = popup
	})

	// The host app changes the value too — typing, or its own picker.
	const refresh = () => {
		badge.textContent = badgeText(input)
	}
	input.addEventListener('input', refresh)
	input.addEventListener('change', refresh)

	wrap.append(trigger, badge)
	input.parentNode?.insertBefore(wrap, input.nextSibling)
}

/**
 * Enhance every native date field not yet carrying our marker.
 *
 * @param {ParentNode} [root] where to search
 */
function scan(root = document) {
	for (const input of root.querySelectorAll(SELECTOR)) {
		try {
			enhance(input)
		} catch (error) {
			// One unusual field must not stop the rest from being enhanced.
			console.error('[jalali_calendar] could not enhance a date field', error)
		}
	}
}

function injectStyles() {
	if (document.querySelector('style[data-jalali-picker]')) {
		return
	}

	// `!important` throughout the buttons: these rules have to beat Nextcloud's
	// own button styling, which is more specific than a single class.
	const style = document.createElement('style')
	style.setAttribute('data-jalali-picker', '1')
	style.textContent = `
.jalali-picker-wrap{display:inline-flex;align-items:center;gap:6px;
	margin-inline-start:8px;vertical-align:middle}
.jalali-picker-trigger{font-size:12px;line-height:1;padding:4px 8px!important;
	border:none;border-radius:var(--border-radius,6px);cursor:pointer;
	min-width:0!important;min-height:0!important;height:auto!important;
	background:var(--color-primary-element,#0082c9);
	color:var(--color-primary-element-text,#fff)}
.jalali-picker-badge{font-size:12px;white-space:nowrap;
	color:var(--color-text-maxcontrast,inherit)}

.jalali-picker{box-sizing:border-box;padding:${PADDING}px;
	width:${GRID_WIDTH + PADDING * 2}px;font-size:13px;
	background:var(--color-main-background,#fff);color:var(--color-main-text,#000);
	border:1px solid var(--color-border,#ccc);
	border-radius:var(--border-radius-large,10px);
	box-shadow:0 4px 16px rgba(0,0,0,.35)}
.jalali-picker__head{display:flex;align-items:center;justify-content:space-between;
	gap:4px;margin-bottom:8px}
.jalali-picker__title{flex:1;text-align:center;font-weight:600}
.jalali-picker__nav{width:28px!important;height:28px!important;
	min-width:0!important;min-height:0!important;padding:0!important;
	border:none;border-radius:var(--border-radius,6px);cursor:pointer;
	font-size:18px;line-height:1;background:transparent!important;
	color:var(--color-main-text,inherit)}
.jalali-picker__nav:hover{background:var(--color-background-hover,rgba(127,127,127,.2))!important}

.jalali-picker__grid{display:grid;grid-template-columns:repeat(7,${CELL}px);
	gap:${GAP}px;justify-content:center;text-align:center}
.jalali-picker__weekday{box-sizing:border-box;width:${CELL}px;height:20px;
	line-height:20px;font-size:11px;color:var(--color-text-maxcontrast,inherit)}
.jalali-picker__day{box-sizing:border-box;
	width:${CELL}px!important;height:30px!important;
	min-width:0!important;min-height:0!important;
	padding:0!important;margin:0!important;
	border:none;border-radius:var(--border-radius,6px);cursor:pointer;
	font-size:13px;background:transparent;color:var(--color-main-text,inherit)}
.jalali-picker__day:hover{background:var(--color-background-hover,rgba(127,127,127,.2))}
.jalali-picker__day.is-today{outline:1px solid var(--color-primary-element,#0082c9)}
.jalali-picker__day.is-selected{background:var(--color-primary-element,#0082c9)!important;
	color:var(--color-primary-element-text,#fff)!important}
`
	document.head.appendChild(style)
}

/**
 * Watch for fields that appear after load.
 *
 * Deck mounts its card dialog on demand and re-renders it as the card is
 * edited. Vue emits mutations in the hundreds per interaction, so scanning on
 * each batch would query the whole document continuously; instead every batch
 * within a frame collapses into a single scan.
 */
function observe() {
	let pending = false

	const observer = new MutationObserver((mutations) => {
		if (pending) {
			return
		}
		if (!mutations.some((mutation) => mutation.addedNodes.length > 0)) {
			return
		}

		pending = true
		requestAnimationFrame(() => {
			pending = false
			try {
				scan()
			} catch (error) {
				// Keep observing: the next mutation gets another chance.
				console.error('[jalali_calendar] date-field scan failed', error)
			}
		})
	})

	observer.observe(document.body, { childList: true, subtree: true })
}

/**
 * Install the picker across the page.
 *
 * Every entry point is guarded: this runs inside apps we do not control, and a
 * failure here must never take down the page it was injected into.
 */
export function startInputPicker() {
	try {
		injectStyles()
		scan()
		observe()

		document.addEventListener('click', (event) => {
			if (openPopup && !openPopup.contains(event.target)) {
				closePopup()
			}
		})
		window.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') {
				closePopup()
			}
		})
	} catch (error) {
		console.error('[jalali_calendar] Shamsi picker disabled after error', error)
	}
}
