<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\JalaliCalendar\Controller;

use OCA\JalaliCalendar\AppInfo\Application;
use OCA\JalaliCalendar\Service\ConfigService;
use OCA\JalaliCalendar\Service\UserConfigService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Services\IInitialState;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IUserSession;
use OCP\Util;

class PageController extends Controller {

	public function __construct(
		IRequest $request,
		private IInitialState $initialState,
		private IConfig $config,
		private IUserSession $userSession,
		private ConfigService $configService,
		private UserConfigService $userConfigService,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function index(): TemplateResponse {
		return $this->render(null, null);
	}

	/**
	 * Deep link into a specific Jalali month.
	 */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function month(int $jy, int $jm): TemplateResponse {
		return $this->render($jy, $jm);
	}

	private function render(?int $jy, ?int $jm): TemplateResponse {
		$userId = $this->userSession->getUser()?->getUID() ?? '';

		// Reuse the timezone the user already picked in the official Calendar
		// app, so both apps agree on what "today" means.
		$timezone = $this->config->getUserValue($userId, 'calendar', 'timezone', 'automatic');
		if ($timezone === 'automatic' || $timezone === '') {
			$timezone = $this->config->getSystemValueString('default_timezone', 'Asia/Tehran');
		}

		$this->initialState->provideInitialState('config', [
			'userId' => $userId,
			'timezone' => $timezone,
			'version' => $this->config->getAppValue(Application::APP_ID, 'installed_version', '0.0.0'),
			'initialMonth' => ($jy !== null && $jm >= 1 && $jm <= 12) ? ['jy' => $jy, 'jm' => $jm] : null,
			'firstDayOfWeek' => $this->configService->getFirstDayOfWeek(),
			'workStart' => $this->configService->getWorkStart(),
			'workEnd' => $this->configService->getWorkEnd(),
			'workDays' => $this->configService->getWorkDays(),
			'preferences' => $this->userConfigService->getAll($userId),
		]);

		Util::addTranslations(Application::APP_ID);
		// The bundle carries its own styles (see vite.config.js), so there is
		// no stylesheet to register here.
		Util::addScript(Application::APP_ID, Application::APP_ID . '-main');

		$response = new TemplateResponse(Application::APP_ID, 'main');

		// The Vue app talks to CalDAV on the same origin only; no external
		// connections are needed, so we keep the strict default CSP.
		return $response;
	}
}
