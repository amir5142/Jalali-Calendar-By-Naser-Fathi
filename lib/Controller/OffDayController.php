<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\JalaliCalendar\Controller;

use OCA\JalaliCalendar\AppInfo\Application;
use OCA\JalaliCalendar\Service\ConfigService;
use OCA\JalaliCalendar\Service\ImportService;
use OCA\JalaliCalendar\Service\OffDayService;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\OCSController;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

/**
 * Off-day management.
 *
 * Reading is open to any logged-in user, because the calendar grid needs it.
 * Everything that writes is admin-only — the default for OCSController methods
 * without #[NoAdminRequired].
 */
class OffDayController extends OCSController {

	public function __construct(
		IRequest $request,
		private OffDayService $offDayService,
		private ImportService $importService,
		private ConfigService $config,
		private LoggerInterface $logger,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/**
	 * Off-days overlapping a Gregorian window.
	 */
	#[NoAdminRequired]
	public function index(string $from = '', string $to = ''): DataResponse {
		if (!$this->isDate($from) || !$this->isDate($to)) {
			return new DataResponse(
				['message' => 'from and to must be YYYY-MM-DD dates'],
				Http::STATUS_BAD_REQUEST,
			);
		}
		if ($from > $to) {
			return new DataResponse(['message' => 'from must not be after to'], Http::STATUS_BAD_REQUEST);
		}

		return new DataResponse($this->offDayService->findInRange($from, $to));
	}

	/**
	 * Everything stored for one Jalali year — what the admin page lists.
	 */
	public function year(int $jy): DataResponse {
		return new DataResponse($this->offDayService->findByYear($jy));
	}

	public function create(int $jy, int $jm, int $jd, string $title, bool $isOff = true): DataResponse {
		try {
			$entity = $this->offDayService->set($jy, $jm, $jd, $title, $isOff);
		} catch (\InvalidArgumentException $e) {
			return new DataResponse(['message' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
		}

		return new DataResponse($entity, Http::STATUS_CREATED);
	}

	public function destroy(int $id): DataResponse {
		try {
			$this->offDayService->delete($id);
		} catch (DoesNotExistException $e) {
			return new DataResponse(['message' => 'No such off-day'], Http::STATUS_NOT_FOUND);
		}

		return new DataResponse([]);
	}

	/**
	 * @param string $provider ImportService::SOURCE_TIME_IR or SOURCE_ICS
	 * @param int $jy the Jalali year to import
	 * @param string $url required for the ICS provider
	 */
	public function import(string $provider, int $jy, string $url = ''): DataResponse {
		try {
			if ($provider === ImportService::SOURCE_TIME_IR) {
				$result = $this->importService->importFromTimeIr($jy);
			} elseif ($provider === ImportService::SOURCE_ICS) {
				$target = $url !== '' ? $url : $this->config->getImportUrl();
				if ($target === '') {
					return new DataResponse(
						['message' => 'No calendar URL given'],
						Http::STATUS_BAD_REQUEST,
					);
				}
				$result = $this->importService->importFromIcs($target, $jy);
				$this->config->setImportUrl($target);
			} else {
				return new DataResponse(['message' => 'Unknown import provider'], Http::STATUS_BAD_REQUEST);
			}
		} catch (\RuntimeException $e) {
			$this->logger->warning('[jalali_calendar] import failed: ' . $e->getMessage(), ['exception' => $e]);
			return new DataResponse(['message' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
		}

		return new DataResponse($result);
	}

	private function isDate(string $value): bool {
		if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) !== 1) {
			return false;
		}
		[$y, $m, $d] = array_map('intval', explode('-', $value));
		return checkdate($m, $d, $y);
	}
}
