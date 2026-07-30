<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

return [
	'routes' => [
		['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
		// Deep link straight into a Jalali month, e.g. /apps/jalali_calendar/1404/5
		['name' => 'page#month', 'url' => '/{jy}/{jm}', 'verb' => 'GET',
			'requirements' => ['jy' => '\d{3,4}', 'jm' => '\d{1,2}']],
	],
];
