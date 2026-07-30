<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\JalaliCalendar\Service;

use OCP\Http\Client\IClientService;
use Psr\Log\LoggerInterface;
use Sabre\VObject\Reader;

/**
 * Fills the off-day list from an external source.
 *
 * Official Iranian holidays come from time.ir by two routes, tried in order:
 *
 *  1. **Live** — https://www.time.ir/event-year is server-rendered and lists a
 *     whole Jalali year of occasions, each flagged as a holiday or not. This is
 *     the authoritative source: correct dates *and* real names. It only ever
 *     serves the **current** Jalali year — the `?year=` parameter is accepted
 *     but ignored — so it is used only when importing that year.
 *
 *  2. **Bundled dataset** — `data/ir-holidays.json`, generated offline from the
 *     `shamsi-holidays` npm package, covering several years. Used for any other
 *     year, or when time.ir cannot be reached.
 *
 *     Caveat worth knowing: that package computes lunar (religious) holidays on
 *     Umm al-Qura reckoning, which runs a day earlier than Iran's official
 *     reckoning. Arbaeen 1405 lands on 12 Mordad there and 13 Mordad on time.ir.
 *     Solar national days and weekly Fridays are unaffected.
 *
 * A third provider takes any **iCalendar URL**, parsed with the sabre/vobject
 * that ships with Nextcloud.
 */
class ImportService {

	public const SOURCE_TIME_IR = 'time.ir';
	public const SOURCE_ICS = 'ics';

	/** What the upstream list uses for a day it does not name. */
	private const GENERIC_TITLE = 'تعطیل رسمی';

	private const EVENT_YEAR_URL = 'https://www.time.ir/event-year';

	/** Jalali month names as time.ir writes them, diacritics stripped. */
	private const MONTH_NAMES = [
		'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
		'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
	];

	private const REQUEST_TIMEOUT = 30;
	/** Guards against a hostile or runaway feed. */
	private const MAX_BODY_BYTES = 5 * 1024 * 1024;

	public function __construct(
		private IClientService $clientService,
		private OffDayService $offDayService,
		private JalaliConverter $converter,
		private LoggerInterface $logger,
	) {
	}

	/**
	 * @return string absolute path of the bundled dataset
	 */
	private function datasetPath(): string {
		return dirname(__DIR__, 2) . '/data/ir-holidays.json';
	}

	/**
	 * @return array{provenance: string, jalaliYears: int[], holidays: array}
	 * @throws \RuntimeException when the bundled dataset is missing or corrupt
	 */
	private function readDataset(): array {
		$path = $this->datasetPath();
		if (!is_readable($path)) {
			throw new \RuntimeException('The bundled holiday dataset is missing from this installation');
		}

		$decoded = json_decode((string)file_get_contents($path), true);
		if (!is_array($decoded) || !isset($decoded['holidays']) || !is_array($decoded['holidays'])) {
			throw new \RuntimeException('The bundled holiday dataset could not be read');
		}

		return $decoded;
	}

	/**
	 * Which Jalali years the bundled dataset covers, so the admin page can say
	 * so up front rather than only failing on import.
	 *
	 * @return array{years: int[], provenance: string, count: int}
	 */
	public function getDatasetInfo(): array {
		try {
			$dataset = $this->readDataset();
		} catch (\RuntimeException $e) {
			return ['years' => [], 'provenance' => '', 'count' => 0];
		}

		$years = array_values(array_unique(array_map(
			static fn (array $entry): int => (int)$entry['jalaliYear'],
			$dataset['holidays'],
		)));
		sort($years);

		return [
			'years' => $years,
			'provenance' => (string)($dataset['provenance'] ?? ''),
			'count' => count($dataset['holidays']),
		];
	}

	/**
	 * Import one Jalali year of official Iranian holidays from the bundled
	 * time.ir dataset.
	 *
	 * @param int $jy Jalali year
	 * @return array{imported: int, replaced: int, skipped: int}
	 * @throws \RuntimeException when the dataset does not cover that year
	 */
	/**
	 * Import one Jalali year of official Iranian holidays.
	 *
	 * Prefers live time.ir data, which is only available for the current Jalali
	 * year, and falls back to the bundled dataset otherwise.
	 *
	 * @param int $jy Jalali year
	 * @return array{imported: int, replaced: int, skipped: int, provider: string}
	 * @throws \RuntimeException when neither route yields anything
	 */
	public function importFromTimeIr(int $jy): array {
		if ($jy === $this->currentJalaliYear()) {
			try {
				return $this->importFromTimeIrLive($jy);
			} catch (\RuntimeException $e) {
				$this->logger->warning(
					'[jalali_calendar] live time.ir import failed, falling back to the bundled dataset: ' . $e->getMessage(),
					['exception' => $e],
				);
			}
		}

		return $this->importFromDataset($jy);
	}

	/**
	 * @return int the Jalali year we are currently in
	 */
	private function currentJalaliYear(): int {
		$now = new \DateTimeImmutable('now');
		return $this->converter->toJalali(
			(int)$now->format('Y'),
			(int)$now->format('n'),
			(int)$now->format('j'),
		)['jy'];
	}

	/**
	 * Scrape the current Jalali year's occasions from time.ir.
	 *
	 * @param int $jy the current Jalali year
	 * @return array{imported: int, replaced: int, skipped: int, provider: string}
	 * @throws \RuntimeException when the page cannot be fetched or parsed
	 */
	private function importFromTimeIrLive(int $jy): array {
		try {
			$response = $this->clientService->newClient()->get(self::EVENT_YEAR_URL, [
				'timeout' => self::REQUEST_TIMEOUT,
				'headers' => ['Accept' => 'text/html'],
			]);
		} catch (\Throwable $e) {
			throw new \RuntimeException('Could not reach time.ir: ' . $e->getMessage(), 0, $e);
		}

		$body = (string)$response->getBody();
		if (strlen($body) > self::MAX_BODY_BYTES) {
			throw new \RuntimeException('The time.ir page was unexpectedly large');
		}

		$days = $this->parseEventYear($body);
		if ($days === []) {
			throw new \RuntimeException('No holidays could be read from time.ir; their page layout may have changed');
		}

		$result = $this->offDayService->replaceYearFromSource($jy, $days, self::SOURCE_TIME_IR);
		$result['provider'] = 'time.ir';

		$this->logger->info('[jalali_calendar] imported {count} off-days for {year} live from time.ir', [
			'count' => count($days),
			'year' => $jy,
		]);

		return $result;
	}

	/**
	 * Pull holiday rows out of the time.ir year page.
	 *
	 * The CSS-module class names carry a build hash that changes whenever
	 * time.ir redeploys, so matching is on the stable semantic parts
	 * (`EventListItem`, `__root__date`, `__root__event`, `__holiday`) rather
	 * than on any full class name.
	 *
	 * @param string $html the page body
	 * @return array<array{jm: int, jd: int, title: string, isOff: bool}>
	 */
	private function parseEventYear(string $html): array {
		if (preg_match_all('#<div class="EventListItem[^"]*__root[^"]*">(.*?)</div>#s', $html, $matches) === false) {
			return [];
		}

		$days = [];
		foreach ($matches[1] as $row) {
			// Only rows marked as an actual day off; the rest are mere occasions.
			if (!str_contains($row, '__holiday')) {
				continue;
			}
			if (preg_match('#__root__date[^"]*"[^>]*>(.*?)</span>#s', $row, $dateMatch) !== 1) {
				continue;
			}
			if (preg_match('#__root__event[^"]*"[^>]*>(.*?)</span>#s', $row, $eventMatch) !== 1) {
				continue;
			}

			$dateText = $this->plainText($dateMatch[1]);
			$title = $this->plainText($eventMatch[1]);
			if ($title === '') {
				continue;
			}

			if (preg_match('/^(\d+)\s*(.+)$/u', $dateText, $parts) !== 1) {
				continue;
			}

			$jd = (int)$parts[1];
			$jm = $this->monthNumber($parts[2]);
			if ($jm === null || $jd < 1 || $jd > 31) {
				continue;
			}

			$days[] = ['jm' => $jm, 'jd' => $jd, 'title' => $title, 'isOff' => true];
		}

		return $days;
	}

	/**
	 * @param string $fragment raw inner HTML
	 * @return string tags, comments and entities resolved away
	 */
	private function plainText(string $fragment): string {
		$text = preg_replace('/<!--.*?-->/s', '', $fragment) ?? '';
		$text = strip_tags($text);
		$text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
		// Collapse whitespace, including the non-breaking and zero-width kinds.
		$text = preg_replace('/[\x{00A0}\x{200B}-\x{200F}\s]+/u', ' ', $text) ?? '';
		return trim($text);
	}

	/**
	 * @param string $name a Jalali month name, possibly with diacritics
	 * @return int|null 1-12, or null when unrecognised
	 */
	private function monthNumber(string $name): ?int {
		// Strip Arabic diacritics, then normalise spellings that differ from
		// the canonical list. time.ir writes the fifth month «اَمرداد», which
		// reduces to «امرداد» — the older name for مرداد, with a leading alef.
		$clean = preg_replace('/[\x{064B}-\x{0652}\x{0670}]/u', '', trim($name)) ?? '';
		$clean = strtr($clean, [
			'امرداد' => 'مرداد',
			'شهريور' => 'شهریور',
			'دي' => 'دی',
			'ارديبهشت' => 'اردیبهشت',
			'فروردين' => 'فروردین',
		]);
		$index = array_search($clean, self::MONTH_NAMES, true);

		return $index === false ? null : $index + 1;
	}

	/**
	 * Import one Jalali year from the bundled dataset.
	 *
	 * @param int $jy Jalali year
	 * @return array{imported: int, replaced: int, skipped: int, provider: string}
	 * @throws \RuntimeException when the dataset does not cover that year
	 */
	private function importFromDataset(int $jy): array {
		$dataset = $this->readDataset();

		$days = [];
		$fridays = 0;
		foreach ($dataset['holidays'] as $entry) {
			if ((int)($entry['jalaliYear'] ?? 0) !== $jy) {
				continue;
			}

			$jm = (int)$entry['jalaliMonth'];
			$jd = (int)$entry['jalaliDay'];
			$title = (string)($entry['name'] ?? self::GENERIC_TITLE);

			// The official list marks every Friday as a holiday. Roughly two
			// thirds of a year's entries are those, and they carry nothing the
			// grid does not already show — Friday is drawn as the weekend
			// regardless. Importing them would print a generic label on every
			// Friday cell and bury the occasions that actually matter, so drop
			// the unnamed ones. A *named* holiday falling on a Friday is kept.
			if ($title === self::GENERIC_TITLE && $this->isFriday($jy, $jm, $jd)) {
				$fridays++;
				continue;
			}

			$days[] = [
				'jm' => $jm,
				'jd' => $jd,
				'title' => $title,
				'isOff' => true,
			];
		}

		if ($days === []) {
			$available = implode(', ', $this->getDatasetInfo()['years']);
			throw new \RuntimeException(sprintf(
				'The bundled dataset has no holidays for Jalali year %d. It covers: %s.',
				$jy,
				$available !== '' ? $available : 'nothing',
			));
		}

		$this->logger->info('[jalali_calendar] importing {count} off-days for {year} from the bundled dataset ({fridays} unnamed Fridays skipped)', [
			'count' => count($days),
			'year' => $jy,
			'fridays' => $fridays,
		]);

		$result = $this->offDayService->replaceYearFromSource($jy, $days, self::SOURCE_TIME_IR);
		$result['provider'] = 'dataset';

		return $result;
	}

	/**
	 * @param int $jy Jalali year
	 * @param int $jm Jalali month
	 * @param int $jd Jalali day
	 * @return bool whether that Jalali date falls on a Friday
	 */
	private function isFriday(int $jy, int $jm, int $jd): bool {
		$g = $this->converter->toGregorian($jy, $jm, $jd);
		// 5 == Friday for date('w').
		return (int)date('w', mktime(12, 0, 0, $g['gm'], $g['gd'], $g['gy'])) === 5;
	}

	/**
	 * Import all-day events from an iCalendar URL as off-days.
	 *
	 * @param string $url an https:// .ics feed
	 * @param int $jy the Jalali year to keep
	 * @return array{imported: int, replaced: int, skipped: int}
	 * @throws \RuntimeException when the feed cannot be read or parsed
	 */
	public function importFromIcs(string $url, int $jy): array {
		if (!filter_var($url, FILTER_VALIDATE_URL) || !str_starts_with($url, 'https://')) {
			throw new \RuntimeException('The calendar URL must be a valid https:// address');
		}

		try {
			$response = $this->clientService->newClient()->get($url, [
				'timeout' => self::REQUEST_TIMEOUT,
				'headers' => ['Accept' => 'text/calendar, application/calendar+xml;q=0.5, */*;q=0.1'],
			]);
		} catch (\Throwable $e) {
			throw new \RuntimeException('Could not fetch the calendar: ' . $e->getMessage(), 0, $e);
		}

		$body = (string)$response->getBody();
		if (strlen($body) > self::MAX_BODY_BYTES) {
			throw new \RuntimeException('The calendar feed is too large to import');
		}
		if (!str_contains($body, 'BEGIN:VCALENDAR')) {
			throw new \RuntimeException('That URL did not return an iCalendar feed');
		}

		try {
			$vcalendar = Reader::read($body, Reader::OPTION_FORGIVING);
		} catch (\Throwable $e) {
			throw new \RuntimeException('Could not parse the calendar: ' . $e->getMessage(), 0, $e);
		}

		$days = [];
		foreach ($vcalendar->VEVENT ?? [] as $vevent) {
			$start = $vevent->DTSTART ?? null;
			if ($start === null) {
				continue;
			}

			try {
				$date = $start->getDateTime();
			} catch (\Throwable $e) {
				continue;
			}

			$jalali = $this->converter->toJalali(
				(int)$date->format('Y'),
				(int)$date->format('n'),
				(int)$date->format('j'),
			);
			if ($jalali['jy'] !== $jy) {
				continue;
			}

			$summary = isset($vevent->SUMMARY) ? trim((string)$vevent->SUMMARY) : '';
			if ($summary === '') {
				continue;
			}

			$days[] = [
				'jm' => $jalali['jm'],
				'jd' => $jalali['jd'],
				'title' => $summary,
				'isOff' => true,
			];
		}

		if ($days === []) {
			throw new \RuntimeException(sprintf('The feed contained no events in Jalali year %d', $jy));
		}

		$this->logger->info('[jalali_calendar] importing {count} off-days from ICS', ['count' => count($days)]);

		return $this->offDayService->replaceYearFromSource($jy, $days, self::SOURCE_ICS);
	}
}
