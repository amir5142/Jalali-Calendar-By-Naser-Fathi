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
	'ocs' => [
		// Read by the calendar grid for any logged-in user.
		['name' => 'offDay#index', 'url' => '/api/v1/offdays', 'verb' => 'GET'],
		// Admin-only from here down.
		['name' => 'offDay#year', 'url' => '/api/v1/offdays/year/{jy}', 'verb' => 'GET',
			'requirements' => ['jy' => '\d{3,4}']],
		['name' => 'offDay#create', 'url' => '/api/v1/offdays', 'verb' => 'POST'],
		['name' => 'offDay#destroy', 'url' => '/api/v1/offdays/{id}', 'verb' => 'DELETE',
			'requirements' => ['id' => '\d+']],
		['name' => 'offDay#import', 'url' => '/api/v1/offdays/import', 'verb' => 'POST'],

		['name' => 'adminConfig#show', 'url' => '/api/v1/config', 'verb' => 'GET'],
		['name' => 'adminConfig#update', 'url' => '/api/v1/config', 'verb' => 'PUT'],

		// Each user's own display preferences.
		['name' => 'userConfig#show', 'url' => '/api/v1/preferences', 'verb' => 'GET'],
		['name' => 'userConfig#update', 'url' => '/api/v1/preferences', 'verb' => 'PUT'],
	],
];
