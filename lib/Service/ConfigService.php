<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\JalaliCalendar\Service;

use OCA\JalaliCalendar\AppInfo\Application;
use OCP\IAppConfig;

/**
 * Instance-wide settings, all owned by the administrator.
 */
class ConfigService {

	public const FIRST_DAY = 'firstDayOfWeek';
	public const IMPORT_URL = 'importUrl';
	public const WORK_START = 'workStart';
	public const WORK_END = 'workEnd';
	public const WORK_DAYS = 'workDays';

	/** 09:00 and 17:00, as minutes from midnight. */
	private const DEFAULT_WORK_START = 540;
	private const DEFAULT_WORK_END = 1020;
	/** Saturday to Wednesday, as JS getDay() values — the Iranian work week. */
	private const DEFAULT_WORK_DAYS = '6,0,1,2,3';

	public const SATURDAY = 'saturday';
	public const SUNDAY = 'sunday';

	public function __construct(
		private IAppConfig $appConfig,
	) {
	}

	/**
	 * @return string ConfigService::SATURDAY or ConfigService::SUNDAY
	 */
	public function getFirstDayOfWeek(): string {
		$value = $this->appConfig->getValueString(Application::APP_ID, self::FIRST_DAY, self::SATURDAY);
		return $value === self::SUNDAY ? self::SUNDAY : self::SATURDAY;
	}

	/**
	 * @param string $value ConfigService::SATURDAY or ConfigService::SUNDAY
	 * @throws \InvalidArgumentException on anything else
	 */
	public function setFirstDayOfWeek(string $value): void {
		if ($value !== self::SATURDAY && $value !== self::SUNDAY) {
			throw new \InvalidArgumentException('First day of week must be "saturday" or "sunday"');
		}
		$this->appConfig->setValueString(Application::APP_ID, self::FIRST_DAY, $value);
	}

	/**
	 * @return int start of the working day, minutes from midnight
	 */
	public function getWorkStart(): int {
		return $this->clampMinutes(
			$this->appConfig->getValueInt(Application::APP_ID, self::WORK_START, self::DEFAULT_WORK_START),
			self::DEFAULT_WORK_START,
		);
	}

	/**
	 * @return int end of the working day, minutes from midnight
	 */
	public function getWorkEnd(): int {
		return $this->clampMinutes(
			$this->appConfig->getValueInt(Application::APP_ID, self::WORK_END, self::DEFAULT_WORK_END),
			self::DEFAULT_WORK_END,
		);
	}

	/**
	 * @return int[] working weekdays as JS getDay() values, 0=Sunday
	 */
	public function getWorkDays(): array {
		$raw = $this->appConfig->getValueString(Application::APP_ID, self::WORK_DAYS, self::DEFAULT_WORK_DAYS);
		$days = array_values(array_unique(array_filter(
			array_map('intval', array_filter(explode(',', $raw), static fn ($v) => $v !== '')),
			static fn (int $d): bool => $d >= 0 && $d <= 6,
		)));
		sort($days);

		return $days;
	}

	/**
	 * @param int $start minutes from midnight
	 * @param int $end minutes from midnight
	 * @throws \InvalidArgumentException when the range is not a sane day
	 */
	public function setWorkingHours(int $start, int $end): void {
		if ($start < 0 || $start > 1440 || $end < 0 || $end > 1440) {
			throw new \InvalidArgumentException('Working hours must fall within a day');
		}
		if ($start >= $end) {
			throw new \InvalidArgumentException('The working day must end after it starts');
		}

		$this->appConfig->setValueInt(Application::APP_ID, self::WORK_START, $start);
		$this->appConfig->setValueInt(Application::APP_ID, self::WORK_END, $end);
	}

	/**
	 * @param int[] $days JS getDay() values
	 */
	public function setWorkDays(array $days): void {
		$clean = array_values(array_unique(array_filter(
			array_map('intval', $days),
			static fn (int $d): bool => $d >= 0 && $d <= 6,
		)));
		sort($clean);

		$this->appConfig->setValueString(Application::APP_ID, self::WORK_DAYS, implode(',', $clean));
	}

	/**
	 * @param int $value candidate minutes
	 * @param int $fallback value to use when out of range
	 * @return int
	 */
	private function clampMinutes(int $value, int $fallback): int {
		return ($value >= 0 && $value <= 1440) ? $value : $fallback;
	}

	public function getImportUrl(): string {
		return $this->appConfig->getValueString(Application::APP_ID, self::IMPORT_URL, '');
	}

	public function setImportUrl(string $url): void {
		$this->appConfig->setValueString(Application::APP_ID, self::IMPORT_URL, trim($url));
	}

	/**
	 * Everything the admin page needs in one call.
	 *
	 * @return array<string, mixed>
	 */
	public function getAdminState(): array {
		return [
			'firstDayOfWeek' => $this->getFirstDayOfWeek(),
			'importUrl' => $this->getImportUrl(),
			'workStart' => $this->getWorkStart(),
			'workEnd' => $this->getWorkEnd(),
			'workDays' => $this->getWorkDays(),
		];
	}
}
