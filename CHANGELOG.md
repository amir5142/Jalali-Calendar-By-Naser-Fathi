<!--
  - SPDX-FileCopyrightText: 2026 Naser Fathi
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-30

First release — read-only Jalali month view.

### Added

- Jalali (Shamsi) month grid: six weeks, Saturday-first, Persian numerals,
  correct Shamsi month and weekday names, RTL layout.
- Reads the user's existing CalDAV calendars through
  `@nextcloud/cdav-library`, against the same `/remote.php/dav` endpoint the
  official Calendar app uses. Nothing is stored by this app.
- Per-calendar colours plus show/hide toggles, remembered in the browser.
  Calendars disabled in the Calendar app start hidden here too.
- Recurring events expanded within the visible window, honouring `EXDATE`,
  modified occurrences and detached occurrences whose master lives elsewhere.
- Day panel listing a day's events with time, location, calendar and
  description; multi-day events describe themselves relative to the day shown.
- Month navigation, a "today" button that also survives midnight, and
  `/apps/jalali_calendar/{jy}/{jm}` deep links.
- Farsi translation.
- Partial-failure handling: one unreachable or malformed calendar no longer
  blanks the whole month, it is reported instead.

### Known limitations

- Event times render in the browser's timezone, not the calendar's configured
  timezone. The app shows a notice when the two differ.
- Read-only; create/edit/delete happen in the official Calendar app.
- Month view only — no week or day view yet.
- No Iranian holidays overlay yet.

[Unreleased]: https://github.com/naserfathi/jalali_calendar/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/naserfathi/jalali_calendar/releases/tag/v0.1.0
