<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\JalaliCalendar\Settings;

use OCA\JalaliCalendar\AppInfo\Application;
use OCA\JalaliCalendar\Service\UserConfigService;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Services\IInitialState;
use OCP\IURLGenerator;
use OCP\IUserSession;
use OCP\Settings\ISettings;
use OCP\Util;

class PersonalSettings implements ISettings {

	public function __construct(
		private IInitialState $initialState,
		private UserConfigService $userConfig,
		private IUserSession $userSession,
		private IURLGenerator $urlGenerator,
	) {
	}

	public function getForm(): TemplateResponse {
		$userId = $this->userSession->getUser()?->getUID() ?? '';

		$this->initialState->provideInitialState('personal', array_merge(
			$this->userConfig->getAll($userId),
			[
				// Handed over ready-made so the page never has to guess at the
				// instance's URL layout.
				'davUrl' => $this->urlGenerator->getAbsoluteURL(
					$this->urlGenerator->linkTo('', 'remote.php') . '/dav',
				),
				'davPrincipalUrl' => $this->urlGenerator->getAbsoluteURL(
					$this->urlGenerator->linkTo('', 'remote.php') . '/dav/principals/users/' . rawurlencode($userId),
				),
				'availabilityUrl' => $this->urlGenerator->linkToRoute('settings.PersonalSettings.index', [
					'section' => 'availability',
				]),
			],
		));

		Util::addTranslations(Application::APP_ID);
		Util::addScript(Application::APP_ID, Application::APP_ID . '-personal');

		return new TemplateResponse(Application::APP_ID, 'personal', [], TemplateResponse::RENDER_AS_BLANK);
	}

	public function getSection(): string {
		return Application::APP_ID;
	}

	public function getPriority(): int {
		return 50;
	}
}
