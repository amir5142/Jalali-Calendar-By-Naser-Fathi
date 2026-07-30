<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\JalaliCalendar\Controller;

use OCA\JalaliCalendar\AppInfo\Application;
use OCA\JalaliCalendar\Service\ConfigService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\OCSController;
use OCP\IRequest;

/**
 * Instance settings. Admin-only: no method carries #[NoAdminRequired].
 */
class AdminConfigController extends OCSController {

	public function __construct(
		IRequest $request,
		private ConfigService $config,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	public function show(): DataResponse {
		return new DataResponse($this->config->getAdminState());
	}

	/**
	 * @param string|null $firstDayOfWeek 'saturday' or 'sunday'
	 * @param string|null $importUrl default ICS feed
	 * @param int|null $workStart start of the working day, minutes from midnight
	 * @param int|null $workEnd end of the working day, minutes from midnight
	 * @param int[]|null $workDays working weekdays as getDay() values
	 */
	public function update(
		?string $firstDayOfWeek = null,
		?string $importUrl = null,
		?int $workStart = null,
		?int $workEnd = null,
		?array $workDays = null,
	): DataResponse {
		try {
			if ($firstDayOfWeek !== null) {
				$this->config->setFirstDayOfWeek($firstDayOfWeek);
			}
			if ($importUrl !== null) {
				$this->config->setImportUrl($importUrl);
			}
			if ($workStart !== null || $workEnd !== null) {
				$this->config->setWorkingHours(
					$workStart ?? $this->config->getWorkStart(),
					$workEnd ?? $this->config->getWorkEnd(),
				);
			}
			if ($workDays !== null) {
				$this->config->setWorkDays($workDays);
			}
		} catch (\InvalidArgumentException $e) {
			return new DataResponse(['message' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
		}

		return new DataResponse($this->config->getAdminState());
	}
}
