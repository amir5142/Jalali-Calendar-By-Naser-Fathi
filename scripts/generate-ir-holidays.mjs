/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Generates data/ir-holidays.json from the static offline files bundled in the
 * npm package `shamsi-holidays` (official time.ir holiday dates).
 *
 * The dataset is generated once and shipped with the app, rather than fetched
 * at runtime: time.ir publishes no free feed — their site ignores year/month
 * parameters server-side and api.time.ir requires a key — so a bundled dataset
 * is the only way to offer a working import to every administrator.
 *
 * Re-run when a new Jalali year is published upstream:
 *   npm run generate:holidays
 */

import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const staticDir = path.join(
	path.dirname(require.resolve('shamsi-holidays')),
	'static-holidays-data',
)

/**
 * Fixed solar national holidays. The upstream files carry dates only, so the
 * names come from the official calendar; anything not listed here falls on a
 * lunar (religious) date that shifts every year and cannot be named from the
 * date alone.
 */
const SOLAR = {
	'1/1': { name: 'جشن نوروز / سال نو', type: 'national' },
	'1/2': { name: 'عید نوروز', type: 'national' },
	'1/3': { name: 'عید نوروز', type: 'national' },
	'1/4': { name: 'عید نوروز', type: 'national' },
	'1/12': { name: 'روز جمهوری اسلامی', type: 'national' },
	'1/13': { name: 'روز طبیعت (سیزده‌بدر)', type: 'national' },
	'3/14': { name: 'رحلت امام خمینی', type: 'national' },
	'3/15': { name: 'قیام ۱۵ خرداد', type: 'national' },
	'11/22': { name: 'پیروزی انقلاب اسلامی', type: 'national' },
	'12/29': { name: 'ملی شدن صنعت نفت', type: 'national' },
}

const files = fs.readdirSync(staticDir)
	.map((name) => /^holidays(\d{4})\.json$/.exec(name))
	.filter(Boolean)
	.map((match) => ({ file: match[0], year: Number(match[1]) }))
	.sort((a, b) => a.year - b.year)

if (files.length === 0) {
	throw new Error(`No holiday files found in ${staticDir}`)
}

const entries = []
const seen = new Set()

for (const { file, year } of files) {
	const dates = JSON.parse(fs.readFileSync(path.join(staticDir, file), 'utf8'))

	for (const raw of dates) {
		const [jy, jm, jd] = String(raw).split('/').map(Number)
		if (!Number.isInteger(jy) || !Number.isInteger(jm) || !Number.isInteger(jd)) {
			throw new Error(`Unparsable date "${raw}" in ${file}`)
		}
		if (jy !== year) {
			throw new Error(`Date "${raw}" in ${file} does not belong to year ${year}`)
		}

		// A day can be listed twice upstream when two occasions coincide.
		const key = `${jy}/${jm}/${jd}`
		if (seen.has(key)) {
			continue
		}
		seen.add(key)

		const meta = SOLAR[`${jm}/${jd}`] ?? { name: 'تعطیل رسمی', type: 'religious' }
		entries.push({
			jalaliYear: jy,
			jalaliMonth: jm,
			jalaliDay: jd,
			name: meta.name,
			type: meta.type,
		})
	}
}

entries.sort((a, b) => a.jalaliYear - b.jalaliYear
	|| a.jalaliMonth - b.jalaliMonth
	|| a.jalaliDay - b.jalaliDay)

const years = [...new Set(entries.map((entry) => entry.jalaliYear))]
const payload = {
	provenance: 'Generated from the npm package shamsi-holidays (official time.ir holiday dates). Refresh with `npm run generate:holidays`.',
	jalaliYears: years,
	generatedFrom: 'shamsi-holidays',
	holidays: entries,
}

const dest = path.join(__dirname, '..', 'data', 'ir-holidays.json')
fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.writeFileSync(dest, `${JSON.stringify(payload, null, '\t')}\n`, 'utf8')

console.log(`Wrote ${entries.length} holidays for years ${years.join(', ')} to ${dest}`)
