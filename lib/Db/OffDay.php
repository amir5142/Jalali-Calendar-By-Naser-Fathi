<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Naser Fathi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\JalaliCalendar\Db;

use OCP\AppFramework\Db\Entity;

/**
 * @method string getGdate()
 * @method void setGdate(string $gdate)
 * @method int getJy()
 * @method void setJy(int $jy)
 * @method int getJm()
 * @method void setJm(int $jm)
 * @method int getJd()
 * @method void setJd(int $jd)
 * @method string getTitle()
 * @method void setTitle(string $title)
 * @method bool getIsOff()
 * @method void setIsOff(bool $isOff)
 * @method string getSource()
 * @method void setSource(string $source)
 */
class OffDay extends Entity implements \JsonSerializable {

	protected string $gdate = '';
	protected int $jy = 0;
	protected int $jm = 0;
	protected int $jd = 0;
	protected string $title = '';
	protected bool $isOff = true;
	protected string $source = 'manual';

	public function __construct() {
		$this->addType('jy', 'integer');
		$this->addType('jm', 'integer');
		$this->addType('jd', 'integer');
		$this->addType('isOff', 'boolean');
	}

	public function jsonSerialize(): array {
		return [
			'id' => $this->getId(),
			'gdate' => $this->gdate,
			'jy' => $this->jy,
			'jm' => $this->jm,
			'jd' => $this->jd,
			'title' => $this->title,
			'isOff' => $this->isOff,
			'source' => $this->source,
		];
	}
}
