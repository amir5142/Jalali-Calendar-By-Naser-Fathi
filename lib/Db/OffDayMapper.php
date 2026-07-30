<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\JalaliCalendar\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\MultipleObjectsReturnedException;
use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * @template-extends QBMapper<OffDay>
 */
class OffDayMapper extends QBMapper {

	public const TABLE = 'jalali_offdays';

	public function __construct(IDBConnection $db) {
		parent::__construct($db, self::TABLE, OffDay::class);
	}

	/**
	 * QBMapper, unlike the deprecated Mapper it replaced, provides no
	 * find-by-id; callers that delete or edit a single row need one.
	 *
	 * @param int $id row id
	 * @return OffDay
	 * @throws DoesNotExistException when there is no such row
	 * @throws MultipleObjectsReturnedException never, in practice: id is the PK
	 */
	public function find(int $id): OffDay {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from(self::TABLE)
			->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));

		return $this->findEntity($qb);
	}

	/**
	 * Off-days overlapping a Gregorian window, inclusive of both ends.
	 *
	 * @param string $from YYYY-MM-DD
	 * @param string $to YYYY-MM-DD
	 * @return OffDay[]
	 */
	public function findInRange(string $from, string $to): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from(self::TABLE)
			->where($qb->expr()->gte('gdate', $qb->createNamedParameter($from)))
			->andWhere($qb->expr()->lte('gdate', $qb->createNamedParameter($to)))
			->orderBy('gdate', 'ASC');

		return $this->findEntities($qb);
	}

	/**
	 * @param int $jy Jalali year
	 * @return OffDay[]
	 */
	public function findByYear(int $jy): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from(self::TABLE)
			->where($qb->expr()->eq('jy', $qb->createNamedParameter($jy, IQueryBuilder::PARAM_INT)))
			->orderBy('gdate', 'ASC');

		return $this->findEntities($qb);
	}

	/**
	 * @param string $gdate YYYY-MM-DD
	 * @param string $source importer id or 'manual'
	 * @return OffDay|null
	 */
	public function findOneByDateAndSource(string $gdate, string $source): ?OffDay {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from(self::TABLE)
			->where($qb->expr()->eq('gdate', $qb->createNamedParameter($gdate)))
			->andWhere($qb->expr()->eq('source', $qb->createNamedParameter($source)))
			->setMaxResults(1);

		$entities = $this->findEntities($qb);
		return $entities[0] ?? null;
	}

	/**
	 * Remove everything a given importer created for one Jalali year, so a
	 * re-import is a clean replace. Manual entries are never touched.
	 *
	 * @param int $jy Jalali year
	 * @param string $source importer id
	 * @return int rows removed
	 */
	public function deleteBySourceAndYear(int $jy, string $source): int {
		$qb = $this->db->getQueryBuilder();
		$qb->delete(self::TABLE)
			->where($qb->expr()->eq('jy', $qb->createNamedParameter($jy, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('source', $qb->createNamedParameter($source)));

		return $qb->executeStatement();
	}

	/**
	 * @return array<string, int> row count per source
	 */
	public function countBySource(): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('source')
			->selectAlias($qb->func()->count('*'), 'cnt')
			->from(self::TABLE)
			->groupBy('source');

		$result = $qb->executeQuery();
		$counts = [];
		while ($row = $result->fetch()) {
			$counts[(string)$row['source']] = (int)$row['cnt'];
		}
		$result->closeCursor();

		return $counts;
	}
}
