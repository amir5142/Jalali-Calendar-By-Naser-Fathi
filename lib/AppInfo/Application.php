<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\JalaliCalendar\AppInfo;

use OCA\JalaliCalendar\Listener\AddScriptListener;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;

class Application extends App implements IBootstrap {
	public const APP_ID = 'jalali_calendar';

	public function __construct(array $urlParams = []) {
		parent::__construct(self::APP_ID, $urlParams);
	}

	public function register(IRegistrationContext $context): void {
		// Calendar traffic goes straight from the browser to CalDAV
		// (/remote.php/dav), so the app needs nothing wired up for its own page.
		//
		// The one exception is the Shamsi date picker: native date inputs are
		// drawn by the browser and are always Gregorian, so offering Jalali in
		// apps like Deck means getting a small script onto their pages.
		$context->registerEventListener(
			BeforeTemplateRenderedEvent::class,
			AddScriptListener::class,
		);
	}

	public function boot(IBootContext $context): void {
	}
}
