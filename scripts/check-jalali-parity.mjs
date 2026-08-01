/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Holds `lib/Service/JalaliConverter.php` and `jalaali-js` to the same answers,
 * day by day, across a century and a half.
 *
 * These are two independent implementations of one algorithm: the PHP side is a
 * hand port of what jalaali-js does. The Shamsi picker writes Gregorian dates
 * that the PHP side later reads back, so a single day of drift between them
 * would land off-days on the wrong date with no error to trace it by.
 *
 * Run with `npm run test:parity`. It lives outside the vitest suite for two
 * reasons: that suite runs three times over a timezone matrix and this check is
 * timezone-independent, and the Nextcloud vite config aliases Node's builtins
 * to browser shims, which makes spawning a subprocess from a spec impossible.
 *
 * Exits 0 on agreement, 1 on any mismatch, and 2 when PHP is unavailable.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toGregorian, toJalaali } from 'jalaali-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DUMPER = resolve(ROOT, 'tests/parity/dump-jalali.php')

/** Past the oldest plausible birthday, well beyond any due date anyone will set. */
const FROM = process.argv[2] ?? '1925-01-01'
const TO = process.argv[3] ?? '2075-12-31'

/** Below this the dump is suspect, and every comparison would be vacuous. */
const MIN_ROWS = 55_000

/** How many examples to print before summarising: a drift shows up as a pattern. */
const SHOW = 5

if (spawnSync('php', ['-v'], { stdio: 'ignore' }).status !== 0) {
	console.error('No `php` on PATH. This check compares the PHP converter against jalaali-js,')
	console.error('so it cannot run without one. CI installs PHP; see .github/workflows/test.yml.')
	process.exit(2)
}

console.log(`Comparing JalaliConverter.php against jalaali-js, ${FROM} to ${TO} …`)

const { count, rows } = JSON.parse(execFileSync('php', [DUMPER, FROM, TO], {
	encoding: 'utf8',
	// A century and a half of dates runs to a few MB, past the default buffer.
	maxBuffer: 64 * 1024 * 1024,
}))

if (count < MIN_ROWS || rows.length !== count) {
	console.error(`Dump looks wrong: ${count} claimed, ${rows.length} rows, expected at least ${MIN_ROWS}.`)
	process.exit(1)
}

const failures = { toJalali: [], toGregorian: [], roundTrip: [] }

for (const [gy, gm, gd, pjy, pjm, pjd, bgy, bgm, bgd] of rows) {
	const forward = toJalaali(gy, gm, gd)
	if (forward.jy !== pjy || forward.jm !== pjm || forward.jd !== pjd) {
		failures.toJalali.push(
			`${gy}-${gm}-${gd}: php ${pjy}/${pjm}/${pjd}, js ${forward.jy}/${forward.jm}/${forward.jd}`,
		)
	}

	const back = toGregorian(pjy, pjm, pjd)
	if (back.gy !== bgy || back.gm !== bgm || back.gd !== bgd) {
		failures.toGregorian.push(
			`${pjy}/${pjm}/${pjd}: php ${bgy}-${bgm}-${bgd}, js ${back.gy}-${back.gm}-${back.gd}`,
		)
	}

	if (bgy !== gy || bgm !== gm || bgd !== gd) {
		failures.roundTrip.push(`${gy}-${gm}-${gd} returned as ${bgy}-${bgm}-${bgd}`)
	}
}

const total = Object.values(failures).reduce((sum, list) => sum + list.length, 0)

if (total === 0) {
	console.log(`${count.toLocaleString()} days checked — toJalali, toGregorian and round trip all agree.`)
	process.exit(0)
}

for (const [name, list] of Object.entries(failures)) {
	if (list.length === 0) {
		continue
	}
	console.error(`\n${name}: ${list.length} mismatch(es)`)
	for (const line of list.slice(0, SHOW)) {
		console.error(`  ${line}`)
	}
	if (list.length > SHOW) {
		console.error(`  … and ${list.length - SHOW} more`)
	}
}

console.error(`\n${total} mismatch(es) across ${count.toLocaleString()} days.`)
process.exit(1)
