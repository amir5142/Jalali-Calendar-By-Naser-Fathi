<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\JalaliCalendar\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Creates the table holding official and manually-added off-days.
 */
class Version000100Date20260730120000 extends SimpleMigrationStep {

	/**
	 * @param IOutput $output
	 * @param Closure(): ISchemaWrapper $schemaClosure
	 * @param array $options
	 * @return null|ISchemaWrapper
	 */
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if ($schema->hasTable('jalali_offdays')) {
			return null;
		}

		$table = $schema->createTable('jalali_offdays');

		$table->addColumn('id', Types::BIGINT, [
			'autoincrement' => true,
			'notnull' => true,
			'length' => 20,
		]);
		// The Gregorian date is what every lookup filters on, because the grid
		// asks for a Gregorian window. Stored as YYYY-MM-DD for cheap BETWEEN.
		$table->addColumn('gdate', Types::STRING, [
			'notnull' => true,
			'length' => 10,
		]);
		$table->addColumn('jy', Types::INTEGER, ['notnull' => true]);
		$table->addColumn('jm', Types::SMALLINT, ['notnull' => true]);
		$table->addColumn('jd', Types::SMALLINT, ['notnull' => true]);
		$table->addColumn('title', Types::STRING, [
			'notnull' => true,
			'length' => 255,
		]);
		// Whether the day is an actual day off, as opposed to a mere occasion.
		$table->addColumn('is_off', Types::BOOLEAN, [
			'notnull' => false,
			'default' => true,
		]);
		// 'manual' or an importer id such as 'time.ir'; lets a re-import replace
		// only what it originally created and never touch manual entries.
		$table->addColumn('source', Types::STRING, [
			'notnull' => true,
			'length' => 32,
			'default' => 'manual',
		]);

		$table->setPrimaryKey(['id']);
		$table->addIndex(['gdate'], 'jalali_offdays_gdate');
		$table->addIndex(['source'], 'jalali_offdays_source');
		// One entry per day per source, so importing twice cannot duplicate.
		$table->addUniqueIndex(['gdate', 'source'], 'jalali_offdays_uniq');

		return $schema;
	}
}
