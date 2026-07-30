<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\JalaliCalendar\Service;

/**
 * Jalali <-> Gregorian conversion.
 *
 * A direct port of the algorithm used by `jalaali-js` on the frontend (itself
 * based on Kazimierz M. Borkowski's), so both sides agree exactly. Verified
 * against the JS implementation across the full supported year range.
 *
 * PHP's intdiv() and % truncate toward zero and take the sign of the dividend,
 * matching the JS `~~(a/b)` and `%` the original relies on.
 */
class JalaliConverter {

	public const MIN_YEAR = 1178;
	public const MAX_YEAR = 3177;

	/** Years at which the 33-year leap cycle pattern shifts. */
	private const BREAKS = [
		-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181,
		1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
	];

	/**
	 * @param int $jy Jalali year
	 * @return array{leap: int, gy: int, march: int}
	 * @throws \InvalidArgumentException on an out-of-range year
	 */
	private function jalCal(int $jy): array {
		$bl = count(self::BREAKS);
		$gy = $jy + 621;
		$leapJ = -14;
		$jp = self::BREAKS[0];

		if ($jy < $jp || $jy >= self::BREAKS[$bl - 1]) {
			throw new \InvalidArgumentException('Invalid Jalali year ' . $jy);
		}

		$jump = 0;
		for ($i = 1; $i < $bl; $i++) {
			$jm = self::BREAKS[$i];
			$jump = $jm - $jp;
			if ($jy < $jm) {
				break;
			}
			$leapJ = $leapJ + intdiv($jump, 33) * 8 + intdiv($jump % 33, 4);
			$jp = $jm;
		}

		$n = $jy - $jp;
		$leapJ = $leapJ + intdiv($n, 33) * 8 + intdiv(($n % 33) + 3, 4);
		if ($jump % 33 === 4 && $jump - $n === 4) {
			$leapJ++;
		}

		$leapG = intdiv($gy, 4) - intdiv((intdiv($gy, 100) + 1) * 3, 4) - 150;
		$march = 20 + $leapJ - $leapG;

		if ($jump - $n < 6) {
			$n = $n - $jump + intdiv($jump + 4, 33) * 33;
		}
		$leap = ((($n + 1) % 33) - 1) % 4;
		if ($leap === -1) {
			$leap = 4;
		}

		return ['leap' => $leap, 'gy' => $gy, 'march' => $march];
	}

	/**
	 * @param int $jy Jalali year
	 * @return bool
	 */
	public function isLeapYear(int $jy): bool {
		return $this->jalCal($jy)['leap'] === 0;
	}

	/**
	 * @param int $jy Jalali year
	 * @param int $jm Jalali month, 1-12
	 * @return int number of days in that month
	 */
	public function monthLength(int $jy, int $jm): int {
		if ($jm <= 6) {
			return 31;
		}
		if ($jm <= 11) {
			return 30;
		}
		return $this->isLeapYear($jy) ? 30 : 29;
	}

	/**
	 * Gregorian date -> Julian Day Number.
	 */
	private function g2d(int $gy, int $gm, int $gd): int {
		$d = intdiv(($gy + intdiv($gm - 8, 6) + 100100) * 1461, 4)
			+ intdiv(153 * (($gm + 9) % 12) + 2, 5)
			+ $gd - 34840408;
		return $d - intdiv(intdiv($gy + 100100 + intdiv($gm - 8, 6), 100) * 3, 4) + 752;
	}

	/**
	 * Julian Day Number -> Gregorian date.
	 *
	 * @return array{gy: int, gm: int, gd: int}
	 */
	private function d2g(int $jdn): array {
		$j = 4 * $jdn + 139361631;
		$j = $j + intdiv(intdiv(4 * $jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
		$i = intdiv($j % 1461, 4) * 5 + 308;
		$gd = intdiv($i % 153, 5) + 1;
		$gm = intdiv($i, 153) % 12 + 1;
		$gy = intdiv($j, 1461) - 100100 + intdiv(8 - $gm, 6);

		return ['gy' => $gy, 'gm' => $gm, 'gd' => $gd];
	}

	/**
	 * @param int $jy Jalali year
	 * @param int $jm Jalali month, 1-12
	 * @param int $jd Jalali day
	 * @return array{gy: int, gm: int, gd: int}
	 */
	public function toGregorian(int $jy, int $jm, int $jd): array {
		$r = $this->jalCal($jy);
		return $this->d2g(
			$this->g2d($r['gy'], 3, $r['march']) + ($jm - 1) * 31 - intdiv($jm, 7) * ($jm - 7) + $jd - 1,
		);
	}

	/**
	 * @param int $gy Gregorian year
	 * @param int $gm Gregorian month, 1-12
	 * @param int $gd Gregorian day
	 * @return array{jy: int, jm: int, jd: int}
	 */
	public function toJalali(int $gy, int $gm, int $gd): array {
		$jdn = $this->g2d($gy, $gm, $gd);
		$gregorian = $this->d2g($jdn);
		$jy = $gregorian['gy'] - 621;
		$r = $this->jalCal($jy);
		$jdn1f = $this->g2d($r['gy'], 3, $r['march']);

		$k = $jdn - $jdn1f;
		if ($k >= 0) {
			if ($k <= 185) {
				return ['jy' => $jy, 'jm' => 1 + intdiv($k, 31), 'jd' => ($k % 31) + 1];
			}
			$k -= 186;
		} else {
			// The date falls in the previous Jalali year. The leap flag here is
			// the one computed for the *original* year, not the decremented
			// one — recomputing it after the decrement shifts dates by a day.
			$jy--;
			$k += 179;
			if ($r['leap'] === 1) {
				$k++;
			}
		}

		return ['jy' => $jy, 'jm' => 7 + intdiv($k, 30), 'jd' => ($k % 30) + 1];
	}

	/**
	 * @param int $jy Jalali year
	 * @param int $jm Jalali month
	 * @param int $jd Jalali day
	 * @return bool
	 */
	public function isValidJalaliDate(int $jy, int $jm, int $jd): bool {
		return $jy >= self::MIN_YEAR && $jy <= self::MAX_YEAR
			&& $jm >= 1 && $jm <= 12
			&& $jd >= 1 && $jd <= $this->monthLength($jy, $jm);
	}

	/**
	 * @param int $jy Jalali year
	 * @param int $jm Jalali month
	 * @param int $jd Jalali day
	 * @return string the matching Gregorian date as YYYY-MM-DD
	 */
	public function toGregorianString(int $jy, int $jm, int $jd): string {
		$g = $this->toGregorian($jy, $jm, $jd);
		return sprintf('%04d-%02d-%02d', $g['gy'], $g['gm'], $g['gd']);
	}
}
