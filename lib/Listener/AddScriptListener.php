<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\JalaliCalendar\Listener;

use OCA\JalaliCalendar\AppInfo\Application;
use OCA\JalaliCalendar\Service\UserConfigService;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\IUserSession;
use OCP\Util;

/**
 * Puts the Shamsi date picker on every logged-in page.
 *
 * This is the only part of the app that runs outside its own routes, and it
 * exists so date fields in *other* apps — Deck due dates above all — can offer
 * a Jalali calendar. The script it loads is a separate, minimal bundle; the
 * calendar page's own bundle is far too large to put on every page.
 *
 * @template-implements IEventListener<BeforeTemplateRenderedEvent>
 */
class AddScriptListener implements IEventListener {

	public function __construct(
		private IUserSession $userSession,
		private UserConfigService $userConfig,
	) {
	}

	public function handle(Event $event): void {
		if (!($event instanceof BeforeTemplateRenderedEvent)) {
			return;
		}

		// Public shares and the login page render no date fields worth
		// enhancing, and injecting there would only widen the blast radius.
		if (!$event->isLoggedIn()) {
			return;
		}

		$userId = $this->userSession->getUser()?->getUID();
		if ($userId === null) {
			return;
		}

		// Checked here rather than in the browser so opting out means the
		// script is never delivered at all. A user who does not want our
		// JavaScript on unrelated pages is not served by shipping it and then
		// having it decline to run.
		if (!$this->userConfig->isGlobalPickerEnabled($userId)) {
			return;
		}

		Util::addScript(Application::APP_ID, Application::APP_ID . '-inputs');
	}
}
