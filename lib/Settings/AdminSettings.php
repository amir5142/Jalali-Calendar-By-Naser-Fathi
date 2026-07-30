<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\JalaliCalendar\Settings;

use OCA\JalaliCalendar\AppInfo\Application;
use OCA\JalaliCalendar\Service\ConfigService;
use OCA\JalaliCalendar\Service\ImportService;
use OCA\JalaliCalendar\Service\JalaliConverter;
use OCA\JalaliCalendar\Service\OffDayService;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Services\IInitialState;
use OCP\Settings\ISettings;
use OCP\Util;

class AdminSettings implements ISettings {

	public function __construct(
		private IInitialState $initialState,
		private ConfigService $config,
		private OffDayService $offDayService,
		private JalaliConverter $converter,
		private ImportService $importService,
	) {
	}

	public function getForm(): TemplateResponse {
		$today = new \DateTimeImmutable('now');
		$currentYear = $this->converter->toJalali(
			(int)$today->format('Y'),
			(int)$today->format('n'),
			(int)$today->format('j'),
		)['jy'];

		$this->initialState->provideInitialState('admin', array_merge(
			$this->config->getAdminState(),
			[
				'currentJalaliYear' => $currentYear,
				'counts' => $this->offDayService->countBySource(),
				'dataset' => $this->importService->getDatasetInfo(),
			],
		));

		Util::addTranslations(Application::APP_ID);
		Util::addScript(Application::APP_ID, Application::APP_ID . '-admin');

		return new TemplateResponse(Application::APP_ID, 'admin', [], TemplateResponse::RENDER_AS_BLANK);
	}

	public function getSection(): string {
		return Application::APP_ID;
	}

	public function getPriority(): int {
		return 50;
	}
}
