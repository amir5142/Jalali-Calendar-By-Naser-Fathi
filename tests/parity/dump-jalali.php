<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Dumps JalaliConverter's output over a Gregorian range as JSON, so the
 * frontend test suite can diff it against jalaali-js.
 *
 * The two implementations must agree exactly. The PHP side is a hand port of
 * the JS algorithm, and the Shamsi picker writes dates that the PHP side then
 * has to interpret the same way — a one-day drift between them would place
 * off-days on the wrong date with nothing to show for it.
 *
 * Usage:  php tests/parity/dump-jalali.php 1925-01-01 2075-12-31
 */

require_once __DIR__ . '/../../lib/Service/JalaliConverter.php';

use OCA\JalaliCalendar\Service\JalaliConverter;

$from = new DateTimeImmutable(($argv[1] ?? '1925-01-01') . ' 00:00:00', new DateTimeZone('UTC'));
$to = new DateTimeImmutable(($argv[2] ?? '2075-12-31') . ' 00:00:00', new DateTimeZone('UTC'));

$converter = new JalaliConverter();
$step = new DateInterval('P1D');
$rows = [];

for ($day = $from; $day <= $to; $day = $day->add($step)) {
	$gy = (int)$day->format('Y');
	$gm = (int)$day->format('n');
	$gd = (int)$day->format('j');

	// Associative arrays, not lists: ['jy' => …, 'jm' => …, 'jd' => …].
	$jalali = $converter->toJalali($gy, $gm, $gd);
	$back = $converter->toGregorian($jalali['jy'], $jalali['jm'], $jalali['jd']);

	$rows[] = [
		$gy, $gm, $gd,
		$jalali['jy'], $jalali['jm'], $jalali['jd'],
		$back['gy'], $back['gm'], $back['gd'],
	];
}

echo json_encode([
	'from' => $from->format('Y-m-d'),
	'to' => $to->format('Y-m-d'),
	'count' => count($rows),
	// Positional rows keep this to a few MB rather than tens.
	'rows' => $rows,
], JSON_THROW_ON_ERROR);
