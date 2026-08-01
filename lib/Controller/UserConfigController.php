<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\JalaliCalendar\Controller;

use OCA\JalaliCalendar\AppInfo\Application;
use OCA\JalaliCalendar\Service\UserConfigService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\OCSController;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * Each user's own display preferences.
 */
class UserConfigController extends OCSController {

	public function __construct(
		IRequest $request,
		private UserConfigService $userConfig,
		private IUserSession $userSession,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	public function show(): DataResponse {
		return new DataResponse($this->userConfig->getAll($this->userId()));
	}

	/**
	 * @param bool|null $showTasks render VTODOs alongside events
	 * @param bool|null $limitMonthEvents cap how many fit in a month cell
	 * @param bool|null $showWeekends keep the weekend column
	 * @param bool|null $showWeekNumbers show the Jalali week number
	 * @param int|null $slotDuration minutes per row in the day and week grids
	 * @param bool|null $globalPicker offer the Shamsi picker on date fields elsewhere
	 */
	#[NoAdminRequired]
	public function update(
		?bool $showTasks = null,
		?bool $limitMonthEvents = null,
		?bool $showWeekends = null,
		?bool $showWeekNumbers = null,
		?int $slotDuration = null,
		?bool $globalPicker = null,
	): DataResponse {
		try {
			$this->userConfig->update($this->userId(), [
				UserConfigService::SHOW_TASKS => $showTasks,
				UserConfigService::LIMIT_MONTH_EVENTS => $limitMonthEvents,
				UserConfigService::SHOW_WEEKENDS => $showWeekends,
				UserConfigService::SHOW_WEEK_NUMBERS => $showWeekNumbers,
				UserConfigService::SLOT_DURATION => $slotDuration,
				UserConfigService::GLOBAL_PICKER => $globalPicker,
			]);
		} catch (\InvalidArgumentException $e) {
			return new DataResponse(['message' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
		}

		return new DataResponse($this->userConfig->getAll($this->userId()));
	}

	private function userId(): string {
		return $this->userSession->getUser()?->getUID() ?? '';
	}
}
