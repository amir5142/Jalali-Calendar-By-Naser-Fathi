<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\JalaliCalendar\Service;

use OCA\JalaliCalendar\Db\OffDay;
use OCA\JalaliCalendar\Db\OffDayMapper;
use OCP\AppFramework\Db\DoesNotExistException;

/**
 * Reading and editing the official / manual off-day list.
 */
class OffDayService {

	public const SOURCE_MANUAL = 'manual';

	public function __construct(
		private OffDayMapper $mapper,
		private JalaliConverter $converter,
	) {
	}

	/**
	 * @param string $from Gregorian YYYY-MM-DD, inclusive
	 * @param string $to Gregorian YYYY-MM-DD, inclusive
	 * @return OffDay[]
	 */
	public function findInRange(string $from, string $to): array {
		return $this->mapper->findInRange($from, $to);
	}

	/**
	 * @param int $jy Jalali year
	 * @return OffDay[]
	 */
	public function findByYear(int $jy): array {
		return $this->mapper->findByYear($jy);
	}

	/**
	 * Add or update one off-day, keyed on (date, source).
	 *
	 * @param int $jy Jalali year
	 * @param int $jm Jalali month, 1-12
	 * @param int $jd Jalali day
	 * @param string $title label shown on the day
	 * @param bool $isOff true for an actual day off, false for a mere occasion
	 * @param string $source 'manual' or an importer id
	 * @return OffDay
	 * @throws \InvalidArgumentException on an invalid date or empty title
	 */
	public function set(int $jy, int $jm, int $jd, string $title, bool $isOff = true, string $source = self::SOURCE_MANUAL): OffDay {
		if (!$this->converter->isValidJalaliDate($jy, $jm, $jd)) {
			throw new \InvalidArgumentException(sprintf('Invalid Jalali date %d/%d/%d', $jy, $jm, $jd));
		}

		$title = trim($title);
		if ($title === '') {
			throw new \InvalidArgumentException('Title must not be empty');
		}
		$title = mb_substr($title, 0, 255);

		$gdate = $this->converter->toGregorianString($jy, $jm, $jd);

		$existing = $this->mapper->findOneByDateAndSource($gdate, $source);
		if ($existing !== null) {
			$existing->setTitle($title);
			$existing->setIsOff($isOff);
			return $this->mapper->update($existing);
		}

		$entity = new OffDay();
		$entity->setGdate($gdate);
		$entity->setJy($jy);
		$entity->setJm($jm);
		$entity->setJd($jd);
		$entity->setTitle($title);
		$entity->setIsOff($isOff);
		$entity->setSource($source);

		return $this->mapper->insert($entity);
	}

	/**
	 * @param int $id row id
	 * @throws DoesNotExistException when it is already gone
	 */
	public function delete(int $id): void {
		$entity = $this->mapper->find($id);
		$this->mapper->delete($entity);
	}

	/**
	 * Replace everything one importer previously wrote for a Jalali year.
	 *
	 * Manual entries are keyed on a different source, so they always survive.
	 *
	 * @param int $jy Jalali year
	 * @param array<array{jm: int, jd: int, title: string, isOff: bool}> $days
	 * @param string $source importer id
	 * @return array{imported: int, replaced: int, skipped: int}
	 */
	public function replaceYearFromSource(int $jy, array $days, string $source): array {
		$replaced = $this->mapper->deleteBySourceAndYear($jy, $source);

		// Storage holds one row per day per source, but two occasions can fall
		// on the same day — in 1405 the first of Farvardin is both Nowruz and
		// Eid al-Fitr. Merge their titles rather than let the later one
		// silently overwrite the earlier.
		$merged = [];
		foreach ($days as $day) {
			$key = ((int)$day['jm']) . '/' . ((int)$day['jd']);
			$title = trim((string)$day['title']);

			if (!isset($merged[$key])) {
				$merged[$key] = [
					'jm' => (int)$day['jm'],
					'jd' => (int)$day['jd'],
					'titles' => [],
					'isOff' => (bool)($day['isOff'] ?? true),
				];
			}
			if ($title !== '' && !in_array($title, $merged[$key]['titles'], true)) {
				$merged[$key]['titles'][] = $title;
			}
			// A day is off if any occasion on it is.
			$merged[$key]['isOff'] = $merged[$key]['isOff'] || (bool)($day['isOff'] ?? true);
		}

		$imported = 0;
		$skipped = 0;
		foreach ($merged as $day) {
			try {
				$this->set(
					$jy,
					$day['jm'],
					$day['jd'],
					implode('، ', $day['titles']),
					$day['isOff'],
					$source,
				);
				$imported++;
			} catch (\InvalidArgumentException $e) {
				// One malformed entry must not abort the whole import.
				$skipped++;
			}
		}

		return ['imported' => $imported, 'replaced' => $replaced, 'skipped' => $skipped];
	}

	/**
	 * @return array<string, int>
	 */
	public function countBySource(): array {
		return $this->mapper->countBySource();
	}
}
