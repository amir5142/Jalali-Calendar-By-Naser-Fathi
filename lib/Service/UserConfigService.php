<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\JalaliCalendar\Service;

use OCA\JalaliCalendar\AppInfo\Application;
use OCP\IConfig;

/**
 * Per-user display preferences.
 *
 * These mirror the ones the official Calendar app offers, minus everything that
 * only means something when you can create events.
 */
class UserConfigService {

	public const SHOW_TASKS = 'showTasks';
	public const LIMIT_MONTH_EVENTS = 'limitMonthEvents';
	public const SHOW_WEEKENDS = 'showWeekends';
	public const SHOW_WEEK_NUMBERS = 'showWeekNumbers';
	public const SLOT_DURATION = 'slotDuration';
	public const GLOBAL_PICKER = 'globalPicker';

	/** Minutes per row in the day and week grids. */
	public const SLOT_DURATIONS = [15, 30, 60];

	private const DEFAULTS = [
		self::SHOW_TASKS => true,
		self::LIMIT_MONTH_EVENTS => true,
		self::SHOW_WEEKENDS => true,
		self::SHOW_WEEK_NUMBERS => false,
		// On by default: the picker is the only way to enter a Shamsi date in
		// apps like Deck, and it is what most people install this app for.
		self::GLOBAL_PICKER => true,
	];

	private const DEFAULT_SLOT = 30;

	public function __construct(
		private IConfig $config,
	) {
	}

	/**
	 * @param string $userId the user to read for
	 * @return array<string, mixed>
	 */
	public function getAll(string $userId): array {
		$state = [];
		foreach (self::DEFAULTS as $key => $default) {
			$state[$key] = $this->getBool($userId, $key, $default);
		}
		$state[self::SLOT_DURATION] = $this->getSlotDuration($userId);

		return $state;
	}

	/**
	 * @param string $userId the user to read for
	 * @param string $key one of the class constants
	 * @param bool $default value when unset
	 * @return bool
	 */
	private function getBool(string $userId, string $key, bool $default): bool {
		$raw = $this->config->getUserValue($userId, Application::APP_ID, $key, $default ? '1' : '0');
		return $raw === '1';
	}

	/**
	 * Whether to load the Shamsi picker on every page for this user.
	 *
	 * Read on every single page render, so it stays a lone user-value lookup
	 * rather than going through getAll().
	 *
	 * @param string $userId the user to read for
	 * @return bool
	 */
	public function isGlobalPickerEnabled(string $userId): bool {
		return $this->getBool($userId, self::GLOBAL_PICKER, self::DEFAULTS[self::GLOBAL_PICKER]);
	}

	/**
	 * @param string $userId the user to read for
	 * @return int minutes per grid row
	 */
	public function getSlotDuration(string $userId): int {
		$raw = (int)$this->config->getUserValue(
			$userId,
			Application::APP_ID,
			self::SLOT_DURATION,
			(string)self::DEFAULT_SLOT,
		);

		return in_array($raw, self::SLOT_DURATIONS, true) ? $raw : self::DEFAULT_SLOT;
	}

	/**
	 * Apply a partial update. Only keys actually present are written, so the
	 * page can save one toggle without echoing the rest back.
	 *
	 * @param string $userId the user to write for
	 * @param array<string, mixed> $values partial settings
	 * @throws \InvalidArgumentException on an unusable slot duration
	 */
	public function update(string $userId, array $values): void {
		foreach (array_keys(self::DEFAULTS) as $key) {
			if (!array_key_exists($key, $values) || $values[$key] === null) {
				continue;
			}
			$this->config->setUserValue(
				$userId,
				Application::APP_ID,
				$key,
				filter_var($values[$key], FILTER_VALIDATE_BOOLEAN) ? '1' : '0',
			);
		}

		if (array_key_exists(self::SLOT_DURATION, $values) && $values[self::SLOT_DURATION] !== null) {
			$slot = (int)$values[self::SLOT_DURATION];
			if (!in_array($slot, self::SLOT_DURATIONS, true)) {
				throw new \InvalidArgumentException(
					'Time increments must be one of: ' . implode(', ', self::SLOT_DURATIONS),
				);
			}
			$this->config->setUserValue($userId, Application::APP_ID, self::SLOT_DURATION, (string)$slot);
		}
	}
}
